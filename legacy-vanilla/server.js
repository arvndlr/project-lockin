const path = require("path");
const express = require("express");
const http = require("http");
const session = require("express-session");
const QRCode = require("qrcode");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");

const store = require("./lib/db");
const { attachUser, requireRole, verifyLogin, publicUser } = require("./lib/auth");
const { isScheduleActive, isStudentAccessActive } = require("./lib/scheduling");
const { allSlotStatuses, slotStatus, evaluateScan, confirmScan } = require("./lib/locker");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(
  session({
    secret: "lockin-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 },
  })
);
app.use(attachUser(store));
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function slotOverview() {
  const db = store.get();
  const statuses = allSlotStatuses(db);
  return db.slots.map((slot) => {
    const status = statuses[slot.id];
    const occupant = status.occupied ? db.users.find((u) => u.id === status.byStudentId) : null;
    return {
      id: slot.id,
      label: slot.label,
      occupied: status.occupied,
      occupantName: occupant ? occupant.name : null,
      since: status.since,
    };
  });
}

function broadcastSlots() {
  slotOverview().then((overview) => io.emit("slots:update", overview));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = verifyLogin(store, username, password);
  if (!user) return res.status(401).json({ ok: false, reason: "Invalid username or password." });
  req.session.userId = user.id;
  res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ ok: true, user: publicUser(req.user) });
});

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------
app.get("/api/admin/users", requireRole("admin"), (req, res) => {
  res.json(store.get().users.map(publicUser));
});

app.post("/api/admin/users", requireRole("admin"), (req, res) => {
  const { role, name, username, password, slotId, scheduleId } = req.body || {};
  const db = store.get();

  if (!["student", "teacher"].includes(role)) {
    return res.status(400).json({ ok: false, reason: "Role must be student or teacher." });
  }
  if (!name || !username || !password) {
    return res.status(400).json({ ok: false, reason: "Name, username, and password are required." });
  }
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ ok: false, reason: "Username already taken." });
  }

  const user = {
    id: store.newId("usr"),
    role,
    name,
    username,
    passwordHash: bcrypt.hashSync(password, 8),
    createdAt: Date.now(),
  };

  if (role === "student") {
    let assignedSlotId = slotId || null;
    if (!assignedSlotId) {
      const takenSlotIds = new Set(
        db.users.filter((u) => u.role === "student" && u.slotId).map((u) => u.slotId)
      );
      const free = db.slots.find((s) => !takenSlotIds.has(s.id));
      assignedSlotId = free ? free.id : null;
    }
    user.qrToken = store.newQrToken();
    user.slotId = assignedSlotId;
    user.scheduleId = scheduleId || null;
  }

  db.users.push(user);
  store.persist();
  res.json({ ok: true, user: publicUser(user) });
});

app.patch("/api/admin/users/:id", requireRole("admin"), (req, res) => {
  const db = store.get();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ ok: false, reason: "User not found." });

  if (user.role === "student") {
    if ("slotId" in req.body) user.slotId = req.body.slotId || null;
    if ("scheduleId" in req.body) user.scheduleId = req.body.scheduleId || null;
  }
  store.persist();
  res.json({ ok: true, user: publicUser(user) });
});

app.delete("/api/admin/users/:id", requireRole("admin"), (req, res) => {
  const db = store.get();
  if (req.params.id === req.user.id) {
    return res.status(400).json({ ok: false, reason: "You can't delete your own account." });
  }
  db.users = db.users.filter((u) => u.id !== req.params.id);
  store.persist();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin: slot (locker) management
// ---------------------------------------------------------------------------
app.get("/api/admin/slots", requireRole("admin", "teacher"), async (req, res) => {
  const db = store.get();
  const overview = await slotOverview();
  const withQr = await Promise.all(
    db.slots.map(async (slot, i) => ({
      ...overview[i],
      qrToken: slot.qrToken,
      qrImage: await QRCode.toDataURL(slot.qrToken, { margin: 1, width: 180 }),
    }))
  );
  res.json(withQr);
});

app.post("/api/admin/slots", requireRole("admin"), (req, res) => {
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ ok: false, reason: "Label is required." });
  const db = store.get();
  const slot = { id: store.newId("slot"), label, qrToken: store.newQrToken(), createdAt: Date.now() };
  db.slots.push(slot);
  store.persist();
  res.json({ ok: true, slot });
});

app.delete("/api/admin/slots/:id", requireRole("admin"), (req, res) => {
  const db = store.get();
  const inUse = db.users.some((u) => u.role === "student" && u.slotId === req.params.id);
  if (inUse) return res.status(400).json({ ok: false, reason: "Locker is assigned to a student." });
  db.slots = db.slots.filter((s) => s.id !== req.params.id);
  store.persist();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin: schedule management
// ---------------------------------------------------------------------------
app.get("/api/admin/schedules", requireRole("admin", "teacher"), (req, res) => {
  const db = store.get();
  res.json(
    db.schedules.map((s) => ({
      ...s,
      teacherName: (db.users.find((u) => u.id === s.teacherId) || {}).name || "Unassigned",
      activeNow: isScheduleActive(s),
    }))
  );
});

app.post("/api/admin/schedules", requireRole("admin"), (req, res) => {
  const { teacherId, sectionLabel, days, startTime, endTime } = req.body || {};
  const db = store.get();

  if (!teacherId || !sectionLabel || !Array.isArray(days) || days.length === 0 || !startTime || !endTime) {
    return res.status(400).json({ ok: false, reason: "All schedule fields are required." });
  }
  if (!db.users.some((u) => u.id === teacherId && u.role === "teacher")) {
    return res.status(400).json({ ok: false, reason: "Unknown teacher." });
  }

  const schedule = {
    id: store.newId("sch"),
    teacherId,
    sectionLabel,
    days: days.map(Number),
    startTime,
    endTime,
    createdAt: Date.now(),
  };
  db.schedules.push(schedule);
  store.persist();
  res.json({ ok: true, schedule });
});

app.patch("/api/admin/schedules/:id", requireRole("admin"), (req, res) => {
  const db = store.get();
  const schedule = db.schedules.find((s) => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ ok: false, reason: "Schedule not found." });

  const { teacherId, sectionLabel, days, startTime, endTime } = req.body || {};

  if (teacherId) {
    if (!db.users.some((u) => u.id === teacherId && u.role === "teacher")) {
      return res.status(400).json({ ok: false, reason: "Unknown teacher." });
    }
    schedule.teacherId = teacherId;
  }
  if (sectionLabel) schedule.sectionLabel = sectionLabel;
  if (Array.isArray(days) && days.length) schedule.days = days.map(Number);
  if (startTime) schedule.startTime = startTime;
  if (endTime) schedule.endTime = endTime;

  store.persist();
  res.json({ ok: true, schedule });
});

app.delete("/api/admin/schedules/:id", requireRole("admin"), (req, res) => {
  const db = store.get();
  const inUse = db.users.some((u) => u.scheduleId === req.params.id);
  if (inUse) return res.status(400).json({ ok: false, reason: "Schedule is assigned to a student." });
  db.schedules = db.schedules.filter((s) => s.id !== req.params.id);
  store.persist();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Student: personal QR + status
// ---------------------------------------------------------------------------
app.get("/api/student/me", requireRole("student"), async (req, res) => {
  const db = store.get();
  const student = req.user;
  const slot = db.slots.find((s) => s.id === student.slotId) || null;
  const schedule = db.schedules.find((s) => s.id === student.scheduleId) || null;
  const status = slot ? slotStatus(db, slot.id) : { occupied: false };
  const qrImage = await QRCode.toDataURL(student.qrToken, { margin: 1, width: 260 });

  const myLogs = db.logs.filter((l) => l.studentId === student.id).slice(0, 15);

  res.json({
    name: student.name,
    qrImage,
    slotLabel: slot ? slot.label : null,
    scheduleLabel: schedule ? schedule.sectionLabel : "Always available",
    accessActive: isStudentAccessActive(student, db.schedules),
    phoneDeposited: status.occupied && status.byStudentId === student.id,
    logs: myLogs,
  });
});

// ---------------------------------------------------------------------------
// Kiosk: QR scan flow (shared physical station, not tied to a personal login —
// the printed/displayed QR itself is the credential, mirroring a badge tap)
// ---------------------------------------------------------------------------
app.get("/api/kiosk/students", (req, res) => {
  // Demo/testing aid only, for use when no camera is available.
  const db = store.get();
  res.json(
    db.users
      .filter((u) => u.role === "student")
      .map((u) => ({ id: u.id, name: u.name, qrToken: u.qrToken }))
  );
});

app.post("/api/kiosk/scan", (req, res) => {
  const { qrToken } = req.body || {};
  if (!qrToken) return res.status(400).json({ ok: false, reason: "Missing QR token." });
  const db = store.get();
  const result = evaluateScan(db, qrToken);
  if (result.intrusion) {
    store.persist();
    io.emit("log:new", result.intrusion);
    io.emit("intrusion:new", result.intrusion);
  }
  if (result.student) result.student = publicUser(result.student);
  res.json(result);
});

app.post("/api/kiosk/confirm", (req, res) => {
  const { qrToken, action, correct } = req.body || {};
  const db = store.get();
  const result = confirmScan(db, { qrToken, action, correct: !!correct });
  if (result.ok) {
    store.persist();
    io.emit("log:new", result.entry);
    if (result.entry.type === "intrusion") io.emit("intrusion:new", result.entry);
    broadcastSlots();
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// Teacher: overview, logs, override
// ---------------------------------------------------------------------------
app.get("/api/teacher/overview", requireRole("teacher", "admin"), async (req, res) => {
  const db = store.get();
  const overview = await slotOverview();
  let myActiveSchedule = null;
  if (req.user.role === "teacher") {
    myActiveSchedule = db.schedules.find((s) => s.teacherId === req.user.id && isScheduleActive(s)) || null;
  }
  res.json({ slots: overview, myActiveSchedule });
});

app.get("/api/teacher/logs", requireRole("teacher", "admin"), (req, res) => {
  res.json(store.get().logs.slice(0, 300));
});

app.post("/api/teacher/logs/:id/ack", requireRole("teacher", "admin"), (req, res) => {
  const db = store.get();
  const entry = db.logs.find((l) => l.id === req.params.id);
  if (!entry) return res.status(404).json({ ok: false, reason: "Log not found." });
  entry.acknowledged = true;
  store.persist();
  io.emit("log:update", entry);
  res.json({ ok: true, entry });
});

app.post("/api/teacher/override", requireRole("teacher"), (req, res) => {
  const { slotId, action } = req.body || {};
  const db = store.get();
  const hasControl = db.schedules.some((s) => s.teacherId === req.user.id && isScheduleActive(s));
  if (!hasControl) {
    return res.status(403).json({ ok: false, reason: "You have no active class period right now." });
  }
  const slot = db.slots.find((s) => s.id === slotId);
  if (!slot) return res.status(404).json({ ok: false, reason: "Locker not found." });

  const entry = {
    id: store.newId("log"),
    type: "override",
    studentId: null,
    studentName: `Teacher override (${req.user.name})`,
    slotId: slot.id,
    slotLabel: slot.label,
    scheduleId: null,
    timestamp: Date.now(),
    note: `Manual ${action === "lock" ? "lock" : "unlock"} by ${req.user.name}`,
  };
  db.logs.unshift(entry);
  store.persist();
  io.emit("log:new", entry);
  broadcastSlots();
  res.json({ ok: true, entry });
});

io.on("connection", (socket) => {
  slotOverview().then((overview) => socket.emit("slots:update", overview));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Project LockIn running at http://localhost:${PORT}`);
  console.log("Seeded logins — admin/admin123, teacher1/teacher123, student1-3/student123");
});

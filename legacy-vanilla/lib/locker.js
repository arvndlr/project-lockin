const { newId } = require("./db");
const { isStudentAccessActive } = require("./scheduling");

// Occupancy is derived from the log history rather than stored separately: the
// most recent deposit/retrieve entry for a slot tells us its current state.
function slotStatus(store, slotId) {
  const entry = store.logs
    .filter((l) => l.slotId === slotId && (l.type === "deposit" || l.type === "retrieve"))
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!entry || entry.type === "retrieve") {
    return { occupied: false, byStudentId: null, since: entry ? entry.timestamp : null };
  }
  return { occupied: true, byStudentId: entry.studentId, since: entry.timestamp };
}

function allSlotStatuses(store) {
  const map = {};
  store.slots.forEach((slot) => {
    map[slot.id] = slotStatus(store, slot.id);
  });
  return map;
}

function findStudentByToken(store, qrToken) {
  return store.users.find((u) => u.role === "student" && u.qrToken === qrToken);
}

// Step 1: validate the scan and figure out what action it would perform, without
// writing anything yet — the kiosk shows a confirm screen before we commit.
function evaluateScan(store, qrToken) {
  const student = findStudentByToken(store, qrToken);
  if (!student) {
    return { ok: false, reason: "QR code not recognized." };
  }

  if (!student.slotId) {
    return { ok: false, reason: `${student.name} has no locker assigned. See the admin.` };
  }

  if (!isStudentAccessActive(student, store.schedules)) {
    return {
      ok: false,
      reason: "No active class period right now — locker access is closed.",
      student,
    };
  }

  const slot = store.slots.find((s) => s.id === student.slotId);
  if (!slot) {
    return { ok: false, reason: "Assigned locker no longer exists. See the admin." };
  }

  const status = slotStatus(store, slot.id);

  if (status.occupied && status.byStudentId !== student.id) {
    // Someone else's phone is where this student's should be (or is) — the system
    // has no camera/weight sensor here, so this is flagged automatically rather
    // than asked as a yes/no confirmation.
    const conflictEntry = {
      id: newId("log"),
      type: "intrusion",
      studentId: student.id,
      studentName: student.name,
      slotId: slot.id,
      slotLabel: slot.label,
      scheduleId: student.scheduleId,
      timestamp: Date.now(),
      note: "Locker already held another student's phone when scanned.",
    };
    store.logs.unshift(conflictEntry);
    return { ok: false, reason: "Locker conflict detected. Please see your teacher.", intrusion: conflictEntry };
  }

  const action = status.occupied ? "retrieve" : "deposit";
  return { ok: true, student, slot, action };
}

// Step 2: commit the outcome once the kiosk confirms whether the phone matched.
function confirmScan(store, { qrToken, action, correct }) {
  const student = findStudentByToken(store, qrToken);
  const slot = student && store.slots.find((s) => s.id === student.slotId);
  if (!student || !slot) return { ok: false, reason: "Scan session expired." };

  const entry = {
    id: newId("log"),
    type: correct ? action : "intrusion",
    studentId: student.id,
    studentName: student.name,
    slotId: slot.id,
    slotLabel: slot.label,
    scheduleId: student.scheduleId,
    timestamp: Date.now(),
    note: correct
      ? null
      : `Student reported the phone in ${slot.label} was not theirs during a ${action}.`,
  };
  store.logs.unshift(entry);
  return { ok: true, entry };
}

module.exports = { slotStatus, allSlotStatuses, findStudentByToken, evaluateScan, confirmScan };

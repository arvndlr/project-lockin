import { Router } from "express";
import { prisma } from "../db";
import { requireRole } from "../auth";
import { isScheduleActive } from "../lib/scheduling";
import { slotOverview, depositSessionStatus, startDepositSession, stopDepositSession } from "../lib/locker";
import { getIo } from "../socket";

export const teacherRouter = Router();

teacherRouter.get("/overview", requireRole("TEACHER", "ADMIN"), async (req, res) => {
  const [slots, depositSession] = await Promise.all([slotOverview(), depositSessionStatus()]);
  let myActiveSchedule = null;
  if (req.user!.role === "TEACHER") {
    const schedules = await prisma.schedule.findMany({ where: { teacherId: req.user!.id } });
    myActiveSchedule = schedules.find((s) => isScheduleActive(s)) ?? null;
  }
  res.json({ slots, myActiveSchedule, depositSession });
});

teacherRouter.get("/logs", requireRole("TEACHER", "ADMIN"), async (_req, res) => {
  const logs = await prisma.log.findMany({ orderBy: { timestamp: "desc" }, take: 300 });
  res.json(logs);
});

teacherRouter.post("/logs/:id/ack", requireRole("TEACHER", "ADMIN"), async (req, res) => {
  const entry = await prisma.log.update({
    where: { id: req.params.id },
    data: { acknowledged: true },
  }).catch(() => null);
  if (!entry) return res.status(404).json({ ok: false, reason: "Log not found." });
  getIo().emit("log:update", entry);
  res.json({ ok: true, entry });
});

teacherRouter.post("/override", requireRole("TEACHER"), async (req, res) => {
  const { slotId, action } = req.body || {};
  const schedules = await prisma.schedule.findMany({ where: { teacherId: req.user!.id } });
  const hasControl = schedules.some((s) => isScheduleActive(s));
  if (!hasControl) {
    return res.status(403).json({ ok: false, reason: "You have no active class period right now." });
  }
  const slot = await prisma.slot.findUnique({ where: { id: slotId } });
  if (!slot) return res.status(404).json({ ok: false, reason: "Locker not found." });

  const entry = await prisma.log.create({
    data: {
      type: "OVERRIDE",
      studentName: `Teacher override (${req.user!.name})`,
      slotId: slot.id,
      slotLabel: slot.label,
      note: `Manual ${action === "lock" ? "lock" : "unlock"} by ${req.user!.name}`,
    },
  });
  const io = getIo();
  io.emit("log:new", entry);
  io.emit("slots:update", await slotOverview());
  res.json({ ok: true, entry });
});

// ---------------------------------------------------------------------------
// Deposit collection session — "unlock/lock the cabinet" for the start of
// class, where students deposit phones one at a time.
// ---------------------------------------------------------------------------
teacherRouter.post("/deposit-session/start", requireRole("TEACHER"), async (req, res) => {
  const schedules = await prisma.schedule.findMany({ where: { teacherId: req.user!.id } });
  const active = schedules.find((s) => isScheduleActive(s));
  if (!active) {
    return res.status(403).json({ ok: false, reason: "You have no active class period right now." });
  }

  const current = await depositSessionStatus();
  if (current.open) {
    return res.status(400).json({ ok: false, reason: "A collection session is already open." });
  }

  await startDepositSession(req.user!.id, active.id);

  const entry = await prisma.log.create({
    data: {
      type: "OVERRIDE",
      studentName: `Teacher (${req.user!.name})`,
      note: `Deposit collection started for ${active.sectionLabel} by ${req.user!.name}.`,
    },
  });
  const io = getIo();
  io.emit("log:new", entry);
  io.emit("session:update", await depositSessionStatus());
  res.json({ ok: true, session: await depositSessionStatus() });
});

teacherRouter.post("/deposit-session/stop", requireRole("TEACHER"), async (req, res) => {
  const current = await depositSessionStatus();
  if (!current.open) {
    return res.status(400).json({ ok: false, reason: "No collection session is currently open." });
  }

  await stopDepositSession();

  const entry = await prisma.log.create({
    data: {
      type: "OVERRIDE",
      studentName: `Teacher (${req.user!.name})`,
      note: `Deposit collection ended by ${req.user!.name}.`,
    },
  });
  const io = getIo();
  io.emit("log:new", entry);
  io.emit("session:update", await depositSessionStatus());
  res.json({ ok: true, session: await depositSessionStatus() });
});

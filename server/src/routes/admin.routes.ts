import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { requireRole, toPublicUser } from "../auth";
import { newQrToken } from "../lib/tokens";
import { isScheduleActive } from "../lib/scheduling";
import { slotOverview } from "../lib/locker";
import { qrDataUrl } from "../lib/qr";
import { renderCardSheet } from "../lib/cards";

export const adminRouter = Router();

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
adminRouter.get("/users", requireRole("ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  res.json(users.map(toPublicUser));
});

adminRouter.post("/users", requireRole("ADMIN"), async (req, res) => {
  const { role, name, username, password, slotId, scheduleId } = req.body || {};

  if (!["STUDENT", "TEACHER"].includes(role)) {
    return res.status(400).json({ ok: false, reason: "Role must be student or teacher." });
  }
  if (!name || !username || !password) {
    return res.status(400).json({ ok: false, reason: "Name, username, and password are required." });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(400).json({ ok: false, reason: "Username already taken." });

  const passwordHash = await bcrypt.hash(password, 8);
  const data: Parameters<typeof prisma.user.create>[0]["data"] = { role, name, username, passwordHash };

  if (role === "STUDENT") {
    let assignedSlotId: string | null = slotId || null;
    if (!assignedSlotId) {
      const taken = await prisma.user.findMany({
        where: { role: "STUDENT", slotId: { not: null } },
        select: { slotId: true },
      });
      const takenIds = taken.map((u) => u.slotId).filter((id): id is string => !!id);
      const free = await prisma.slot.findFirst({
        where: takenIds.length ? { id: { notIn: takenIds } } : {},
        orderBy: { createdAt: "asc" },
      });
      assignedSlotId = free?.id ?? null;
    }
    data.qrToken = newQrToken();
    data.slotId = assignedSlotId;
    data.scheduleId = scheduleId || null;
  }

  const user = await prisma.user.create({ data });
  res.json({ ok: true, user: toPublicUser(user) });
});

adminRouter.patch("/users/:id", requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ ok: false, reason: "User not found." });
  if (user.role !== "STUDENT") return res.json({ ok: true, user: toPublicUser(user) });

  const data: { slotId?: string | null; scheduleId?: string | null } = {};
  if ("slotId" in req.body) data.slotId = req.body.slotId || null;
  if ("scheduleId" in req.body) data.scheduleId = req.body.scheduleId || null;

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  res.json({ ok: true, user: toPublicUser(updated) });
});

adminRouter.delete("/users/:id", requireRole("ADMIN"), async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ ok: false, reason: "You can't delete your own account." });
  }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ ok: false, reason: "This teacher still has schedules assigned. Delete those first." });
  }
});

// ---------------------------------------------------------------------------
// Slots (lockers)
// ---------------------------------------------------------------------------
adminRouter.get("/slots", requireRole("ADMIN", "TEACHER"), async (_req, res) => {
  const overview = await slotOverview(true);
  const withQr = await Promise.all(
    overview.map(async (row) => ({
      ...row,
      qrImage: await qrDataUrl(row.qrToken!, 180),
    }))
  );
  res.json(withQr);
});

adminRouter.post("/slots", requireRole("ADMIN"), async (req, res) => {
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ ok: false, reason: "Label is required." });
  const slot = await prisma.slot.create({ data: { label, qrToken: newQrToken() } });
  res.json({ ok: true, slot });
});

adminRouter.delete("/slots/:id", requireRole("ADMIN"), async (req, res) => {
  const inUse = await prisma.user.findFirst({ where: { role: "STUDENT", slotId: req.params.id } });
  if (inUse) return res.status(400).json({ ok: false, reason: "Locker is assigned to a student." });
  try {
    await prisma.slot.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ ok: false, reason: "Locker not found." });
  }
});

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------
adminRouter.get("/schedules", requireRole("ADMIN", "TEACHER"), async (_req, res) => {
  const schedules = await prisma.schedule.findMany({
    orderBy: { createdAt: "asc" },
    include: { teacher: true },
  });
  res.json(
    schedules.map((s) => ({
      id: s.id,
      teacherId: s.teacherId,
      sectionLabel: s.sectionLabel,
      days: s.days,
      startTime: s.startTime,
      endTime: s.endTime,
      createdAt: s.createdAt,
      teacherName: s.teacher?.name ?? "Unassigned",
      activeNow: isScheduleActive(s),
    }))
  );
});

adminRouter.post("/schedules", requireRole("ADMIN"), async (req, res) => {
  const { teacherId, sectionLabel, days, startTime, endTime } = req.body || {};

  if (!teacherId || !sectionLabel || !Array.isArray(days) || days.length === 0 || !startTime || !endTime) {
    return res.status(400).json({ ok: false, reason: "All schedule fields are required." });
  }
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, role: "TEACHER" } });
  if (!teacher) return res.status(400).json({ ok: false, reason: "Unknown teacher." });

  const schedule = await prisma.schedule.create({
    data: { teacherId, sectionLabel, days: days.map(Number), startTime, endTime },
  });
  res.json({ ok: true, schedule });
});

adminRouter.patch("/schedules/:id", requireRole("ADMIN"), async (req, res) => {
  const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
  if (!schedule) return res.status(404).json({ ok: false, reason: "Schedule not found." });

  const { teacherId, sectionLabel, days, startTime, endTime } = req.body || {};
  const data: Record<string, unknown> = {};

  if (teacherId) {
    const teacher = await prisma.user.findFirst({ where: { id: teacherId, role: "TEACHER" } });
    if (!teacher) return res.status(400).json({ ok: false, reason: "Unknown teacher." });
    data.teacherId = teacherId;
  }
  if (sectionLabel) data.sectionLabel = sectionLabel;
  if (Array.isArray(days) && days.length) data.days = days.map(Number);
  if (startTime) data.startTime = startTime;
  if (endTime) data.endTime = endTime;

  const updated = await prisma.schedule.update({ where: { id: req.params.id }, data });
  res.json({ ok: true, schedule: updated });
});

adminRouter.delete("/schedules/:id", requireRole("ADMIN"), async (req, res) => {
  const inUse = await prisma.user.findFirst({ where: { scheduleId: req.params.id } });
  if (inUse) return res.status(400).json({ ok: false, reason: "Schedule is assigned to a student." });
  try {
    await prisma.schedule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ ok: false, reason: "Schedule not found." });
  }
});

// ---------------------------------------------------------------------------
// Printable student ID cards
// ---------------------------------------------------------------------------
// Served as a standalone HTML page rather than a React screen: it exists to be
// sent to a printer at an exact physical size, which is awkward to guarantee
// from inside the SPA's layout. Open it in a tab and print.
adminRouter.get("/cards", requireRole("ADMIN"), async (_req, res) => {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", qrToken: { not: null } },
    orderBy: { name: "asc" },
    include: { slot: true, schedule: true },
  });

  const html = await renderCardSheet(
    students.map((s) => ({
      name: s.name,
      qrToken: s.qrToken!,
      slotLabel: s.slot?.label ?? null,
      sectionLabel: s.schedule?.sectionLabel ?? null,
    }))
  );

  res.type("html").send(html);
});

import { Router } from "express";
import { prisma } from "../db";
import { requireRole } from "../auth";
import { slotStatus } from "../lib/locker";
import { qrDataUrl } from "../lib/qr";
import { isStudentAccessActive } from "../lib/scheduling";

export const studentRouter = Router();

studentRouter.get("/me", requireRole("STUDENT"), async (req, res) => {
  const student = req.user!;
  const slot = student.slotId ? await prisma.slot.findUnique({ where: { id: student.slotId } }) : null;
  const schedule = student.scheduleId ? await prisma.schedule.findUnique({ where: { id: student.scheduleId } }) : null;
  const status = slot ? await slotStatus(slot.id) : { occupied: false, byStudentId: null };
  const qrImage = await qrDataUrl(student.qrToken!, 260);

  const logs = await prisma.log.findMany({
    where: { studentId: student.id },
    orderBy: { timestamp: "desc" },
    take: 15,
  });

  res.json({
    name: student.name,
    qrImage,
    slotLabel: slot ? slot.label : null,
    scheduleLabel: schedule ? schedule.sectionLabel : "Always available",
    accessActive: isStudentAccessActive(student, schedule),
    phoneDeposited: status.occupied && status.byStudentId === student.id,
    logs,
  });
});

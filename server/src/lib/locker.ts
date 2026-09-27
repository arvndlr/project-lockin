import { prisma } from "../db";
import { toPublicUser } from "../auth";
import { isStudentAccessActive } from "./scheduling";

export async function slotStatus(slotId: string) {
  const entry = await prisma.log.findFirst({
    where: { slotId, type: { in: ["DEPOSIT", "RETRIEVE"] } },
    orderBy: { timestamp: "desc" },
  });
  if (!entry || entry.type === "RETRIEVE") {
    return { occupied: false, byStudentId: null as string | null, since: entry?.timestamp ?? null };
  }
  return { occupied: true, byStudentId: entry.studentId, since: entry.timestamp };
}

export async function slotOverview(includeQrToken = false) {
  const slots = await prisma.slot.findMany({ orderBy: { createdAt: "asc" } });
  const statuses = await Promise.all(slots.map((s) => slotStatus(s.id)));

  const occupantIds = statuses.map((s) => s.byStudentId).filter((id): id is string => !!id);
  const occupants = occupantIds.length
    ? await prisma.user.findMany({ where: { id: { in: occupantIds } } })
    : [];

  // Zipped by index from the same `slots` array used to compute `statuses`, so
  // this stays correctly paired even when several slots share a createdAt
  // timestamp (a second independent query could come back in a different order).
  return slots.map((slot, i) => {
    const status = statuses[i];
    const occupant = status.byStudentId ? occupants.find((o) => o.id === status.byStudentId) : null;
    return {
      id: slot.id,
      label: slot.label,
      occupied: status.occupied,
      occupantName: occupant ? occupant.name : null,
      since: status.since,
      ...(includeQrToken ? { qrToken: slot.qrToken } : {}),
    };
  });
}

export async function findStudentByToken(qrToken: string) {
  return prisma.user.findFirst({ where: { role: "STUDENT", qrToken } });
}

// ---------------------------------------------------------------------------
// Deposit collection session ("unlock/lock the cabinet") — a teacher-gated
// window during which students deposit phones one at a time. A single
// in-progress claim on the singleton KioskState row is what makes the kiosk
// refuse the next student's scan until the current one is resolved.
// ---------------------------------------------------------------------------

async function getKioskStateRaw() {
  return prisma.kioskState.upsert({ where: { id: "kiosk" }, update: {}, create: { id: "kiosk" } });
}

export async function depositSessionStatus() {
  const state = await getKioskStateRaw();
  const [teacher, schedule, inProgressStudent, inProgressSlot] = await Promise.all([
    state.depositSessionTeacherId ? prisma.user.findUnique({ where: { id: state.depositSessionTeacherId } }) : null,
    state.depositSessionScheduleId ? prisma.schedule.findUnique({ where: { id: state.depositSessionScheduleId } }) : null,
    state.inProgressStudentId ? prisma.user.findUnique({ where: { id: state.inProgressStudentId } }) : null,
    state.inProgressSlotId ? prisma.slot.findUnique({ where: { id: state.inProgressSlotId } }) : null,
  ]);

  return {
    open: state.depositSessionOpen,
    teacherName: teacher?.name ?? null,
    sectionLabel: schedule?.sectionLabel ?? null,
    inProgress: inProgressStudent
      ? {
          studentName: inProgressStudent.name,
          slotLabel: inProgressSlot?.label ?? null,
          startedAt: state.inProgressStartedAt,
        }
      : null,
  };
}

export async function startDepositSession(teacherId: string, scheduleId: string) {
  await prisma.kioskState.upsert({
    where: { id: "kiosk" },
    update: {
      depositSessionOpen: true,
      depositSessionTeacherId: teacherId,
      depositSessionScheduleId: scheduleId,
      inProgressStudentId: null,
      inProgressSlotId: null,
      inProgressStartedAt: null,
    },
    create: {
      id: "kiosk",
      depositSessionOpen: true,
      depositSessionTeacherId: teacherId,
      depositSessionScheduleId: scheduleId,
    },
  });
}

export async function stopDepositSession() {
  await prisma.kioskState.upsert({
    where: { id: "kiosk" },
    update: {
      depositSessionOpen: false,
      depositSessionTeacherId: null,
      depositSessionScheduleId: null,
      inProgressStudentId: null,
      inProgressSlotId: null,
      inProgressStartedAt: null,
    },
    create: { id: "kiosk", depositSessionOpen: false },
  });
}

// ---------------------------------------------------------------------------
// Scan evaluation / confirmation
// ---------------------------------------------------------------------------

// Step 1: validate the scan and figure out what action it would perform, without
// writing anything yet — the kiosk shows a confirm screen before we commit.
export async function evaluateScan(qrToken: string) {
  const student = await findStudentByToken(qrToken);
  if (!student) {
    return { ok: false as const, reason: "QR code not recognized." };
  }

  if (!student.slotId) {
    return { ok: false as const, reason: `${student.name} has no locker assigned. See the admin.` };
  }

  const schedule = student.scheduleId
    ? await prisma.schedule.findUnique({ where: { id: student.scheduleId } })
    : null;

  if (!isStudentAccessActive(student, schedule)) {
    return {
      ok: false as const,
      reason: "No active class period right now — locker access is closed.",
      student: toPublicUser(student),
    };
  }

  const slot = await prisma.slot.findUnique({ where: { id: student.slotId } });
  if (!slot) {
    return { ok: false as const, reason: "Assigned locker no longer exists. See the admin." };
  }

  const status = await slotStatus(slot.id);

  if (status.occupied && status.byStudentId !== student.id) {
    // Someone else's phone is where this student's should be (or is) — the system
    // has no camera/weight sensor here, so this is flagged automatically rather
    // than asked as a yes/no confirmation.
    const conflictEntry = await prisma.log.create({
      data: {
        type: "INTRUSION",
        studentId: student.id,
        studentName: student.name,
        slotId: slot.id,
        slotLabel: slot.label,
        scheduleId: student.scheduleId,
        note: "Locker already held another student's phone when scanned.",
      },
    });
    return {
      ok: false as const,
      reason: "Locker conflict detected. Please see your teacher.",
      intrusion: conflictEntry,
    };
  }

  const action: "deposit" | "retrieve" = status.occupied ? "retrieve" : "deposit";

  // Deposits happen one student at a time, and only while a teacher has
  // explicitly opened a collection session ("unlocked the cabinet") for the
  // period. Retrieval isn't gated this way — a student can get their phone
  // back any time their schedule access is active, same as before.
  if (action === "deposit") {
    const state = await getKioskStateRaw();
    if (!state.depositSessionOpen) {
      return {
        ok: false as const,
        reason: "Deposit collection hasn't started yet — wait for your teacher to unlock the cabinet.",
      };
    }
    if (state.inProgressStudentId && state.inProgressStudentId !== student.id) {
      return {
        ok: false as const,
        reason: "Please wait — another student is currently placing their phone.",
      };
    }
    // Claim the queue slot so nobody else can scan until this is resolved.
    await prisma.kioskState.update({
      where: { id: "kiosk" },
      data: { inProgressStudentId: student.id, inProgressSlotId: slot.id, inProgressStartedAt: new Date() },
    });
  }

  return { ok: true as const, student: toPublicUser(student), slot, action };
}

// Step 2: commit the outcome once the kiosk confirms whether the phone matched.
export async function confirmScan(qrToken: string, action: "deposit" | "retrieve", correct: boolean) {
  const student = await findStudentByToken(qrToken);
  const slot = student?.slotId ? await prisma.slot.findUnique({ where: { id: student.slotId } }) : null;
  if (!student || !slot) return { ok: false as const, reason: "Scan session expired." };

  const entry = await prisma.log.create({
    data: {
      type: correct ? (action === "deposit" ? "DEPOSIT" : "RETRIEVE") : "INTRUSION",
      studentId: student.id,
      studentName: student.name,
      slotId: slot.id,
      slotLabel: slot.label,
      scheduleId: student.scheduleId,
      note: correct
        ? null
        : action === "deposit"
          ? `Student reported placing their phone in the wrong slot (expected ${slot.label}).`
          : `Student reported the phone in ${slot.label} was not theirs during a retrieve.`,
    },
  });

  if (action === "deposit" && correct) {
    // Placement confirmed correct — release the queue so the next student can scan.
    await prisma.kioskState.updateMany({
      where: { id: "kiosk", inProgressStudentId: student.id },
      data: { inProgressStudentId: null, inProgressSlotId: null, inProgressStartedAt: null },
    });
  }
  // On a wrong-slot report the queue stays locked to this same student — the
  // kiosk re-asks them to fix it and confirm again, rather than letting
  // anyone else scan in the meantime.

  return { ok: true as const, entry };
}

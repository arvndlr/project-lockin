import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

function newQrToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("Database already has data — skipping seed.");
    return;
  }

  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      name: "System Administrator",
      username: "admin",
      passwordHash: bcrypt.hashSync("admin123", 8),
    },
  });

  const teacher = await prisma.user.create({
    data: {
      role: "TEACHER",
      name: "Ms. Dyrelle Dominique Malunes",
      username: "teacher1",
      passwordHash: bcrypt.hashSync("teacher123", 8),
    },
  });

  const slots = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.slot.create({
        data: { label: `Locker ${String(i + 1).padStart(2, "0")}`, qrToken: newQrToken() },
      })
    )
  );

  const schedule = await prisma.schedule.create({
    data: {
      teacherId: teacher.id,
      sectionLabel: "STEM 12 - Ephesians",
      days: [0, 1, 2, 3, 4, 5, 6],
      startTime: "07:00",
      endTime: "18:00",
    },
  });

  const demoStudents = [
    "Manguiat, John Gabriel G.",
    "Candaza, Prince Abrielle",
    "Caraig, Kevin Lester G.",
  ];

  for (let i = 0; i < demoStudents.length; i++) {
    await prisma.user.create({
      data: {
        role: "STUDENT",
        name: demoStudents[i],
        username: `student${i + 1}`,
        passwordHash: bcrypt.hashSync("student123", 8),
        qrToken: newQrToken(),
        slotId: slots[i].id,
        scheduleId: schedule.id,
      },
    });
  }

  console.log("Seeded:", { admin: admin.username, teacher: teacher.username, students: demoStudents.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

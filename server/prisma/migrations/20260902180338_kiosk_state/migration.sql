-- CreateTable
CREATE TABLE "KioskState" (
    "id" TEXT NOT NULL DEFAULT 'kiosk',
    "depositSessionOpen" BOOLEAN NOT NULL DEFAULT false,
    "depositSessionTeacherId" TEXT,
    "depositSessionScheduleId" TEXT,
    "inProgressStudentId" TEXT,
    "inProgressSlotId" TEXT,
    "inProgressStartedAt" TIMESTAMP(3),

    CONSTRAINT "KioskState_pkey" PRIMARY KEY ("id")
);

import type { Schedule } from "@prisma/client";

// Weekly recurring schedule matching: a schedule is "active" if today's day-of-week
// is in its days[] and the current local time falls within [startTime, endTime).
// Windows that cross midnight (e.g. 23:00-00:00) are handled explicitly.

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function isScheduleActive(schedule: Schedule | null | undefined, at: Date = new Date()): boolean {
  if (!schedule) return false;
  const day = at.getDay();
  const startMin = timeToMinutes(schedule.startTime);
  const endMin = timeToMinutes(schedule.endTime);
  const nowMin = at.getHours() * 60 + at.getMinutes();

  if (endMin > startMin) {
    return schedule.days.includes(day) && nowMin >= startMin && nowMin < endMin;
  }

  // Overnight window (end time <= start time, e.g. 23:00-00:00 or 22:00-06:00):
  // active late on a scheduled start day, or early morning the day after one.
  const previousDay = (day + 6) % 7;
  if (schedule.days.includes(day) && nowMin >= startMin) return true;
  if (schedule.days.includes(previousDay) && nowMin < endMin) return true;
  return false;
}

export function isStudentAccessActive(
  student: { scheduleId: string | null },
  schedule: Schedule | null,
  at: Date = new Date()
): boolean {
  if (!student.scheduleId) return true;
  return isScheduleActive(schedule, at);
}

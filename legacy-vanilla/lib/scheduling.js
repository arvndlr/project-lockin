// Weekly recurring schedule matching: a schedule is "active" if today's day-of-week
// is in its days[] and the current local time falls within [startTime, endTime).

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function isScheduleActive(schedule, at = new Date()) {
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

// A student's locker access is active when they have no schedule restriction
// (scheduleId === null, meaning "always on") or their assigned schedule is
// currently active.
function isStudentAccessActive(student, schedules, at = new Date()) {
  if (!student.scheduleId) return true;
  const schedule = schedules.find((s) => s.id === student.scheduleId);
  return isScheduleActive(schedule, at);
}

module.exports = { timeToMinutes, isScheduleActive, isStudentAccessActive };

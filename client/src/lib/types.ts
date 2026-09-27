export type Role = "ADMIN" | "TEACHER" | "STUDENT";
export type LogType = "DEPOSIT" | "RETRIEVE" | "INTRUSION" | "OVERRIDE";

export interface User {
  id: string;
  role: Role;
  name: string;
  username: string;
  qrToken: string | null;
  slotId: string | null;
  scheduleId: string | null;
  createdAt: string;
}

export interface Slot {
  id: string;
  label: string;
  occupied: boolean;
  occupantName: string | null;
  since: string | null;
  qrToken?: string;
  qrImage?: string;
}

export interface Schedule {
  id: string;
  teacherId: string;
  teacherName?: string;
  sectionLabel: string;
  days: number[];
  startTime: string;
  endTime: string;
  activeNow?: boolean;
  createdAt: string;
}

export interface LogEntry {
  id: string;
  type: LogType;
  studentId: string | null;
  studentName: string;
  slotId: string | null;
  slotLabel: string | null;
  scheduleId: string | null;
  note: string | null;
  acknowledged: boolean;
  timestamp: string;
}

export interface DepositSession {
  open: boolean;
  teacherName: string | null;
  sectionLabel: string | null;
  inProgress: { studentName: string; slotLabel: string | null; startedAt: string | null } | null;
}

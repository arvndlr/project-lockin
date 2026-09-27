import { Router } from "express";
import { prisma } from "../db";
import { evaluateScan, confirmScan, slotOverview, depositSessionStatus } from "../lib/locker";
import { getIo } from "../socket";

export const kioskRouter = Router();

// Demo/testing aid only, for use when no camera is available at the kiosk.
kioskRouter.get("/students", async (_req, res) => {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true, name: true, qrToken: true },
  });
  res.json(students);
});

kioskRouter.get("/session", async (_req, res) => {
  res.json(await depositSessionStatus());
});

kioskRouter.post("/scan", async (req, res) => {
  const { qrToken } = req.body || {};
  if (!qrToken) return res.status(400).json({ ok: false, reason: "Missing QR token." });

  const result = await evaluateScan(qrToken);
  const io = getIo();
  if (!result.ok && "intrusion" in result && result.intrusion) {
    io.emit("log:new", result.intrusion);
    io.emit("intrusion:new", result.intrusion);
  }
  if (result.ok && result.action === "deposit") {
    // The scan just claimed the one-at-a-time queue lock — let the teacher
    // dashboard (and any other kiosk) know immediately.
    io.emit("session:update", await depositSessionStatus());
  }
  res.json(result);
});

kioskRouter.post("/confirm", async (req, res) => {
  const { qrToken, action, correct } = req.body || {};
  if (!qrToken || !["deposit", "retrieve"].includes(action)) {
    return res.status(400).json({ ok: false, reason: "Invalid confirm payload." });
  }
  const result = await confirmScan(qrToken, action, !!correct);
  if (result.ok) {
    const io = getIo();
    io.emit("log:new", result.entry);
    if (result.entry.type === "INTRUSION") io.emit("intrusion:new", result.entry);
    io.emit("slots:update", await slotOverview());
    if (action === "deposit") io.emit("session:update", await depositSessionStatus());
  }
  res.json(result);
});

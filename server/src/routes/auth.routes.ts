import { Router } from "express";
import { verifyLogin, toPublicUser } from "../auth";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, reason: "Username and password are required." });
  }
  const user = await verifyLogin(username, password);
  if (!user) return res.status(401).json({ ok: false, reason: "Invalid username or password." });
  req.session.userId = user.id;
  res.json({ ok: true, user: toPublicUser(user) });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get("/me", (req, res) => {
  res.json({ ok: true, user: toPublicUser(req.user ?? null) });
});

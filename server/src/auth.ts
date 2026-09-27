import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import type { Role, User } from "@prisma/client";
import { prisma } from "./db";

export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(user: User | null | undefined): PublicUser | null {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  if (req.session.userId) {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (user) {
      req.user = user;
    } else {
      req.session.userId = undefined;
    }
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ ok: false, reason: "Not logged in." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, reason: "Not allowed for this role." });
    }
    next();
  };
}

export async function verifyLogin(username: string, password: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  const match = await bcrypt.compare(password, user.passwordHash);
  return match ? user : null;
}

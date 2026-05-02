import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const SECRET = process.env.JWT_SECRET || "cottage-pricing-secret-key-2024";

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  name: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function extractToken(req: Request): JwtPayload | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return verifyToken(auth.slice(7));
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const payload = extractToken(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const payload = extractToken(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (payload.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  (req as any).user = payload;
  next();
}

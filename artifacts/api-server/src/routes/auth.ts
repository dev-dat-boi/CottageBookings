import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, extractToken, requireAdmin } from "../lib/auth";

const router = Router();

function userToApi(row: typeof usersTable.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (users.length === 0) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const user = users[0];
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const token = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });
    res.json({ token, user: userToApi(user) });
  } catch (err) {
    req.log.error({ err }, "Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", async (req, res) => {
  const payload = extractToken(req);
  if (!payload) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (users.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(userToApi(users[0]));
  } catch (err) {
    req.log.error({ err }, "Get me failed");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json(users.map(userToApi));
  } catch (err) {
    req.log.error({ err }, "List users failed");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/users", requireAdmin, async (req, res) => {
  const { email, name, password, role } = req.body;
  if (!email || !password || !role) {
    res.status(400).json({ error: "email, password, and role required" });
    return;
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const inserted = await db.insert(usersTable).values({
      email: email.toLowerCase().trim(),
      name: name || "",
      passwordHash: hash,
      role,
    }).returning();
    res.status(201).json(userToApi(inserted[0]));
  } catch (err: any) {
    if (err?.constraint?.includes("unique") || err?.message?.includes("unique")) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    req.log.error({ err }, "Create user failed");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, role, password } = req.body;
  try {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (name != null) updates.name = name;
    if (role != null) updates.role = role;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);
    if (Object.keys(updates).length === 0) {
      const rows = await db.select().from(usersTable).where(eq(usersTable.id, id));
      if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
      res.json(userToApi(rows[0]));
      return;
    }
    const rows = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(userToApi(rows[0]));
  } catch (err) {
    req.log.error({ err }, "Update user failed");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const caller = (req as any).user;
  if (caller?.userId === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  try {
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.json({ deleted: 1 });
  } catch (err) {
    req.log.error({ err }, "Delete user failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

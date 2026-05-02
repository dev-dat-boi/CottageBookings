import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_EMAIL = "deavon1@hotmail.com";
const ADMIN_PASSWORD = "123";
const ADMIN_NAME = "Deavon";

/**
 * Ensures the default admin user always exists.
 * Safe to run on every startup — uses upsert logic.
 */
export async function seedAdminUser() {
  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, ADMIN_EMAIL));
    if (existing.length === 0) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db.insert(usersTable).values({
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        passwordHash: hash,
        role: "admin",
      });
      logger.info({ email: ADMIN_EMAIL }, "Default admin user created");
    } else if (existing[0].role !== "admin") {
      await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.email, ADMIN_EMAIL));
      logger.info({ email: ADMIN_EMAIL }, "Admin role restored");
    } else {
      logger.info({ email: ADMIN_EMAIL }, "Admin user already exists");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed admin user");
  }
}

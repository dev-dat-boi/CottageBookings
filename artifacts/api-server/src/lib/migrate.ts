import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent startup migrations — safe to run on every boot.
 * Uses IF NOT EXISTS / IF EXISTS guards so they never fail on a fresh
 * or already-migrated database.
 */
export async function runStartupMigrations(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_log (
        id serial PRIMARY KEY,
        sent_at timestamp DEFAULT now() NOT NULL,
        recipients text NOT NULL,
        template_type text NOT NULL DEFAULT '',
        rental_id integer,
        subject text NOT NULL DEFAULT '',
        success boolean NOT NULL DEFAULT true,
        error_message text
      )
    `);
    logger.info("Startup migrations complete");
  } catch (err) {
    logger.error({ err }, "Startup migrations failed — some features may be unavailable");
  }
}

import app from "./app";
import { logger } from "./lib/logger";
import { seedAdminUser } from "./lib/seed";
import { runStartupMigrations } from "./lib/migrate";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Ensure schema additions are applied (idempotent, IF NOT EXISTS guards)
  await runStartupMigrations();
  // Ensure the default admin user always exists (safe on every startup)
  await seedAdminUser();
});

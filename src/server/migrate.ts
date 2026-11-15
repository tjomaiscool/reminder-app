import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set MIGRATION_DATABASE_URL (direct Neon connection) or DATABASE_URL before migrating.");
}

const pool = new Pool({ connectionString });

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationId = "001_initial_schema";
    const existing = await client.query(
      "SELECT 1 FROM schema_migrations WHERE migration_id = $1",
      [migrationId],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      console.log(`Migration ${migrationId} is already applied.`);
    } else {
      const migrationPath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../src/server/migrations/001_initial_schema.sql",
      );
      await client.query(await readFile(migrationPath, "utf8"));
      await client.query("INSERT INTO schema_migrations (migration_id) VALUES ($1)", [migrationId]);
      await client.query("COMMIT");
      console.log(`Applied migration ${migrationId}.`);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error("Database migration failed.", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

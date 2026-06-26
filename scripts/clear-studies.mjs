// Deletes all data from the database (study data + optionally users).
// Run from project root: node --env-file=.env scripts/clear-studies.mjs
// To also wipe the users table: node --env-file=.env scripts/clear-studies.mjs --all
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pkg from "pg";
const { Pool } = pkg;

const wipeAll = process.argv.includes("--all");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Order matters for FK constraints — truncate children before parents.
// CASCADE handles any remaining FK deps.
const studyTables = [
  "instances",
  "series",
  "reports",
  "study_access",
  "upload_tokens",
  "studies",
  "doctor_patients",
  "patients",
];

const allTables = [...studyTables, "users"];
const tables = wipeAll ? allTables : studyTables;

console.log(`Clearing tables${wipeAll ? " (including users)" : ""}...`);
for (const table of tables) {
  await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE`));
  console.log(`  ✓ ${table}`);
}

await pool.end();
console.log("Done.");

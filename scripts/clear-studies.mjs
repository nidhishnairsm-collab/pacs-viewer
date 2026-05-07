// Deletes all uploaded study data from the database and disk.
// Run from project root: node --env-file=.env scripts/clear-studies.mjs
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { rm } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const db = drizzle(process.env.DATABASE_URL);

const tables = [
  "instances",
  "series",
  "reports",
  "study_access",
  "upload_tokens",
  "studies",
  "patients",
];

console.log("Clearing database tables...");
await db.execute(sql`SET FOREIGN_KEY_CHECKS=0`);
for (const table of tables) {
  await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``));
  console.log(`  ✓ ${table}`);
}
await db.execute(sql`SET FOREIGN_KEY_CHECKS=1`);

console.log("Deleting uploaded files...");
const uploadsDir = join(__dirname, "..", "uploads", "dicom");
try {
  await rm(uploadsDir, { recursive: true, force: true });
  console.log("  ✓ uploads/dicom/");
} catch {
  console.log("  (uploads/dicom/ not found, skipping)");
}

console.log("Done.");

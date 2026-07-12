// Minimale Migrations-Mechanik: wendet migrations/NNNN_*.sql in Dateireihenfolge
// an, protokolliert in schema_migrations, läuft beim Container-Start (vor serve).
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from './services/db.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function runMigrations(): Promise<void> {
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const applied = new Set((await db`SELECT name FROM schema_migrations`).map((r) => r.name as string));

  for (const f of files) {
    if (applied.has(f)) continue;
    const body = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
    await db.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
    });
    console.log(`migration angewendet: ${f}`);
  }
}

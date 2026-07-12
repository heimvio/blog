// Ein Pool für die eigene blog-Datenbank (postgres.js, Muster wie heimvio-sidecar).
import postgres from 'postgres';
import { env } from '../env.js';

let pool: ReturnType<typeof postgres> | null = null;

export function sql(): ReturnType<typeof postgres> {
  if (!pool) {
    pool = postgres(env.DATABASE_URL, { max: 5, onnotice: () => {} });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end({ timeout: 5 });
  pool = null;
}

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { env } from './env';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function migrate(): Promise<void> {
  const sql = readFileSync(path.join(process.cwd(), 'sql', 'schema.sql'), 'utf8');
  await pool.query(sql);
}

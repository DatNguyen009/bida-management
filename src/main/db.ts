// src/main/db.ts
import { Pool, types } from 'pg'

// PostgreSQL returns DECIMAL/NUMERIC (OID 1700) as strings — parse to float for arithmetic.
types.setTypeParser(1700, (val: string) => parseFloat(val))

function createPool(): Pool {
  if (import.meta.env.PROD) {
    // Production build: connect to cloud DB (URL baked in at build time)
    return new Pool({
      connectionString: import.meta.env.MAIN_VITE_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  }
  // Dev: use local PostgreSQL
  return new Pool({
    host: 'localhost',
    port: 5432,
    database: 'bida_db',
    user: process.env.PGUSER || '',
    password: process.env.PGPASSWORD || '',
  })
}

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) pool = createPool()
  return pool
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, params)
  return result.rows as T[]
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

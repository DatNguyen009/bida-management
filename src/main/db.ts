// src/main/db.ts
import { Pool, types } from 'pg'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// PostgreSQL returns DECIMAL/NUMERIC (OID 1700) as strings — parse to float for arithmetic.
types.setTypeParser(1700, (val: string) => parseFloat(val))

function createPool(): Pool {
  // DATABASE_URL baked in at build time via MAIN_VITE_ prefix (electron-vite)
  const url = import.meta.env.MAIN_VITE_DATABASE_URL as string | undefined
  if (url) {
    return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  }
  const configPath = path.join(app.getPath('userData'), 'db-config.json')
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return new Pool(cfg)
    } catch (err) {
      console.error('[DB] Failed to parse db-config.json:', err)
      throw err
    }
  }
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

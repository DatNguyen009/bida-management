// src/main/db.ts
import { Pool, types } from 'pg'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

types.setTypeParser(1700, (val: string) => parseFloat(val))

function createPool(): Pool {
  const url = process.env.DATABASE_URL
  if (url) {
    return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
  }
  const configPath = path.join(app.getPath('userData'), 'db-config.json')
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return new Pool(cfg)
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

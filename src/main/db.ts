// src/main/db.ts
import { Pool, types } from 'pg'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// PostgreSQL returns DECIMAL/NUMERIC (OID 1700) as strings by default.
// Parse them as floats so JavaScript arithmetic works correctly.
types.setTypeParser(1700, (val: string) => parseFloat(val))

interface DbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

function loadDbConfig(): DbConfig {
  const configPath = path.join(app.getPath('userData'), 'db-config.json')
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }
  return {
    host: 'localhost',
    port: 5432,
    database: 'bida_db',
    user: process.env.PGUSER || '',
    password: process.env.PGPASSWORD || '',
  }
}

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(loadDbConfig())
  }
  return pool
}

export async function query<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query(sql, params)
  return result.rows as T[]
}

export async function queryOne<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

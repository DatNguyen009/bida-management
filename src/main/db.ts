// src/main/db.ts
import { Pool } from 'pg'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

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

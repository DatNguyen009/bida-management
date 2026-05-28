// src/main/handlers/reports.ts
import { ipcMain } from 'electron'
import { query } from '../db'
import { getAgentId } from '../lib/authStore'

export async function getRevenueReport(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT
       DATE(i.created_at) AS date,
       SUM(i.final_amount) AS total,
       COUNT(*) AS invoice_count
     FROM invoices i
     WHERE DATE(i.created_at) BETWEEN $1 AND $2
       AND (i.agent_id = $3 OR i.agent_id IS NULL)
     GROUP BY DATE(i.created_at)
     ORDER BY date`,
    [fromDate, toDate, agentId]
  )
}

export async function getRevenueSummary(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT
       SUM(i.final_amount) AS total_revenue,
       COUNT(*) AS total_invoices,
       AVG(i.final_amount) AS avg_invoice
     FROM invoices i
     WHERE DATE(i.created_at) BETWEEN $1 AND $2
       AND (i.agent_id = $3 OR i.agent_id IS NULL)`,
    [fromDate, toDate, agentId]
  )
}

export async function getTableStats(fromDate: string, toDate: string) {
  const agentId = getAgentId()
  return query(
    `SELECT
       t.name AS table_name,
       COUNT(s.id) AS session_count,
       SUM(i.final_amount) AS total_revenue,
       AVG(s.duration_minutes) AS avg_duration_minutes
     FROM sessions s
     JOIN tables t ON t.id = s.table_id
     JOIN invoices i ON i.session_id = s.id
     WHERE DATE(s.start_time) BETWEEN $1 AND $2
       AND (s.agent_id = $3 OR s.agent_id IS NULL)
     GROUP BY t.id, t.name
     ORDER BY total_revenue DESC`,
    [fromDate, toDate, agentId]
  )
}

export async function getLowStockProducts() {
  return query(
    `SELECT * FROM products
     WHERE is_active = TRUE AND stock_quantity <= min_stock_alert
     ORDER BY stock_quantity ASC`
  )
}

export function registerReportHandlers() {
  ipcMain.handle('reports:revenue', (_e, from: string, to: string) => getRevenueReport(from, to))
  ipcMain.handle('reports:summary', (_e, from: string, to: string) => getRevenueSummary(from, to))
  ipcMain.handle('reports:tableStats', (_e, from: string, to: string) => getTableStats(from, to))
  ipcMain.handle('reports:lowStock', () => getLowStockProducts())
}

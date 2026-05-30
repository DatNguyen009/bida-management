// src/main/handlers/customers.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import { getAgentId } from '../lib/authStore'
import type { Customer } from '../../renderer/src/types'

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const agentId = getAgentId()
  return queryOne<Customer>(
    'SELECT * FROM cloud_customers WHERE phone = $1 AND agent_id = $2',
    [phone, agentId]
  )
}

export async function searchCustomersByPhone(prefix: string): Promise<Customer[]> {
  const agentId = getAgentId()
  return query<Customer>(
    'SELECT * FROM cloud_customers WHERE phone LIKE $1 AND agent_id = $2 ORDER BY total_spent DESC',
    [prefix + '%', agentId]
  )
}

export async function getAllCustomers(): Promise<Customer[]> {
  const agentId = getAgentId()
  return query<Customer>(
    'SELECT * FROM cloud_customers WHERE agent_id = $1 ORDER BY total_spent DESC',
    [agentId]
  )
}

export async function createCustomer(input: {
  name: string
  phone: string
  email: string | null
  notes: string | null
}): Promise<Customer | null> {
  const agentId = getAgentId()
  return queryOne<Customer>(
    `INSERT INTO cloud_customers (name, phone, email, notes, agent_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.phone, input.email, input.notes, agentId]
  )
}

export async function updateCustomer(
  id: number,
  input: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'notes' | 'points_balance'>>
): Promise<Customer | null> {
  const agentId = getAgentId()
  const ALLOWED = new Set(['name', 'phone', 'email', 'notes', 'points_balance'])
  const fields = Object.keys(input).filter((f) => ALLOWED.has(f))
  if (fields.length === 0) return null
  const values = fields.map((f) => (input as any)[f])
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Customer>(
    `UPDATE cloud_customers SET ${setClause} WHERE id = $${fields.length + 1} AND agent_id = $${fields.length + 2} RETURNING *`,
    [...values, id, agentId]
  )
}

export async function getCustomerInvoices(customerId: number) {
  const agentId = getAgentId()
  return query(
    `SELECT i.*, s.start_time, t.name AS table_name
     FROM cloud_invoices i
     JOIN cloud_sessions s ON s.id = i.session_id
     JOIN cloud_tables t ON t.id = s.table_id
     WHERE s.customer_id = $1 AND i.agent_id = $2
     ORDER BY i.created_at DESC
     LIMIT 20`,
    [customerId, agentId]
  )
}

export function registerCustomerHandlers() {
  ipcMain.handle('customers:findByPhone', (_e, phone: string) => findCustomerByPhone(phone))
  ipcMain.handle('customers:searchByPhone', (_e, prefix: string) => searchCustomersByPhone(prefix))
  ipcMain.handle('customers:getAll', () => getAllCustomers())
  ipcMain.handle('customers:create', (_e, input) => createCustomer(input))
  ipcMain.handle('customers:update', (_e, id: number, input) => updateCustomer(id, input))
  ipcMain.handle('customers:invoices', (_e, customerId: number) => getCustomerInvoices(customerId))
}

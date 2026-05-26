import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { Customer } from '../../renderer/src/types'

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  return queryOne<Customer>('SELECT * FROM customers WHERE phone = $1', [phone])
}

export async function getAllCustomers(): Promise<Customer[]> {
  return query<Customer>('SELECT * FROM customers ORDER BY total_spent DESC')
}

export async function createCustomer(input: {
  name: string
  phone: string
  email: string | null
  notes: string | null
}): Promise<Customer | null> {
  return queryOne<Customer>(
    `INSERT INTO customers (name, phone, email, notes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.name, input.phone, input.email, input.notes]
  )
}

export async function updateCustomer(
  id: number,
  input: Partial<Pick<Customer, 'name' | 'phone' | 'email' | 'notes' | 'points_balance'>>
): Promise<Customer | null> {
  const fields = Object.keys(input)
  const values = Object.values(input)
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Customer>(
    `UPDATE customers SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  )
}

export async function getCustomerInvoices(customerId: number) {
  return query(
    `SELECT i.*, s.start_time, t.name AS table_name
     FROM invoices i
     JOIN sessions s ON s.id = i.session_id
     JOIN tables t ON t.id = s.table_id
     WHERE s.customer_id = $1
     ORDER BY i.created_at DESC
     LIMIT 20`,
    [customerId]
  )
}

export function registerCustomerHandlers() {
  ipcMain.handle('customers:findByPhone', (_e, phone: string) => findCustomerByPhone(phone))
  ipcMain.handle('customers:getAll', () => getAllCustomers())
  ipcMain.handle('customers:create', (_e, input) => createCustomer(input))
  ipcMain.handle('customers:update', (_e, id: number, input) => updateCustomer(id, input))
  ipcMain.handle('customers:invoices', (_e, customerId: number) => getCustomerInvoices(customerId))
}

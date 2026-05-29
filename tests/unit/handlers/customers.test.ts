import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/main/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../src/main/lib/authStore', () => ({
  getAgentId: vi.fn().mockReturnValue(null),
}))

import * as db from '../../../src/main/db'
import {
  findCustomerByPhone,
  createCustomer,
  getAllCustomers,
} from '../../../src/main/handlers/customers'

describe('findCustomerByPhone', () => {
  it('returns customer when found', async () => {
    const mockCustomer = { id: 1, name: 'Nguyễn Văn A', phone: '0901234567' }
    vi.mocked(db.queryOne).mockResolvedValue(mockCustomer)

    const result = await findCustomerByPhone('0901234567')

    expect(db.queryOne).toHaveBeenCalledWith(
      'SELECT * FROM cloud_customers WHERE phone = $1 AND agent_id = $2',
      ['0901234567', null]
    )
    expect(result).toEqual(mockCustomer)
  })

  it('returns null when not found', async () => {
    vi.mocked(db.queryOne).mockResolvedValue(null)
    const result = await findCustomerByPhone('0000000000')
    expect(result).toBeNull()
  })
})

describe('createCustomer', () => {
  it('inserts a new customer and returns it', async () => {
    const input = { name: 'Nguyễn Văn B', phone: '0912345678', email: null, notes: null }
    const mockCustomer = { id: 2, ...input, total_visits: 0, points_balance: 0 }
    vi.mocked(db.queryOne).mockResolvedValue(mockCustomer)

    const result = await createCustomer(input)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cloud_customers'),
      expect.arrayContaining([input.name, input.phone])
    )
    expect(result).toEqual(mockCustomer)
  })
})

describe('getAllCustomers', () => {
  it('returns customers ordered by total_spent descending', async () => {
    const mockCustomers = [
      { id: 1, name: 'VIP', total_spent: 1000000 },
      { id: 2, name: 'New', total_spent: 50000 },
    ]
    vi.mocked(db.query).mockResolvedValue(mockCustomers)

    const result = await getAllCustomers()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY total_spent DESC'),
      [null]
    )
    expect(result).toEqual(mockCustomers)
  })
})

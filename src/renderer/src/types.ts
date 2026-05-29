// src/renderer/src/types.ts
export interface BidaTable {
  id: number
  name: string
  status: 'idle' | 'playing' | 'reserved'
  hourly_rate: number
  created_at: string
}

export interface Session {
  id: number
  table_id: number
  customer_id: number | null
  start_time: string
  end_time: string | null
  duration_minutes: number | null
  play_amount: number
  status: 'open' | 'closed'
}

export interface Product {
  id: number
  name: string
  category: 'drink' | 'food' | 'other'
  price: number
  stock_quantity: number
  min_stock_alert: number
  unit: string
  is_active: boolean
  created_at: string
}

export interface OrderItem {
  id: number
  session_id: number
  product_id: number
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
  product_name?: string
}

export interface Invoice {
  id: number
  session_id: number
  invoice_number: string
  play_amount: number
  items_amount: number
  total_amount: number
  discount: number
  points_redeemed: number
  discount_from_points: number
  final_amount: number
  points_earned: number
  printed_at: string | null
  created_at: string
}

export interface InvoiceCreateInput {
  sessionId: number
  customerId: number | null
  playAmount: number
  itemsAmount: number
  discount: number
  pointsRedeemed: number
  pointsEarned: number
  discountFromPoints: number
  finalAmount: number
  shopName: string
  shopAddress: string
  shopPhone: string
  tableId: number
  tableName: string
  orderItems: { product_name: string; quantity: number; subtotal: number }[]
  customerName?: string
  customerPhone?: string
  customerPoints?: number
}

export interface Customer {
  id: number
  name: string
  phone: string
  email: string | null
  total_visits: number
  total_spent: number
  points_balance: number
  notes: string | null
  created_at: string
}

export interface StockTransaction {
  id: number
  product_id: number
  type: 'in' | 'out' | 'adjust'
  quantity: number
  cost_price: number | null
  before_qty: number
  after_qty: number
  note: string | null
  created_at: string
}

export interface LoyaltySettings {
  pointsPer10k: number
  vndPerPoint: number
  minRedeemPoints: number
}

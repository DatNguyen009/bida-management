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
  category_id: number
  category_name: string
  category_icon: string
  price: number
  cost_price: number | null
  effective_stock: number | null
  stock_quantity: number
  min_stock_alert: number
  unit: string
  is_active: boolean
  product_type: 'stock' | 'composite'
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
  payment_method: 'cash' | 'bank_transfer'
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
  paymentMethod: 'cash' | 'bank_transfer'
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
  bankId?: string
  bankAccount?: string
  bankAccountName?: string
  vatRate?: number
  vatAmount?: number
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
  product_name: string
  type: 'in' | 'out' | 'adjust'
  quantity: number
  before_qty: number
  after_qty: number
  cost_price: number | null
  note: string | null
  created_at: string
}

export interface LoyaltySettings {
  pointsPer10k: number
  vndPerPoint: number
  minRedeemPoints: number
}

export interface InvoiceListRow {
  id: number
  invoice_number: string
  session_id: number
  play_amount: number
  items_amount: number
  final_amount: number
  discount: number
  points_redeemed: number
  discount_from_points: number
  points_earned: number
  printed_at: string | null
  created_at: string
  completed_by: string | null
  table_name: string | null
  customer_name: string | null
  customer_phone: string | null
}

export interface InvoiceOrderItem {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface PageResult<T> {
  data: T[]
  total: number
}

export interface RecipeItem {
  id: number
  product_id: number
  ingredient_id: number
  ingredient_name: string
  quantity: number
}

export interface Category {
  id: number
  name: string
  icon: string
}

export interface StaffMember {
  id: number
  username: string
  allowed_screens: string[]
  is_active: boolean
  created_at: string
}

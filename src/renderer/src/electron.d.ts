// src/renderer/src/electron.d.ts
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput } from './types'

declare global {
  interface Window {
    api: {
      tables: {
        getAll(): Promise<BidaTable[]>
        updateStatus(id: number, status: BidaTable['status']): Promise<BidaTable | null>
      }
      sessions: {
        create(tableId: number, customerId: number | null): Promise<Session | null>
        getActive(): Promise<(Session & { table_name: string; hourly_rate: number })[]>
        close(sessionId: number, playAmount: number): Promise<Session | null>
      }
      products: {
        getAll(): Promise<Product[]>
        create(input: Omit<Product, 'id' | 'created_at' | 'stock_quantity' | 'is_active'>): Promise<Product | null>
        update(id: number, input: Partial<Product>): Promise<Product | null>
        adjustStock(id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string): Promise<Product | null>
      }
      orderItems: {
        add(sessionId: number, productId: number, quantity: number, unitPrice: number): Promise<OrderItem | null>
        get(sessionId: number): Promise<(OrderItem & { product_name: string })[]>
        remove(itemId: number): Promise<void>
      }
      invoices: {
        create(input: InvoiceCreateInput): Promise<Invoice | null>
        print(invoiceId: number, input: InvoiceCreateInput, invoiceNumber: string, printerPath: string): Promise<void>
      }
      settings: {
        getAll(): Promise<{ key: string; value: string }[]>
        set(key: string, value: string): Promise<{ key: string; value: string } | null>
      }
    }
  }
}

export {}

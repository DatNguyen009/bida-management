// src/renderer/src/electron.d.ts
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer } from './types'

declare global {
  interface Window {
    api: {
      tables: {
        getAll(): Promise<BidaTable[]>
        updateStatus(id: number, status: BidaTable['status']): Promise<BidaTable | null>
        create(name: string, hourlyRate: number): Promise<BidaTable | null>
        update(tableId: number, name: string, hourlyRate: number): Promise<BidaTable | null>
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
      customers: {
        findByPhone(phone: string): Promise<Customer | null>
        getAll(): Promise<Customer[]>
        create(input: { name: string; phone: string; email: string | null; notes: string | null }): Promise<Customer | null>
        update(id: number, input: Partial<Customer>): Promise<Customer | null>
        invoices(customerId: number): Promise<unknown[]>
      }
      reports: {
        revenue(from: string, to: string): Promise<unknown[]>
        summary(from: string, to: string): Promise<unknown[]>
        tableStats(from: string, to: string): Promise<unknown[]>
        lowStock(): Promise<unknown[]>
      }
    }
  }
}

export {}

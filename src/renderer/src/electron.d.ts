// src/renderer/src/electron.d.ts
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, RecipeItem, Category, StaffMember } from './types'

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
        getPage(input: { page: number; pageSize: number }): Promise<{ data: Product[]; total: number }>
        create(input: { name: string; category_id: number; price: number; unit: string; min_stock_alert: number; product_type: 'stock' | 'composite' }): Promise<Product | null>
        update(id: number, input: Partial<Product>): Promise<Product | null>
        adjustStock(id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string, costPrice: number | null): Promise<Product | null>
        getStockHistory(input: { productId?: number; fromDate?: string; toDate?: string; page?: number; pageSize?: number }): Promise<{ data: StockTransaction[]; total: number }>
      }
      orderItems: {
        add(sessionId: number, productId: number, quantity: number, unitPrice: number): Promise<OrderItem | null>
        get(sessionId: number): Promise<(OrderItem & { product_name: string })[]>
        remove(itemId: number): Promise<void>
        adjustQty(itemId: number, delta: number): Promise<void>
      }
      recipes: {
        get(productId: number): Promise<RecipeItem[]>
        save(productId: number, items: { ingredientId: number; quantity: number }[]): Promise<void>
      }
      categories: {
        getAll(): Promise<Category[]>
        create(input: { name: string; icon: string }): Promise<Category | null>
        update(id: number, input: { name: string; icon: string }): Promise<Category | null>
        delete(id: number): Promise<{ success: boolean; productCount: number }>
      }
      staff: {
        getAll(): Promise<StaffMember[]>
        create(input: { username: string; password: string; allowedScreens: string[] }): Promise<StaffMember | null>
        update(id: number, input: { password?: string; allowedScreens: string[] }): Promise<StaffMember | null>
        delete(id: number): Promise<void>
      }
      invoices: {
        create(input: InvoiceCreateInput): Promise<Invoice | null>
        print(invoiceId: number, input: InvoiceCreateInput, invoiceNumber: string, printerPath: string): Promise<void>
        getList(input: { fromDate?: string; toDate?: string; page?: number; pageSize?: number }): Promise<{ data: InvoiceListRow[]; total: number }>
        getOrderItems(sessionId: number): Promise<InvoiceOrderItem[]>
      }
      settings: {
        getAll(): Promise<{ key: string; value: string }[]>
        set(key: string, value: string): Promise<{ key: string; value: string } | null>
      }
      customers: {
        findByPhone(phone: string): Promise<Customer | null>
        searchByPhone(prefix: string): Promise<Customer[]>
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
      auth: {
        login(username: string, password: string): Promise<{ role: string; agentId: string | null; allowedScreens: string[] }>
        logout(): Promise<void>
        getSession(): Promise<{ role: string; agentId: string | null; allowedScreens: string[] } | null>
      }
      loyalty: {
        getSettings(): Promise<LoyaltySettings>
        saveSettings(settings: LoyaltySettings): Promise<LoyaltySettings>
      }
    }
  }
}

export {}

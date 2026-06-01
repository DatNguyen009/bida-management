// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, PageResult, RecipeItem, Category, StaffMember, Promotion, PayosLinkResult } from '../renderer/src/types'

contextBridge.exposeInMainWorld('api', {
  tables: {
    getAll: (): Promise<BidaTable[]> =>
      ipcRenderer.invoke('tables:getAll'),
    updateStatus: (tableId: number, status: BidaTable['status']): Promise<BidaTable | null> =>
      ipcRenderer.invoke('tables:updateStatus', tableId, status),
    create: (name: string, hourlyRate: number): Promise<BidaTable | null> =>
      ipcRenderer.invoke('tables:create', name, hourlyRate),
    update: (tableId: number, name: string, hourlyRate: number): Promise<BidaTable | null> =>
      ipcRenderer.invoke('tables:update', tableId, name, hourlyRate),
  },
  sessions: {
    create: (tableId: number, customerId: number | null): Promise<Session | null> =>
      ipcRenderer.invoke('sessions:create', tableId, customerId),
    getActive: (): Promise<(Session & { table_name: string; hourly_rate: number })[]> =>
      ipcRenderer.invoke('sessions:getActive'),
    close: (sessionId: number, playAmount: number): Promise<Session | null> =>
      ipcRenderer.invoke('sessions:close', sessionId, playAmount),
  },
  products: {
    getAll: (): Promise<Product[]> =>
      ipcRenderer.invoke('products:getAll'),
    getPage: (input: { page: number; pageSize: number }): Promise<PageResult<Product>> =>
      ipcRenderer.invoke('products:getPage', input),
    create: (input: { name: string; category_id: number; price: number; unit: string; min_stock_alert: number; product_type: 'stock' | 'composite' }): Promise<Product | null> =>
      ipcRenderer.invoke('products:create', input),
    update: (id: number, input: Partial<Product>): Promise<Product | null> =>
      ipcRenderer.invoke('products:update', id, input),
    adjustStock: (id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string, costPrice: number | null): Promise<Product | null> =>
      ipcRenderer.invoke('products:adjustStock', id, type, qty, note, costPrice),
    getStockHistory: (input: { productId?: number; fromDate?: string; toDate?: string; page: number; pageSize: number }): Promise<PageResult<StockTransaction>> =>
      ipcRenderer.invoke('products:getStockHistory', input),
  },
  orderItems: {
    add: (sessionId: number, productId: number, quantity: number, unitPrice: number): Promise<OrderItem | null> =>
      ipcRenderer.invoke('orderItems:add', sessionId, productId, quantity, unitPrice),
    get: (sessionId: number): Promise<(OrderItem & { product_name: string })[]> =>
      ipcRenderer.invoke('orderItems:get', sessionId),
    remove: (itemId: number): Promise<void> =>
      ipcRenderer.invoke('orderItems:remove', itemId),
    adjustQty: (itemId: number, delta: number): Promise<void> =>
      ipcRenderer.invoke('orderItems:adjustQty', itemId, delta),
  },
  recipes: {
    get: (productId: number): Promise<RecipeItem[]> =>
      ipcRenderer.invoke('recipes:get', productId),
    save: (productId: number, items: { ingredientId: number; quantity: number }[]): Promise<void> =>
      ipcRenderer.invoke('recipes:save', productId, items),
  },
  categories: {
    getAll: (): Promise<Category[]> =>
      ipcRenderer.invoke('categories:getAll'),
    create: (input: { name: string; icon: string }): Promise<Category | null> =>
      ipcRenderer.invoke('categories:create', input),
    update: (id: number, input: { name: string; icon: string }): Promise<Category | null> =>
      ipcRenderer.invoke('categories:update', id, input),
    delete: (id: number): Promise<{ success: boolean; productCount: number }> =>
      ipcRenderer.invoke('categories:delete', id),
  },
  staff: {
    getAll: (): Promise<StaffMember[]> =>
      ipcRenderer.invoke('staff:getAll'),
    create: (input: { username: string; password: string; allowedScreens: string[] }): Promise<StaffMember | null> =>
      ipcRenderer.invoke('staff:create', input),
    update: (id: number, input: { password?: string; allowedScreens: string[] }): Promise<StaffMember | null> =>
      ipcRenderer.invoke('staff:update', id, input),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('staff:delete', id),
  },
  invoices: {
    create: (input: InvoiceCreateInput): Promise<Invoice | null> =>
      ipcRenderer.invoke('invoices:create', input),
    print: (invoiceId: number, input: InvoiceCreateInput, invoiceNumber: string, printerPath: string): Promise<void> =>
      ipcRenderer.invoke('invoices:print', invoiceId, input, invoiceNumber, printerPath),
    getList: (input: { fromDate?: string; toDate?: string; page: number; pageSize: number }): Promise<PageResult<InvoiceListRow>> =>
      ipcRenderer.invoke('invoices:getList', input),
    getOrderItems: (sessionId: number): Promise<InvoiceOrderItem[]> =>
      ipcRenderer.invoke('invoices:getOrderItems', sessionId),
  },
  settings: {
    getAll: (): Promise<{ key: string; value: string }[]> =>
      ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: string): Promise<{ key: string; value: string } | null> =>
      ipcRenderer.invoke('settings:set', key, value),
  },
  customers: {
    findByPhone: (phone: string): Promise<Customer | null> =>
      ipcRenderer.invoke('customers:findByPhone', phone),
    searchByPhone: (prefix: string): Promise<Customer[]> =>
      ipcRenderer.invoke('customers:searchByPhone', prefix),
    getAll: (): Promise<Customer[]> =>
      ipcRenderer.invoke('customers:getAll'),
    create: (input: { name: string; phone: string; email: string | null; notes: string | null }): Promise<Customer | null> =>
      ipcRenderer.invoke('customers:create', input),
    update: (id: number, input: Partial<Customer>): Promise<Customer | null> =>
      ipcRenderer.invoke('customers:update', id, input),
    invoices: (customerId: number): Promise<unknown[]> =>
      ipcRenderer.invoke('customers:invoices', customerId),
  },
  reports: {
    revenue: (from: string, to: string): Promise<unknown[]> =>
      ipcRenderer.invoke('reports:revenue', from, to),
    summary: (from: string, to: string): Promise<unknown[]> =>
      ipcRenderer.invoke('reports:summary', from, to),
    tableStats: (from: string, to: string): Promise<unknown[]> =>
      ipcRenderer.invoke('reports:tableStats', from, to),
    lowStock: (): Promise<unknown[]> =>
      ipcRenderer.invoke('reports:lowStock'),
    staffStats: (from: string, to: string): Promise<unknown[]> =>
      ipcRenderer.invoke('reports:staffStats', from, to),
    productStats: (from: string, to: string): Promise<unknown[]> =>
      ipcRenderer.invoke('reports:productStats', from, to),
  },
  auth: {
    login: (username: string, password: string): Promise<{ role: string; agentId: string | null; allowedScreens: string[] }> =>
      ipcRenderer.invoke('auth:login', username, password),
    logout: (): Promise<void> =>
      ipcRenderer.invoke('auth:logout'),
    getSession: (): Promise<{ role: string; agentId: string | null; allowedScreens: string[] } | null> =>
      ipcRenderer.invoke('auth:getSession'),
  },
  loyalty: {
    getSettings: (): Promise<LoyaltySettings> =>
      ipcRenderer.invoke('loyalty:getSettings'),
    saveSettings: (settings: LoyaltySettings): Promise<LoyaltySettings> =>
      ipcRenderer.invoke('loyalty:saveSettings', settings),
  },
  promotions: {
    getAll: (): Promise<Promotion[]> =>
      ipcRenderer.invoke('promotions:getAll'),
    getActive: (now: string): Promise<Promotion[]> =>
      ipcRenderer.invoke('promotions:getActive', now),
    validateVoucher: (code: string): Promise<Promotion | null> =>
      ipcRenderer.invoke('promotions:validateVoucher', code),
    create: (input: Omit<Promotion, 'id' | 'agent_id' | 'used_count' | 'created_at'>): Promise<Promotion> =>
      ipcRenderer.invoke('promotions:create', input),
    update: (id: number, input: Partial<Promotion>): Promise<Promotion> =>
      ipcRenderer.invoke('promotions:update', id, input),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke('promotions:delete', id),
    incrementUsed: (id: number): Promise<void> =>
      ipcRenderer.invoke('promotions:incrementUsed', id),
  },
  payos: {
    createLink: (input: {
      sessionId: number | null
      amount: number
      tableName: string
      orderItems: { name: string; quantity: number; price: number }[]
    }): Promise<PayosLinkResult> =>
      ipcRenderer.invoke('payos:createLink', input),
    cancelLink: (orderCode: number): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('payos:cancelLink', orderCode),
    subscribe: (orderCode: number): void =>
      ipcRenderer.send('payos:subscribe', orderCode),
    unsubscribe: (orderCode: number): void =>
      ipcRenderer.send('payos:unsubscribe', orderCode),
    onEvent: (callback: (data: { type: string; orderCode?: number; message?: string }) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, data: { type: string }) => callback(data)
      ipcRenderer.on('payos:event', handler)
      return () => ipcRenderer.removeListener('payos:event', handler)
    },
  },
})

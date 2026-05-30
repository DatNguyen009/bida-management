// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { BidaTable, Session, Product, OrderItem, Invoice, InvoiceCreateInput, Customer, LoyaltySettings, StockTransaction, InvoiceListRow, InvoiceOrderItem, PageResult } from '../renderer/src/types'

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
    create: (input: Omit<Product, 'id' | 'created_at' | 'stock_quantity' | 'is_active'>): Promise<Product | null> =>
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
  },
  auth: {
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', username, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
  },
  loyalty: {
    getSettings: (): Promise<LoyaltySettings> =>
      ipcRenderer.invoke('loyalty:getSettings'),
    saveSettings: (settings: LoyaltySettings): Promise<LoyaltySettings> =>
      ipcRenderer.invoke('loyalty:saveSettings', settings),
  },
})

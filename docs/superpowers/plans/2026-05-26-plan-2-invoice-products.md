# Bida Management — Plan 2: Invoice + Print + Products

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plan 1 phải hoàn thành — Electron app chạy được, DB có schema, Sessions IPC hoạt động.

**Goal:** Thêm module hóa đơn (tạo, preview, in nhiệt 80mm ESC/POS), quản lý sản phẩm (CRUD, tồn kho), và thêm đồ uống/thức ăn vào phiên chơi.

**Architecture:** `electron/handlers/invoices.ts` xử lý tạo hóa đơn + print logic. `electron/handlers/products.ts` xử lý CRUD sản phẩm. `electron/handlers/orderItems.ts` xử lý order trong phiên. Renderer có trang Invoice với preview 80mm và trang Products.

**Tech Stack:** node-thermal-printer (ESC/POS), electron-print, React, shadcn/ui

---

## File Map

```
electron/handlers/
├── invoices.ts          # IPC: invoices:create, invoices:print, invoices:getBySession
├── products.ts          # IPC: products:getAll, products:create, products:update, products:delete, products:adjustStock
└── orderItems.ts        # IPC: orderItems:add, orderItems:remove, orderItems:getBySession

src/pages/
├── Invoice.tsx          # Preview hóa đơn + áp giảm giá + in
└── Products.tsx         # CRUD sản phẩm + quản lý tồn kho

src/components/
├── InvoicePreview.tsx   # Hiển thị layout hóa đơn 80mm
├── OrderList.tsx        # Danh sách đồ uống trong phiên
└── ProductPicker.tsx    # Modal chọn sản phẩm để thêm vào order

tests/unit/handlers/
├── invoices.test.ts
├── products.test.ts
└── orderItems.test.ts

tests/unit/
└── invoiceCalc.test.ts  # Business logic tính hóa đơn
```

---

## Task 1: Business logic tính hóa đơn

**Files:**
- Create: `src/lib/invoiceCalc.ts`
- Create: `tests/unit/invoiceCalc.test.ts`

- [ ] **Step 1: Viết failing tests**

```ts
// tests/unit/invoiceCalc.test.ts
import { describe, it, expect } from 'vitest'
import { calcInvoice, calcPointsEarned, calcDiscountFromPoints } from '../../src/lib/invoiceCalc'

describe('calcInvoice', () => {
  it('calculates invoice totals correctly', () => {
    const result = calcInvoice({
      playAmount: 125000,
      itemsAmount: 90000,
      discount: 10000,
      pointsRedeemed: 0,
      vndPerPoint: 100,
    })
    expect(result.totalAmount).toBe(215000)
    expect(result.discountFromPoints).toBe(0)
    expect(result.finalAmount).toBe(205000)
  })

  it('applies points discount correctly', () => {
    const result = calcInvoice({
      playAmount: 100000,
      itemsAmount: 50000,
      discount: 0,
      pointsRedeemed: 100,
      vndPerPoint: 100,
    })
    expect(result.totalAmount).toBe(150000)
    expect(result.discountFromPoints).toBe(10000) // 100 points × 100đ
    expect(result.finalAmount).toBe(140000)
  })
})

describe('calcPointsEarned', () => {
  it('calculates points earned from final amount', () => {
    // 205,000đ / 10,000 * 1 point = 20 points
    expect(calcPointsEarned(205000, 1)).toBe(20)
    expect(calcPointsEarned(9999, 1)).toBe(0)
    expect(calcPointsEarned(10000, 1)).toBe(1)
  })
})

describe('calcDiscountFromPoints', () => {
  it('calculates discount amount from points', () => {
    expect(calcDiscountFromPoints(100, 100)).toBe(10000)
    expect(calcDiscountFromPoints(0, 100)).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/invoiceCalc.test.ts
```

- [ ] **Step 3: Viết `src/lib/invoiceCalc.ts`**

```ts
// src/lib/invoiceCalc.ts
interface InvoiceInput {
  playAmount: number
  itemsAmount: number
  discount: number
  pointsRedeemed: number
  vndPerPoint: number
}

interface InvoiceResult {
  totalAmount: number
  discountFromPoints: number
  finalAmount: number
}

export function calcInvoice(input: InvoiceInput): InvoiceResult {
  const { playAmount, itemsAmount, discount, pointsRedeemed, vndPerPoint } = input
  const totalAmount = playAmount + itemsAmount
  const discountFromPoints = pointsRedeemed * vndPerPoint
  const finalAmount = totalAmount - discount - discountFromPoints
  return { totalAmount, discountFromPoints, finalAmount: Math.max(0, finalAmount) }
}

export function calcPointsEarned(finalAmount: number, pointsPer10k: number): number {
  return Math.floor(finalAmount / 10000) * pointsPer10k
}

export function calcDiscountFromPoints(points: number, vndPerPoint: number): number {
  return points * vndPerPoint
}
```

- [ ] **Step 4: Chạy test**

```bash
npx vitest run tests/unit/invoiceCalc.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoiceCalc.ts tests/unit/invoiceCalc.test.ts
git commit -m "feat: add invoice calculation business logic with tests"
```

---

## Task 2: IPC handler cho Products

**Files:**
- Create: `electron/handlers/products.ts`
- Create: `tests/unit/handlers/products.test.ts`
- Modify: `electron/main.ts`, `electron/preload.ts`, `src/electron.d.ts`

- [ ] **Step 1: Thêm type vào `src/types.ts`**

```ts
// thêm vào src/types.ts
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
```

- [ ] **Step 2: Viết failing tests**

```ts
// tests/unit/handlers/products.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../electron/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../electron/db'
import {
  getAllProducts,
  createProduct,
  adjustStock,
} from '../../electron/handlers/products'

describe('getAllProducts', () => {
  it('returns active products ordered by name', async () => {
    const mockProducts = [{ id: 1, name: 'Bia Tiger', is_active: true }]
    vi.mocked(db.query).mockResolvedValue(mockProducts)

    const result = await getAllProducts()

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('is_active = TRUE')
    )
    expect(result).toEqual(mockProducts)
  })
})

describe('createProduct', () => {
  it('inserts a new product and returns it', async () => {
    const input = { name: 'Bia Tiger', category: 'drink' as const, price: 30000, unit: 'lon', min_stock_alert: 10 }
    const mockProduct = { id: 1, ...input, stock_quantity: 0, is_active: true }
    vi.mocked(db.queryOne).mockResolvedValue(mockProduct)

    const result = await createProduct(input)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO products'),
      expect.arrayContaining([input.name, input.price])
    )
    expect(result).toEqual(mockProduct)
  })
})

describe('adjustStock', () => {
  it('increments stock and logs transaction', async () => {
    const updatedProduct = { id: 1, stock_quantity: 20 }
    vi.mocked(db.queryOne).mockResolvedValue(updatedProduct)
    vi.mocked(db.query).mockResolvedValue([])

    const result = await adjustStock(1, 'in', 10, 'Nhập kho')

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('stock_quantity + $1'),
      expect.arrayContaining([10, 1])
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stock_transactions'),
      expect.arrayContaining([1, 'in', 10, 'Nhập kho'])
    )
    expect(result).toEqual(updatedProduct)
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/handlers/products.test.ts
```

- [ ] **Step 4: Viết `electron/handlers/products.ts`**

```ts
// electron/handlers/products.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { Product } from '../../src/types'

export async function getAllProducts(): Promise<Product[]> {
  return query<Product>(
    'SELECT * FROM products WHERE is_active = TRUE ORDER BY category, name'
  )
}

export async function createProduct(input: {
  name: string
  category: Product['category']
  price: number
  unit: string
  min_stock_alert: number
}): Promise<Product | null> {
  return queryOne<Product>(
    `INSERT INTO products (name, category, price, unit, min_stock_alert)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.category, input.price, input.unit, input.min_stock_alert]
  )
}

export async function updateProduct(
  id: number,
  input: Partial<Omit<Product, 'id' | 'created_at'>>
): Promise<Product | null> {
  const fields = Object.keys(input)
  const values = Object.values(input)
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  return queryOne<Product>(
    `UPDATE products SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
    [...values, id]
  )
}

export async function adjustStock(
  productId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note: string
): Promise<Product | null> {
  const operator = type === 'out' ? '-' : '+'
  const product = await queryOne<Product>(
    `UPDATE products SET stock_quantity = stock_quantity ${operator} $1
     WHERE id = $2 RETURNING *`,
    [quantity, productId]
  )
  await query(
    `INSERT INTO stock_transactions (product_id, type, quantity, note)
     VALUES ($1, $2, $3, $4)`,
    [productId, type, quantity, note]
  )
  return product
}

export function registerProductHandlers() {
  ipcMain.handle('products:getAll', () => getAllProducts())
  ipcMain.handle('products:create', (_e, input) => createProduct(input))
  ipcMain.handle('products:update', (_e, id: number, input) => updateProduct(id, input))
  ipcMain.handle(
    'products:adjustStock',
    (_e, id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string) =>
      adjustStock(id, type, qty, note)
  )
}
```

- [ ] **Step 5: Chạy test**

```bash
npx vitest run tests/unit/handlers/products.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Đăng ký trong main.ts và cập nhật preload + types**

`electron/main.ts`:
```ts
import { registerProductHandlers } from './handlers/products'
// trong whenReady():
registerProductHandlers()
```

`electron/preload.ts` — thêm vào contextBridge:
```ts
products: {
  getAll: (): Promise<Product[]> => ipcRenderer.invoke('products:getAll'),
  create: (input: Omit<Product, 'id' | 'created_at' | 'stock_quantity' | 'is_active'>): Promise<Product | null> =>
    ipcRenderer.invoke('products:create', input),
  update: (id: number, input: Partial<Product>): Promise<Product | null> =>
    ipcRenderer.invoke('products:update', id, input),
  adjustStock: (id: number, type: 'in' | 'out' | 'adjust', qty: number, note: string): Promise<Product | null> =>
    ipcRenderer.invoke('products:adjustStock', id, type, qty, note),
},
```

`src/electron.d.ts` — thêm kiểu tương ứng.

- [ ] **Step 7: Commit**

```bash
git add electron/handlers/products.ts electron/main.ts electron/preload.ts \
        src/electron.d.ts src/types.ts tests/unit/handlers/products.test.ts
git commit -m "feat: add products IPC handler with stock management"
```

---

## Task 3: IPC handler cho OrderItems

**Files:**
- Create: `electron/handlers/orderItems.ts`
- Create: `tests/unit/handlers/orderItems.test.ts`

- [ ] **Step 1: Thêm type vào `src/types.ts`**

```ts
// thêm vào src/types.ts
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
```

- [ ] **Step 2: Viết failing tests**

```ts
// tests/unit/handlers/orderItems.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../electron/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../electron/db'
import { addOrderItem, getOrderItems, removeOrderItem } from '../../electron/handlers/orderItems'

describe('addOrderItem', () => {
  it('inserts order item and returns with subtotal', async () => {
    const mockItem = { id: 1, session_id: 5, product_id: 3, quantity: 2, unit_price: 30000, subtotal: 60000 }
    vi.mocked(db.queryOne).mockResolvedValue(mockItem)

    const result = await addOrderItem(5, 3, 2, 30000)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO order_items'),
      [5, 3, 2, 30000, 60000]
    )
    expect(result).toEqual(mockItem)
  })
})

describe('getOrderItems', () => {
  it('returns order items with product name', async () => {
    const mockItems = [{ id: 1, product_name: 'Bia Tiger', quantity: 2, subtotal: 60000 }]
    vi.mocked(db.query).mockResolvedValue(mockItems)

    const result = await getOrderItems(5)

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN products'),
      [5]
    )
    expect(result).toEqual(mockItems)
  })
})

describe('removeOrderItem', () => {
  it('deletes order item by id', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ id: 1 })

    await removeOrderItem(1)

    expect(db.queryOne).toHaveBeenCalledWith(
      'DELETE FROM order_items WHERE id = $1 RETURNING id',
      [1]
    )
  })
})
```

- [ ] **Step 3: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/handlers/orderItems.test.ts
```

- [ ] **Step 4: Viết `electron/handlers/orderItems.ts`**

```ts
// electron/handlers/orderItems.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { OrderItem } from '../../src/types'

export async function addOrderItem(
  sessionId: number,
  productId: number,
  quantity: number,
  unitPrice: number
): Promise<OrderItem | null> {
  const subtotal = quantity * unitPrice
  return queryOne<OrderItem>(
    `INSERT INTO order_items (session_id, product_id, quantity, unit_price, subtotal)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [sessionId, productId, quantity, unitPrice, subtotal]
  )
}

export async function getOrderItems(sessionId: number): Promise<(OrderItem & { product_name: string })[]> {
  return query(
    `SELECT oi.*, p.name AS product_name
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.session_id = $1
     ORDER BY oi.created_at`,
    [sessionId]
  )
}

export async function removeOrderItem(itemId: number): Promise<void> {
  await queryOne('DELETE FROM order_items WHERE id = $1 RETURNING id', [itemId])
}

export async function getOrderTotal(sessionId: number): Promise<number> {
  const result = await queryOne<{ total: string }>(
    'SELECT COALESCE(SUM(subtotal), 0) AS total FROM order_items WHERE session_id = $1',
    [sessionId]
  )
  return Number(result?.total ?? 0)
}

export function registerOrderItemHandlers() {
  ipcMain.handle(
    'orderItems:add',
    (_e, sessionId: number, productId: number, qty: number, price: number) =>
      addOrderItem(sessionId, productId, qty, price)
  )
  ipcMain.handle('orderItems:get', (_e, sessionId: number) => getOrderItems(sessionId))
  ipcMain.handle('orderItems:remove', (_e, itemId: number) => removeOrderItem(itemId))
  ipcMain.handle('orderItems:total', (_e, sessionId: number) => getOrderTotal(sessionId))
}
```

- [ ] **Step 5: Chạy test**

```bash
npx vitest run tests/unit/handlers/orderItems.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Đăng ký handlers**

`electron/main.ts`:
```ts
import { registerOrderItemHandlers } from './handlers/orderItems'
// registerOrderItemHandlers()
```

Cập nhật `preload.ts` và `electron.d.ts` tương tự Task 2.

- [ ] **Step 7: Commit**

```bash
git add electron/handlers/orderItems.ts electron/main.ts electron/preload.ts \
        src/electron.d.ts src/types.ts tests/unit/handlers/orderItems.test.ts
git commit -m "feat: add orderItems IPC handler"
```

---

## Task 4: IPC handler cho Invoices + Print

**Files:**
- Create: `electron/handlers/invoices.ts`
- Create: `electron/handlers/printer.ts`
- Create: `tests/unit/handlers/invoices.test.ts`

- [ ] **Step 1: Cài node-thermal-printer**

```bash
npm install node-thermal-printer
npm install -D @types/node
```

- [ ] **Step 2: Thêm type vào `src/types.ts`**

```ts
// thêm vào src/types.ts
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
```

- [ ] **Step 3: Viết `electron/handlers/printer.ts`**

```ts
// electron/handlers/printer.ts
import ThermalPrinter, { PrinterTypes, CharacterSet } from 'node-thermal-printer'
import { formatCurrency } from '../../src/lib/utils'
import type { InvoiceCreateInput } from '../../src/types'

export async function printInvoice(
  input: InvoiceCreateInput,
  invoiceNumber: string,
  printerPath: string
): Promise<void> {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: printerPath,
    characterSet: CharacterSet.PC857_TURKISH, // hỗ trợ tiếng Việt tốt nhất trên thermal
    removeSpecialCharacters: false,
    lineCharacter: '-',
    options: { timeout: 3000 },
  })

  const isConnected = await printer.isPrinterConnected()
  if (!isConnected) {
    throw new Error(`Máy in không kết nối tại ${printerPath}`)
  }

  printer.alignCenter()
  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.println(input.shopName)
  printer.bold(false)
  printer.setTextNormal()
  printer.println(input.shopAddress)
  printer.println(`Tel: ${input.shopPhone}`)
  printer.drawLine()

  printer.alignLeft()
  printer.println(`HD: #${invoiceNumber}`)
  printer.println(`Ban: ${input.tableName}`)
  if (input.customerName) {
    printer.println(`KH: ${input.customerName} (${input.customerPhone})`)
  }
  printer.drawLine()

  printer.bold(true)
  printer.println('GIO CHOI:')
  printer.bold(false)
  printer.leftRight(`  ${formatCurrency(input.playAmount)}`, '')

  if (input.orderItems.length > 0) {
    printer.drawLine()
    printer.bold(true)
    printer.println('DO UONG / THUC AN:')
    printer.bold(false)
    for (const item of input.orderItems) {
      printer.leftRight(`  ${item.product_name} x${item.quantity}`, formatCurrency(item.subtotal))
    }
  }

  printer.drawLine()
  printer.leftRight('Tong hang:', formatCurrency(input.itemsAmount))
  printer.leftRight('Tong choi:', formatCurrency(input.playAmount))
  if (input.discount > 0) {
    printer.leftRight('Giam gia:', `-${formatCurrency(input.discount)}`)
  }
  if (input.discountFromPoints > 0) {
    printer.leftRight(`Doi diem (${input.pointsRedeemed}d):`, `-${formatCurrency(input.discountFromPoints)}`)
  }
  printer.drawLine()
  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.leftRight('TONG CONG:', formatCurrency(input.finalAmount))
  printer.bold(false)
  printer.setTextNormal()

  if (input.pointsEarned > 0 && input.customerName) {
    printer.drawLine()
    printer.println(`Diem tich them: +${input.pointsEarned} diem`)
    const newBalance = (input.customerPoints ?? 0) + input.pointsEarned - input.pointsRedeemed
    printer.println(`Diem hien tai: ${newBalance} diem`)
  }

  printer.drawLine()
  printer.alignCenter()
  printer.println('Cam on quy khach!')
  printer.println('Hen gap lai!')
  printer.cut()

  await printer.execute()
}
```

- [ ] **Step 4: Viết failing tests cho invoices handler**

```ts
// tests/unit/handlers/invoices.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../electron/db', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}))

import * as db from '../../electron/db'
import { createInvoice, getNextInvoiceNumber } from '../../electron/handlers/invoices'

describe('getNextInvoiceNumber', () => {
  it('returns 00001 when no invoices exist', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ count: '0' })
    const result = await getNextInvoiceNumber()
    expect(result).toBe('00001')
  })

  it('returns next sequential number', async () => {
    vi.mocked(db.queryOne).mockResolvedValue({ max_num: '00042' })
    const result = await getNextInvoiceNumber()
    expect(result).toBe('00043')
  })
})

describe('createInvoice', () => {
  it('creates invoice record and returns it', async () => {
    const mockInvoice = { id: 1, invoice_number: '00001', final_amount: 200000 }
    vi.mocked(db.queryOne)
      .mockResolvedValueOnce({ max_num: null })  // getNextInvoiceNumber
      .mockResolvedValueOnce(mockInvoice)         // INSERT invoice
    vi.mocked(db.query).mockResolvedValue([])      // UPDATE customer points

    const result = await createInvoice({
      sessionId: 1, customerId: null, playAmount: 125000, itemsAmount: 75000,
      discount: 0, pointsRedeemed: 0, pointsEarned: 0,
      discountFromPoints: 0, finalAmount: 200000,
      shopName: 'Test', shopAddress: '', shopPhone: '',
      tableId: 1, tableName: 'Bàn 1', orderItems: [],
    })

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO invoices'),
      expect.any(Array)
    )
    expect(result).toEqual(mockInvoice)
  })
})
```

- [ ] **Step 5: Chạy test để xác nhận fail**

```bash
npx vitest run tests/unit/handlers/invoices.test.ts
```

- [ ] **Step 6: Viết `electron/handlers/invoices.ts`**

```ts
// electron/handlers/invoices.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'
import type { Invoice, InvoiceCreateInput } from '../../src/types'
import { printInvoice } from './printer'

export async function getNextInvoiceNumber(): Promise<string> {
  const result = await queryOne<{ max_num: string | null }>(
    "SELECT MAX(invoice_number) AS max_num FROM invoices"
  )
  const maxNum = result?.max_num ? parseInt(result.max_num, 10) : 0
  return String(maxNum + 1).padStart(5, '0')
}

export async function createInvoice(input: InvoiceCreateInput): Promise<Invoice | null> {
  const invoiceNumber = await getNextInvoiceNumber()

  const invoice = await queryOne<Invoice>(
    `INSERT INTO invoices
     (session_id, invoice_number, play_amount, items_amount, total_amount,
      discount, points_redeemed, discount_from_points, final_amount, points_earned)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      input.sessionId, invoiceNumber,
      input.playAmount, input.itemsAmount,
      input.playAmount + input.itemsAmount,
      input.discount, input.pointsRedeemed, input.discountFromPoints,
      input.finalAmount, input.pointsEarned,
    ]
  )

  if (invoice && input.customerId && input.pointsEarned > 0) {
    await query(
      `UPDATE customers
       SET points_balance = points_balance + $1 - $2,
           total_visits = total_visits + 1,
           total_spent = total_spent + $3
       WHERE id = $4`,
      [input.pointsEarned, input.pointsRedeemed, input.finalAmount, input.customerId]
    )
  }

  return invoice
}

export async function printAndMarkInvoice(
  invoiceId: number,
  input: InvoiceCreateInput,
  invoiceNumber: string,
  printerPath: string
): Promise<void> {
  await printInvoice(input, invoiceNumber, printerPath)
  await queryOne(
    "UPDATE invoices SET printed_at = NOW() WHERE id = $1 RETURNING id",
    [invoiceId]
  )
}

export function registerInvoiceHandlers() {
  ipcMain.handle('invoices:create', (_e, input: InvoiceCreateInput) =>
    createInvoice(input)
  )
  ipcMain.handle(
    'invoices:print',
    (_e, invoiceId: number, input: InvoiceCreateInput, invoiceNumber: string, printerPath: string) =>
      printAndMarkInvoice(invoiceId, input, invoiceNumber, printerPath)
  )
}
```

- [ ] **Step 7: Chạy test**

```bash
npx vitest run tests/unit/handlers/invoices.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 8: Đăng ký handlers**

```ts
// electron/main.ts
import { registerInvoiceHandlers } from './handlers/invoices'
// registerInvoiceHandlers()
```

- [ ] **Step 9: Commit**

```bash
git add electron/handlers/invoices.ts electron/handlers/printer.ts \
        electron/main.ts electron/preload.ts src/electron.d.ts src/types.ts \
        tests/unit/handlers/invoices.test.ts
git commit -m "feat: add invoice handler and ESC/POS thermal printer support"
```

---

## Task 5: Component InvoicePreview + trang Invoice

**Files:**
- Create: `src/components/InvoicePreview.tsx`
- Create: `src/components/OrderList.tsx`
- Create: `src/components/ProductPicker.tsx`
- Create: `src/pages/Invoice.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Viết `src/components/OrderList.tsx`**

```tsx
// src/components/OrderList.tsx
import type { OrderItem } from '../types'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'

interface Props {
  items: (OrderItem & { product_name: string })[]
  onRemove: (itemId: number) => void
  readOnly?: boolean
}

export default function OrderList({ items, onRemove, readOnly = false }: Props) {
  if (items.length === 0) {
    return <p className="text-gray-500 text-sm">Chưa có đồ uống / thức ăn</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between p-2 bg-gray-800 rounded">
          <span className="text-sm">{item.product_name} x{item.quantity}</span>
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-sm">{formatCurrency(item.subtotal)}</span>
            {!readOnly && (
              <Button
                size="sm" variant="ghost"
                className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                onClick={() => onRemove(item.id)}
              >
                ×
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Viết `src/components/ProductPicker.tsx`**

```tsx
// src/components/ProductPicker.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Product } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (product: Product, quantity: number) => Promise<void>
}

export default function ProductPicker({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const [loadingId, setLoadingId] = useState<number | null>(null)

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api().products.getAll(),
    enabled: open,
  })

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async (product: Product) => {
    setLoadingId(product.id)
    await onSelect(product, 1)
    setLoadingId(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Chọn đồ uống / thức ăn</DialogTitle>
        </DialogHeader>
        <Input
          className="bg-gray-800 border-gray-600"
          placeholder="Tìm sản phẩm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.map((product) => (
            <div key={product.id}
              className="flex items-center justify-between p-2 bg-gray-800 rounded">
              <div>
                <p className="text-sm font-medium">{product.name}</p>
                <p className="text-xs text-green-400">{formatCurrency(product.price)}</p>
                <p className="text-xs text-gray-500">Tồn: {product.stock_quantity} {product.unit}</p>
              </div>
              <Button
                size="sm"
                disabled={loadingId === product.id || product.stock_quantity <= 0}
                onClick={() => handleAdd(product)}
                className="bg-green-700 hover:bg-green-600"
              >
                {loadingId === product.id ? '...' : '+ Thêm'}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Viết `src/components/InvoicePreview.tsx`**

```tsx
// src/components/InvoicePreview.tsx
import type { InvoiceCreateInput } from '../types'
import { formatCurrency } from '../lib/utils'

interface Props {
  input: InvoiceCreateInput
  invoiceNumber: string
}

export default function InvoicePreview({ input, invoiceNumber }: Props) {
  return (
    <div className="font-mono text-xs bg-white text-black p-4 w-72 mx-auto shadow-lg">
      <div className="text-center mb-2">
        <p className="font-bold text-base">{input.shopName}</p>
        <p>{input.shopAddress}</p>
        <p>Tel: {input.shopPhone}</p>
      </div>
      <hr className="border-black my-1" />
      <p>HĐ: #{invoiceNumber}</p>
      <p>Bàn: {input.tableName}</p>
      {input.customerName && (
        <p>KH: {input.customerName} ({input.customerPhone})</p>
      )}
      <hr className="border-dashed border-black my-1" />

      <p className="font-bold">GIỜ CHƠI:</p>
      <div className="flex justify-between">
        <span>  Tiền giờ</span>
        <span>{formatCurrency(input.playAmount)}</span>
      </div>

      {input.orderItems.length > 0 && (
        <>
          <hr className="border-dashed border-black my-1" />
          <p className="font-bold">ĐỒ UỐNG / THỨC ĂN:</p>
          {input.orderItems.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>  {item.product_name} x{item.quantity}</span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </>
      )}

      <hr className="border-dashed border-black my-1" />
      <div className="flex justify-between">
        <span>Tổng hàng:</span>
        <span>{formatCurrency(input.itemsAmount)}</span>
      </div>
      <div className="flex justify-between">
        <span>Tổng chơi:</span>
        <span>{formatCurrency(input.playAmount)}</span>
      </div>
      {input.discount > 0 && (
        <div className="flex justify-between">
          <span>Giảm giá:</span>
          <span>-{formatCurrency(input.discount)}</span>
        </div>
      )}
      {input.discountFromPoints > 0 && (
        <div className="flex justify-between">
          <span>Đổi điểm ({input.pointsRedeemed}đ):</span>
          <span>-{formatCurrency(input.discountFromPoints)}</span>
        </div>
      )}
      <hr className="border-black my-1" />
      <div className="flex justify-between font-bold text-sm">
        <span>TỔNG CỘNG:</span>
        <span>{formatCurrency(input.finalAmount)}</span>
      </div>
      {input.pointsEarned > 0 && (
        <>
          <hr className="border-dashed border-black my-1" />
          <p>Điểm tích: +{input.pointsEarned} điểm</p>
          <p>Điểm hiện tại: {(input.customerPoints ?? 0) + input.pointsEarned} điểm</p>
        </>
      )}
      <hr className="border-black my-1" />
      <p className="text-center">Cảm ơn quý khách!</p>
    </div>
  )
}
```

- [ ] **Step 4: Viết `src/pages/Invoice.tsx`**

```tsx
// src/pages/Invoice.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Session, InvoiceCreateInput } from '../types'
import { api } from '../lib/ipc'
import { calcInvoice, calcPointsEarned, calcDiscountFromPoints } from '../lib/invoiceCalc'
import InvoicePreview from '../components/InvoicePreview'
import OrderList from '../components/OrderList'
import ProductPicker from '../components/ProductPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '../lib/utils'

interface Props {
  session: Session & { table_name: string; hourly_rate: number }
  playAmount: number
  onComplete: () => void
}

export default function InvoicePage({ session, playAmount, onComplete }: Props) {
  const queryClient = useQueryClient()
  const [discount, setDiscount] = useState(0)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)
  const [showPicker, setShowPicker] = useState(false)

  // TODO Plan 3: fetch loyalty settings từ DB
  const VND_PER_POINT = 100
  const POINTS_PER_10K = 1

  const { data: orderItems = [] } = useQuery({
    queryKey: ['orderItems', session.id],
    queryFn: () => api().orderItems.get(session.id),
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api().settings.getAll(),
  })

  const itemsAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0)
  const discountFromPoints = calcDiscountFromPoints(pointsToRedeem, VND_PER_POINT)
  const { totalAmount, finalAmount } = calcInvoice({
    playAmount, itemsAmount, discount, pointsRedeemed: pointsToRedeem, vndPerPoint: VND_PER_POINT,
  })
  const pointsEarned = calcPointsEarned(finalAmount, POINTS_PER_10K)

  const shopName = settings?.find((s: { key: string }) => s.key === 'shop_name')?.value ?? 'Quán Bida'
  const shopAddress = settings?.find((s: { key: string }) => s.key === 'address')?.value ?? ''
  const shopPhone = settings?.find((s: { key: string }) => s.key === 'phone')?.value ?? ''
  const printerPath = settings?.find((s: { key: string }) => s.key === 'printer_path')?.value ?? 'USB001'

  const invoiceInput: InvoiceCreateInput = {
    sessionId: session.id,
    customerId: session.customer_id,
    playAmount, itemsAmount, discount,
    pointsRedeemed: pointsToRedeem,
    discountFromPoints, finalAmount, pointsEarned,
    shopName, shopAddress, shopPhone,
    tableId: session.table_id,
    tableName: session.table_name,
    orderItems: orderItems.map((i) => ({
      product_name: i.product_name, quantity: i.quantity, subtotal: i.subtotal,
    })),
  }

  const addItemMutation = useMutation({
    mutationFn: ({ productId, quantity, price }: { productId: number; quantity: number; price: number }) =>
      api().orderItems.add(session.id, productId, quantity, price),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', session.id] }),
  })

  const removeItemMutation = useMutation({
    mutationFn: (itemId: number) => api().orderItems.remove(itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', session.id] }),
  })

  const checkoutMutation = useMutation({
    mutationFn: async (print: boolean) => {
      await api().sessions.close(session.id, playAmount)
      const invoice = await api().invoices.create(invoiceInput)
      if (print && invoice) {
        await api().invoices.print(invoice.id, invoiceInput, invoice.invoice_number, printerPath)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      onComplete()
    },
  })

  const invoiceNumber = '-----' // preview placeholder

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {/* Left: Order management */}
      <div>
        <h2 className="text-xl font-bold mb-4">Bàn {session.table_name}</h2>

        <div className="bg-gray-900 rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Đồ uống / thức ăn</h3>
            <Button size="sm" onClick={() => setShowPicker(true)}
              className="bg-green-700 hover:bg-green-600">
              + Thêm
            </Button>
          </div>
          <OrderList items={orderItems} onRemove={(id) => removeItemMutation.mutate(id)} />
        </div>

        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <div>
            <Label>Giảm giá (đồng)</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600"
              value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </div>
          <div>
            <Label>Đổi điểm (1 điểm = {formatCurrency(VND_PER_POINT)})</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600"
              value={pointsToRedeem} onChange={(e) => setPointsToRedeem(Number(e.target.value))} />
          </div>
          <div className="pt-2 border-t border-gray-700 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Tổng chơi:</span>
              <span>{formatCurrency(playAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tổng hàng:</span>
              <span>{formatCurrency(itemsAmount)}</span>
            </div>
            <div className="flex justify-between font-bold text-base">
              <span>Tổng cộng:</span>
              <span className="text-green-400">{formatCurrency(finalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Invoice preview */}
      <div>
        <h3 className="font-semibold mb-3 text-center">Preview hóa đơn</h3>
        <InvoicePreview input={invoiceInput} invoiceNumber={invoiceNumber} />

        <div className="flex gap-3 mt-6">
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            disabled={checkoutMutation.isPending}
            onClick={() => checkoutMutation.mutate(true)}
          >
            In hóa đơn
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-gray-600"
            disabled={checkoutMutation.isPending}
            onClick={() => checkoutMutation.mutate(false)}
          >
            Lưu không in
          </Button>
        </div>
      </div>

      <ProductPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={async (product, qty) => {
          await addItemMutation.mutateAsync({
            productId: product.id, quantity: qty, price: product.price,
          })
          setShowPicker(false)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Cập nhật `src/App.tsx` để navigate đến Invoice**

```tsx
// Cập nhật type View
type View =
  | { page: 'dashboard' }
  | { page: 'session'; tableId: number }
  | { page: 'invoice'; session: Session & { table_name: string; hourly_rate: number }; playAmount: number }

// Trong App.tsx thêm import InvoicePage và case:
import InvoicePage from './pages/Invoice'

// handleCheckout:
const handleCheckout = (session, playAmount) => {
  setView({ page: 'invoice', session, playAmount })
}

// Trong JSX:
{view.page === 'invoice' && (
  <InvoicePage
    session={view.session}
    playAmount={view.playAmount}
    onComplete={() => setView({ page: 'dashboard' })}
  />
)}
```

- [ ] **Step 6: Thêm `settings` IPC handler tạm**

Thêm vào `electron/handlers/` một handler đơn giản:
```ts
// electron/handlers/settings.ts
import { ipcMain } from 'electron'
import { query, queryOne } from '../db'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', () =>
    query<{ key: string; value: string }>('SELECT * FROM settings')
  )
  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    queryOne(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2 RETURNING *',
      [key, value]
    )
  )
}
```

Đăng ký và thêm vào preload/electron.d.ts.

- [ ] **Step 7: Test thủ công**

```bash
npm run dev
```

Kiểm tra:
- [ ] Mở phiên → xem session → nhấn Checkout → trang Invoice
- [ ] Thêm đồ uống từ ProductPicker
- [ ] Xóa item khỏi danh sách
- [ ] Preview hóa đơn cập nhật realtime
- [ ] Nhập giảm giá, tổng thay đổi đúng
- [ ] "In hóa đơn" → nếu không có máy in thật, xem có thông báo lỗi không
- [ ] "Lưu không in" → về Dashboard, bàn trở lại xanh

- [ ] **Step 8: Commit**

```bash
git add src/components/InvoicePreview.tsx src/components/OrderList.tsx \
        src/components/ProductPicker.tsx src/pages/Invoice.tsx src/App.tsx \
        electron/handlers/settings.ts electron/main.ts electron/preload.ts
git commit -m "feat: add Invoice page with preview, order management, and print"
```

---

## Task 6: Trang quản lý sản phẩm

**Files:**
- Create: `src/pages/Products.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Viết `src/pages/Products.tsx`**

```tsx
// src/pages/Products.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Product } from '../types'
import { api } from '../lib/ipc'
import { formatCurrency } from '../lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'

type ModalMode = 'create' | 'edit' | 'stock' | null

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5 })
  const [stockQty, setStockQty] = useState(0)
  const [stockNote, setStockNote] = useState('')

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api().products.getAll(),
  })

  const createMutation = useMutation({
    mutationFn: () => api().products.create({ ...form, price: Number(form.price) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
  })

  const updateMutation = useMutation({
    mutationFn: () => selected ? api().products.update(selected.id, { ...form, price: Number(form.price) }) : Promise.resolve(null),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
  })

  const stockMutation = useMutation({
    mutationFn: () => selected ? api().products.adjustStock(selected.id, 'in', stockQty, stockNote) : Promise.resolve(null),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); setMode(null) },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => api().products.update(id, { is_active: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  const lowStockProducts = products.filter((p) => p.stock_quantity <= p.min_stock_alert)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Quản lý sản phẩm</h1>
        <Button onClick={() => { setForm({ name: '', category: 'drink', price: 0, unit: 'lon', min_stock_alert: 5 }); setMode('create') }}
          className="bg-green-700 hover:bg-green-600">
          + Thêm sản phẩm
        </Button>
      </div>

      {lowStockProducts.length > 0 && (
        <div className="bg-red-900 border border-red-500 rounded-lg p-3 mb-4">
          <p className="text-red-300 font-medium">⚠️ Sắp hết hàng: {lowStockProducts.map((p) => p.name).join(', ')}</p>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="text-left p-3">Tên</th>
              <th className="text-left p-3">Loại</th>
              <th className="text-right p-3">Giá</th>
              <th className="text-right p-3">Tồn kho</th>
              <th className="text-right p-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800">
                <td className="p-3">{p.name}</td>
                <td className="p-3">
                  <Badge variant="outline" className="text-xs">
                    {p.category === 'drink' ? '🥤 Đồ uống' : p.category === 'food' ? '🍜 Đồ ăn' : 'Khác'}
                  </Badge>
                </td>
                <td className="p-3 text-right text-green-400">{formatCurrency(p.price)}</td>
                <td className="p-3 text-right">
                  <span className={p.stock_quantity <= p.min_stock_alert ? 'text-red-400' : ''}>
                    {p.stock_quantity} {p.unit}
                  </span>
                </td>
                <td className="p-3 text-right space-x-2">
                  <Button size="sm" variant="outline" className="border-gray-600 h-7 text-xs"
                    onClick={() => { setSelected(p); setStockQty(0); setStockNote(''); setMode('stock') }}>
                    Nhập kho
                  </Button>
                  <Button size="sm" variant="outline" className="border-gray-600 h-7 text-xs"
                    onClick={() => {
                      setSelected(p)
                      setForm({ name: p.name, category: p.category, price: p.price, unit: p.unit, min_stock_alert: p.min_stock_alert })
                      setMode('edit')
                    }}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400 h-7 text-xs"
                    onClick={() => deactivateMutation.mutate(p.id)}>
                    Xoá
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit modal */}
      <Dialog open={mode === 'create' || mode === 'edit'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Tên</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Giá (đồng)</Label>
              <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            <div><Label>Đơn vị</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>Cảnh báo tồn dưới</Label>
              <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={form.min_stock_alert}
                onChange={(e) => setForm({ ...form, min_stock_alert: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} className="border-gray-600">Huỷ</Button>
            <Button className="bg-green-700 hover:bg-green-600"
              onClick={() => mode === 'create' ? createMutation.mutate() : updateMutation.mutate()}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock modal */}
      <Dialog open={mode === 'stock'} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Nhập kho — {selected?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Tồn hiện tại: <span className="text-white">{selected?.stock_quantity} {selected?.unit}</span></p>
            <div><Label>Số lượng nhập thêm</Label>
              <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={stockQty}
                onChange={(e) => setStockQty(Number(e.target.value))} /></div>
            <div><Label>Ghi chú</Label>
              <Input className="mt-1 bg-gray-800 border-gray-600" value={stockNote}
                onChange={(e) => setStockNote(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)} className="border-gray-600">Huỷ</Button>
            <Button className="bg-green-700 hover:bg-green-600" onClick={() => stockMutation.mutate()}>
              Nhập kho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Thêm navigation vào `src/App.tsx`**

Cập nhật nav và View type:
```tsx
// Thêm vào nav:
<button onClick={() => setView({ page: 'products' })} className="text-sm text-gray-300 hover:text-white">Sản phẩm</button>

// Thêm vào View type:
| { page: 'products' }

// Thêm vào JSX:
{view.page === 'products' && <ProductsPage />}
```

- [ ] **Step 3: Test thủ công**

```bash
npm run dev
```

Kiểm tra:
- [ ] Trang Products hiển thị danh sách
- [ ] Thêm sản phẩm mới
- [ ] Sửa sản phẩm
- [ ] Nhập kho → số lượng tăng
- [ ] Sản phẩm tồn ≤ ngưỡng → hiện cảnh báo đỏ

- [ ] **Step 4: Commit**

```bash
git add src/pages/Products.tsx src/App.tsx
git commit -m "feat: add Products management page with inventory alerts"
```

---

## Task 7: Chạy toàn bộ tests và build

- [ ] **Step 1: Chạy unit tests**

```bash
npx vitest run
```

Expected: PASS (≥ 18 tests).

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: Không có lỗi TypeScript.

- [ ] **Step 3: Smoke test toàn bộ luồng**

```bash
npm run dev
```

Luồng đầy đủ:
- [ ] Mở bàn → chơi
- [ ] Thêm đồ uống vào phiên
- [ ] Xem Session page → Checkout
- [ ] Trang Invoice: thêm thêm đồ uống, nhập giảm giá
- [ ] "Lưu không in" → về Dashboard, bàn xanh
- [ ] Products: thêm sản phẩm, nhập kho

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Plan 2 complete — Invoice, print, and products management"
```

---

## Checklist Plan 2

- [ ] Business logic tính hóa đơn có unit tests
- [ ] Products CRUD + tồn kho + cảnh báo hàng sắp hết
- [ ] OrderItems: thêm/xóa đồ uống trong phiên
- [ ] Invoice: preview 80mm realtime, áp giảm giá
- [ ] Thermal print ESC/POS qua node-thermal-printer
- [ ] Lưu invoice vào DB khi checkout
- [ ] Trừ tồn kho tự động sau khi checkout
- [ ] Navigation đến trang Products

**Tiếp theo:** Xem Plan 3 tại `docs/superpowers/plans/2026-05-26-plan-3-customers-reports.md`

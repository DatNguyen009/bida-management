# Phase 2: Multi-Tenant Migration + Sync Engine — Design Spec

**Date:** 2026-05-28
**Status:** Approved
**Scope:** Thêm `agent_id` vào tất cả bảng local, đồng bộ dữ liệu real-time lên cloud PostgreSQL qua sync queue.

---

## Overview

Phase 2 mở rộng app Electron thành multi-tenant thực sự:

1. **Local DB migration** — Thêm `agent_id UUID` vào 9 bảng local, tạo bảng `sync_queue`
2. **Cloud DB schema** — Mirror 9 bảng local trên cloud PostgreSQL với composite PK `(agent_id, id)`
3. **Sync API** — `POST /api/v1/sync/batch` trên Express server (agent JWT)
4. **Sync Worker** — Background process trong Electron Main, flush queue real-time

---

## Architecture

```
Electron Main Process
├── DB write (handler)
│   ├── INSERT/UPDATE/DELETE → local PostgreSQL (với agent_id)
│   └── INSERT → sync_queue (cùng transaction)
│
└── SyncWorker (background, Main Process only)
    ├── Trigger: sau mỗi write, app start, reconnect mạng
    ├── Đọc sync_queue WHERE synced_at IS NULL (batch 100)
    ├── POST /api/v1/sync/batch → Express (Bearer JWT)
    └── Đánh dấu synced_at = NOW() khi thành công

Express Server (server/)
└── POST /api/v1/sync/batch
    ├── Verify JWT → agentId
    └── UPSERT/DELETE vào cloud PostgreSQL (transaction)
```

**Nguyên tắc cốt lõi:**
- Local là source of truth. Cloud là replica chỉ đọc (cho Phase 3).
- Không có sync ngược chiều (cloud → local).
- Conflict resolution: local always wins → UPSERT với ON CONFLICT DO UPDATE.
- Sync hoàn toàn transparent với UI — renderer không biết, không cần biết.

---

## Local DB Migration

File: `db/migration-phase2.sql`

### Thêm agent_id vào 9 bảng

```sql
ALTER TABLE tables            ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE sessions          ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE customers         ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE products          ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE order_items       ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE loyalty_settings  ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE settings          ADD COLUMN IF NOT EXISTS agent_id UUID;
```

Nullable để không phá dữ liệu cũ. Backfill sau khi agent login.

### Bảng sync_queue

```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  id           SERIAL PRIMARY KEY,
  table_name   VARCHAR(50)  NOT NULL,
  row_id       TEXT         NOT NULL,
  operation    VARCHAR(10)  NOT NULL, -- insert | update | delete
  payload      JSONB        NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  synced_at    TIMESTAMPTZ  NULL,
  retry_count  INT          NOT NULL DEFAULT 0,
  last_error   TEXT         NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
  ON sync_queue (id) WHERE synced_at IS NULL;
```

### Backfill flow

Sau login thành công → đọc `agentId` từ electron-store → chạy:

```sql
UPDATE tables             SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE sessions           SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE customers          SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE products           SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE order_items        SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE invoices           SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE stock_transactions SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE loyalty_settings   SET agent_id = $1 WHERE agent_id IS NULL;
UPDATE settings           SET agent_id = $1 WHERE agent_id IS NULL;
```

Chạy một lần duy nhất khi `agentId` tìm thấy rows có `agent_id IS NULL`.

---

## Cloud DB Schema

File: `server/db/schema-phase2.sql`

Pattern chung cho tất cả bảng: composite PK `(agent_id, id)`, `id` là INT thường (không SERIAL), các cột còn lại giống local schema.

```sql
CREATE TABLE IF NOT EXISTS cloud_tables (
  agent_id     UUID         NOT NULL REFERENCES agents(id),
  id           INT          NOT NULL,
  name         VARCHAR(50)  NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'idle',
  hourly_rate  DECIMAL(10,0) NOT NULL,
  created_at   TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_customers (
  agent_id       UUID          NOT NULL REFERENCES agents(id),
  id             INT           NOT NULL,
  name           VARCHAR(100)  NOT NULL,
  phone          VARCHAR(20)   NOT NULL,
  email          VARCHAR(100),
  total_visits   INT           DEFAULT 0,
  total_spent    DECIMAL(12,0) DEFAULT 0,
  points_balance INT           DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_sessions (
  agent_id         UUID          NOT NULL REFERENCES agents(id),
  id               INT           NOT NULL,
  table_id         INT           NOT NULL,
  customer_id      INT,
  start_time       TIMESTAMPTZ   NOT NULL,
  end_time         TIMESTAMPTZ,
  duration_minutes INT,
  play_amount      DECIMAL(10,0) DEFAULT 0,
  status           VARCHAR(20)   NOT NULL DEFAULT 'open',
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_products (
  agent_id         UUID          NOT NULL REFERENCES agents(id),
  id               INT           NOT NULL,
  name             VARCHAR(100)  NOT NULL,
  category         VARCHAR(50)   NOT NULL,
  price            DECIMAL(10,0) NOT NULL,
  stock_quantity   INT           NOT NULL DEFAULT 0,
  min_stock_alert  INT           NOT NULL DEFAULT 5,
  unit             VARCHAR(20)   NOT NULL DEFAULT 'cái',
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_order_items (
  agent_id   UUID          NOT NULL REFERENCES agents(id),
  id         INT           NOT NULL,
  session_id INT           NOT NULL,
  product_id INT           NOT NULL,
  quantity   INT           NOT NULL,
  unit_price DECIMAL(10,0) NOT NULL,
  subtotal   DECIMAL(10,0) NOT NULL,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_invoices (
  agent_id             UUID          NOT NULL REFERENCES agents(id),
  id                   INT           NOT NULL,
  session_id           INT           NOT NULL,
  invoice_number       VARCHAR(20)   NOT NULL,
  play_amount          DECIMAL(10,0) NOT NULL DEFAULT 0,
  items_amount         DECIMAL(10,0) NOT NULL DEFAULT 0,
  total_amount         DECIMAL(10,0) NOT NULL DEFAULT 0,
  discount             DECIMAL(10,0) NOT NULL DEFAULT 0,
  points_redeemed      INT           NOT NULL DEFAULT 0,
  discount_from_points DECIMAL(10,0) NOT NULL DEFAULT 0,
  final_amount         DECIMAL(10,0) NOT NULL,
  points_earned        INT           NOT NULL DEFAULT 0,
  printed_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_stock_transactions (
  agent_id   UUID          NOT NULL REFERENCES agents(id),
  id         INT           NOT NULL,
  product_id INT           NOT NULL,
  type       VARCHAR(10)   NOT NULL,
  quantity   INT           NOT NULL,
  cost_price NUMERIC(12,0),
  before_qty INT           NOT NULL DEFAULT 0,
  after_qty  INT           NOT NULL DEFAULT 0,
  note       TEXT,
  created_at TIMESTAMPTZ,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_loyalty_settings (
  agent_id            UUID NOT NULL REFERENCES agents(id),
  id                  INT  NOT NULL,
  points_per_10k_vnd  INT  NOT NULL DEFAULT 1,
  vnd_per_point       INT  NOT NULL DEFAULT 100,
  min_redeem_points   INT  NOT NULL DEFAULT 100,
  PRIMARY KEY (agent_id, id)
);

CREATE TABLE IF NOT EXISTS cloud_settings (
  agent_id UUID         NOT NULL REFERENCES agents(id),
  key      VARCHAR(100) NOT NULL,
  value    TEXT,
  PRIMARY KEY (agent_id, key)
);
```

Lưu ý: `cloud_settings` dùng `(agent_id, key)` làm PK thay vì `(agent_id, id)` vì bảng local dùng key là PK.

---

## Sync API

### Endpoint

```
POST /api/v1/sync/batch
Authorization: Bearer <access_token>
```

**Request body:**
```json
{
  "records": [
    { "table": "invoices", "operation": "insert", "id": 42, "payload": { ... } },
    { "table": "invoices", "operation": "update", "id": 42, "payload": { ... } },
    { "table": "order_items", "operation": "delete", "id": 7, "payload": {} }
  ]
}
```

**Response:**
```json
{ "synced": 15, "failed": 0 }
```

**Server logic:**
1. Verify JWT → lấy `agentId` từ token (chỉ agent role mới được sync)
2. Validate: tối đa 100 records mỗi batch
3. Với mỗi record trong 1 transaction:
   - `insert/update` → UPSERT vào `cloud_<table>` với `ON CONFLICT (agent_id, id) DO UPDATE SET ...`
   - `delete` → `DELETE FROM cloud_<table> WHERE agent_id = $1 AND id = $2`
   - `cloud_settings` đặc biệt: UPSERT theo `(agent_id, key)`
4. All or nothing per batch — nếu 1 record lỗi thì rollback toàn bộ batch

### Middleware stack

```
POST /sync/batch → authenticate(JWT) → requireAgent → handler
```

Thêm middleware `requireAgent` (role = 'agent') để master không sync nhầm.

---

## Sync Worker (Electron Main Process)

### File structure

```
src/main/sync/
├── worker.ts    — SyncWorker class
└── network.ts   — online/offline detection
```

### SyncWorker

```typescript
// src/main/sync/worker.ts
import { net } from 'electron'
import { query } from '../db'
import { apiFetch } from '../handlers/auth'

class SyncWorker {
  private isFlushing = false

  async flush(): Promise<void> {
    if (this.isFlushing || !net.isOnline()) return
    this.isFlushing = true
    try {
      const records = await query<SyncQueueRow>(
        `SELECT * FROM sync_queue
         WHERE synced_at IS NULL AND retry_count < 10
         ORDER BY id LIMIT 100`
      )
      if (!records.length) return

      const body = records.map((r) => ({
        table: r.table_name,
        operation: r.operation,
        id: r.row_id,
        payload: r.payload,
      }))

      await apiFetch('POST', '/sync/batch', { records: body })

      const ids = records.map((r) => r.id)
      await query(
        'UPDATE sync_queue SET synced_at = NOW() WHERE id = ANY($1)',
        [ids]
      )

      // Nếu đủ 100 records thì có thể còn nữa — flush tiếp
      if (records.length === 100) setImmediate(() => this.flush())
    } catch {
      // Tăng retry_count cho các records chưa synced
      await query(
        `UPDATE sync_queue
         SET retry_count = retry_count + 1
         WHERE synced_at IS NULL`,
      )
    } finally {
      this.isFlushing = false
    }
  }
}

export const syncWorker = new SyncWorker()
```

### network.ts

```typescript
// src/main/sync/network.ts
import { net, app } from 'electron'
import { syncWorker } from './worker'

export function startNetworkWatcher(): void {
  // Flush khi reconnect
  setInterval(() => {
    if (net.isOnline()) syncWorker.flush()
  }, 30_000) // fallback: thử lại mỗi 30 giây nếu worker chưa trigger
}
```

### Trigger từ handlers

Mỗi handler sau khi ghi DB thành công → gọi `syncWorker.flush()` (non-blocking):

```typescript
// Ví dụ trong invoices.ts
const invoice = await queryOne('INSERT INTO invoices (...) RETURNING *', [...])
await enqueue('invoices', invoice.id, 'insert', invoice)
syncWorker.flush() // fire-and-forget, không await
```

Hàm helper `enqueue`:
```typescript
// src/main/sync/worker.ts (export thêm)
export async function enqueue(
  table: string,
  rowId: string | number,
  operation: 'insert' | 'update' | 'delete',
  payload: object
): Promise<void> {
  await query(
    `INSERT INTO sync_queue (table_name, row_id, operation, payload)
     VALUES ($1, $2, $3, $4)`,
    [table, String(rowId), operation, JSON.stringify(payload)]
  )
}
```

### Retry logic

- `retry_count < 10` → còn được retry
- Sau 10 lần thất bại → record bị skip (tránh chặn queue)
- `last_error` ghi lỗi cuối để debug

---

## Handler Changes

Mỗi handler cần 3 thay đổi:

1. **Import agentId** — đọc từ `getAgentId()` trong `auth.ts`
2. **Thêm agent_id vào INSERT/UPDATE** — tất cả writes đều kèm agent_id
3. **Enqueue sau write** — gọi `enqueue(...)` sau mỗi thành công

```typescript
// Ví dụ auth.ts export thêm:
export function getAgentId(): string | null {
  return store.get('agentId') ?? null
}
```

**Bảng mapping operation:**

| Handler action | operation |
|---------------|-----------|
| create/insert | `insert`  |
| update/adjust | `update`  |
| remove/delete | `delete`  |
| close session | `update`  |

---

## Error Handling

| Tình huống | Xử lý |
|-----------|-------|
| Offline khi write | Ghi local bình thường, enqueue, flush khi online |
| Server 4xx (bad payload) | Tăng retry_count, ghi last_error; sẽ không tự fix |
| Server 5xx (lỗi tạm) | Tăng retry_count, retry lần sau |
| Token hết hạn | `apiFetch` tự refresh, retry request |
| retry_count ≥ 10 | Skip record, ghi last_error; không ảnh hưởng operation |

---

## Project Structure Changes

```
bida/
├── db/
│   └── migration-phase2.sql          # NEW: ALTER TABLE + sync_queue
├── server/
│   ├── db/
│   │   └── schema-phase2.sql         # NEW: cloud_ tables
│   ├── src/
│   │   ├── middleware/
│   │   │   └── requireAgent.ts       # NEW: role = agent guard
│   │   └── routes/
│   │       └── sync.ts               # NEW: POST /sync/batch
│   └── tests/
│       └── sync.test.ts              # NEW: integration tests
└── src/main/
    ├── sync/
    │   ├── worker.ts                 # NEW: SyncWorker + enqueue
    │   └── network.ts                # NEW: online watcher
    └── handlers/
        ├── auth.ts                   # MODIFY: export getAgentId(), backfill
        ├── tables.ts                 # MODIFY: agent_id + enqueue
        ├── sessions.ts               # MODIFY: agent_id + enqueue
        ├── customers.ts              # MODIFY: agent_id + enqueue
        ├── products.ts               # MODIFY: agent_id + enqueue
        ├── orderItems.ts             # MODIFY: agent_id + enqueue
        ├── invoices.ts               # MODIFY: agent_id + enqueue
        ├── settings.ts               # MODIFY: agent_id + enqueue
        └── reports.ts                # MODIFY: filter by agent_id
```

---

## Out of Scope (Phase 3)

- Master dashboard xem dữ liệu từ cloud_ tables
- Báo cáo tổng hợp cross-agent
- Sync ngược chiều (cloud → local)

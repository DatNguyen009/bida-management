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

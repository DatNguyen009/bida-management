// src/renderer/src/lib/promoCalc.ts
import type { Promotion, AppliedPromoResult } from '../types'

export function applyPromotions(
  promos: Promotion[],
  playAmount: number,
  itemsAmount: number
): { items: AppliedPromoResult[]; totalDiscount: number } {
  let remaining = playAmount + itemsAmount
  const items: AppliedPromoResult[] = []

  // time_slot & event trước, voucher sau
  const sorted = [...promos].sort((a, b) =>
    a.type === 'voucher' ? 1 : b.type === 'voucher' ? -1 : 0
  )

  for (const p of sorted) {
    const base =
      p.apply_to === 'play'  ? playAmount  :
      p.apply_to === 'items' ? itemsAmount :
      remaining

    let amount = p.discount_type === 'percent'
      ? base * p.discount_value / 100
      : p.discount_value

    if (p.max_discount != null) amount = Math.min(amount, p.max_discount)
    amount = Math.min(amount, remaining)
    amount = Math.max(0, amount)

    remaining -= amount
    items.push({ id: p.id, name: p.name, amount: Math.round(amount) })
  }

  return { items, totalDiscount: items.reduce((s, i) => s + i.amount, 0) }
}

export function formatPromoLabel(p: Promotion): string {
  const value = p.discount_type === 'percent'
    ? `${p.discount_value}%`
    : `${p.discount_value.toLocaleString('vi-VN')}đ`
  return `${p.name} −${value}`
}

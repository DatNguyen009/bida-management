interface InvoiceInput {
  playAmount: number
  itemsAmount: number
  discount: number
  pointsRedeemed: number
  vndPerPoint: number
  promoDiscount?: number
}

interface InvoiceResult {
  totalAmount: number
  discountFromPoints: number
  finalAmount: number
}

export function calcInvoice(input: InvoiceInput): InvoiceResult {
  const { playAmount, itemsAmount, discount, pointsRedeemed, vndPerPoint, promoDiscount } = input
  const totalAmount = playAmount + itemsAmount
  const discountFromPoints = pointsRedeemed * vndPerPoint
  const finalAmount = totalAmount - (promoDiscount ?? 0) - discount - discountFromPoints
  return { totalAmount, discountFromPoints, finalAmount: Math.max(0, finalAmount) }
}

export function calcPointsEarned(finalAmount: number, pointsPer10k: number): number {
  return Math.floor(finalAmount / 10000) * pointsPer10k
}

export function calcDiscountFromPoints(points: number, vndPerPoint: number): number {
  return points * vndPerPoint
}

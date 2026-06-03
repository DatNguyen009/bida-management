// Định dạng tiền VND. API trả DECIMAL dưới dạng string nên phải ép Number trước
// (String.prototype.toLocaleString không thêm dấu phân cách nghìn).
export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value)
  return (Number.isFinite(n) ? n : 0).toLocaleString('vi-VN') + 'đ'
}

// Dạng rút gọn cho trục biểu đồ: 1.5M / 250k
export function formatCurrencyShort(value: number | string | null | undefined): string {
  const n = Number(value) || 0
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${(n / 1000).toFixed(0)}k`
}

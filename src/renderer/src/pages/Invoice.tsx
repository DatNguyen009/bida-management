import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Session, InvoiceCreateInput, Customer } from '../types'
import { api } from '../lib/ipc'
import { calcInvoice, calcPointsEarned, calcDiscountFromPoints } from '../lib/invoiceCalc'
import InvoicePreview from '../components/InvoicePreview'
import OrderList from '../components/OrderList'
import CustomerSearchInput from '../components/CustomerSearchInput'
import ProductPicker from '../components/ProductPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '../lib/utils'
import { buildVietQRUrl, isBankConfigured } from '../lib/vietqr'
import { toast } from 'sonner'
import { applyPromotions, formatPromoLabel } from '../lib/promoCalc'
import type { Promotion, AppliedPromoResult } from '../types'

interface Props {
  session: Session & { table_name: string; hourly_rate: number }
  playAmount: number
  onComplete: () => void
}

export default function InvoicePage({ session, playAmount, onComplete }: Props) {
  const queryClient = useQueryClient()
  const [discount, setDiscount] = useState(0)
  const [appliedPromos, setAppliedPromos] = useState<Promotion[]>([])
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)
  const [pointsError, setPointsError] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  type PaymentStep = 'select' | 'cash' | 'bank'
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('select')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash')
  const [cashReceived, setCashReceived] = useState<number | ''>('')

  const { data: orderItems = [] } = useQuery({
    queryKey: ['orderItems', session.id],
    queryFn: () => api().orderItems.get(session.id),
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api().settings.getAll(),
  })

  const { data: loyaltySettings } = useQuery({
    queryKey: ['loyalty', 'settings'],
    queryFn: () => window.api.loyalty.getSettings(),
  })

  const { data: autoPromos = [] } = useQuery({
    queryKey: ['promotions', 'active'],
    queryFn: () => window.api.promotions.getActive(new Date().toISOString()),
    refetchInterval: 60000,
  })

  // Merge auto promos with manually added vouchers (avoid duplicates)
  const allAppliedPromos: Promotion[] = [
    ...autoPromos,
    ...appliedPromos.filter(p => !autoPromos.some(a => a.id === p.id)),
  ]

  const VND_PER_POINT = loyaltySettings?.vndPerPoint ?? 100
  const POINTS_PER_10K = loyaltySettings?.pointsPer10k ?? 1
  const MIN_REDEEM = loyaltySettings?.minRedeemPoints ?? 100

  const itemsAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0)
  const discountFromPoints = calcDiscountFromPoints(pointsToRedeem, VND_PER_POINT)
  const promoResult = applyPromotions(allAppliedPromos, playAmount, itemsAmount)
  const promoDiscount = promoResult.totalDiscount

  const shopName = settings?.find((s: { key: string }) => s.key === 'shop_name')?.value ?? 'Quán Bida'
  const shopAddress = settings?.find((s: { key: string }) => s.key === 'address')?.value ?? ''
  const shopPhone = settings?.find((s: { key: string }) => s.key === 'phone')?.value ?? ''
  const printerPath = settings?.find((s: { key: string }) => s.key === 'printer_path')?.value ?? 'USB001'
  const bankId = settings?.find((s: { key: string }) => s.key === 'bank_id')?.value ?? ''
  const bankAccount = settings?.find((s: { key: string }) => s.key === 'bank_account')?.value ?? ''
  const bankAccountName = settings?.find((s: { key: string }) => s.key === 'bank_account_name')?.value ?? ''
  const bankConfigured = isBankConfigured(bankId, bankAccount, bankAccountName)
  const vatRate = Number(settings?.find((s: { key: string }) => s.key === 'vat_rate')?.value ?? '10')
  const { finalAmount: preVatAmount } = calcInvoice({
    playAmount, itemsAmount, discount, promoDiscount,
    pointsRedeemed: pointsToRedeem, vndPerPoint: VND_PER_POINT,
  })
  const vatAmount = vatRate > 0 ? Math.round(preVatAmount * vatRate / 100) : 0
  const finalAmount = preVatAmount + vatAmount
  const pointsEarned = calcPointsEarned(finalAmount, POINTS_PER_10K)

  const handlePointsChange = (value: number) => {
    setPointsError('')
    if (!selectedCustomer) return
    if (value > selectedCustomer.points_balance) {
      setPointsError(`Không đủ điểm (có ${selectedCustomer.points_balance})`)
    } else if (value > 0 && value < MIN_REDEEM) {
      setPointsError(`Tối thiểu ${MIN_REDEEM} điểm`)
    }
    setPointsToRedeem(value)
  }

  const invoiceInput: InvoiceCreateInput = {
    sessionId: session.id,
    customerId: selectedCustomer?.id ?? null,
    playAmount, itemsAmount, discount,
    pointsRedeemed: pointsToRedeem,
    discountFromPoints, finalAmount, pointsEarned,
    shopName, shopAddress, shopPhone,
    tableId: session.table_id,
    tableName: session.table_name,
    orderItems: orderItems.map((i) => ({
      product_name: i.product_name ?? '', quantity: i.quantity, subtotal: i.subtotal,
    })),
    customerName: selectedCustomer?.name,
    customerPhone: selectedCustomer?.phone,
    customerPoints: selectedCustomer?.points_balance,
    paymentMethod,
    bankId,
    bankAccount,
    bankAccountName,
    vatRate,
    vatAmount,
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

  const adjustQtyMutation = useMutation({
    mutationFn: ({ itemId, delta }: { itemId: number; delta: number }) =>
      api().orderItems.adjustQty(itemId, delta),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orderItems', session.id] }),
  })

  const checkoutMutation = useMutation({
    mutationFn: async ({ print }: { print: boolean }) => {
      await api().sessions.close(session.id, playAmount)
      const invoice = await api().invoices.create(invoiceInput)
      if (print && invoice) {
        await api().invoices.print(invoice.id, invoiceInput, invoice.invoice_number, printerPath)
      }
      return { invoice, print }
    },
    onSuccess: ({ invoice, print }) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      if (print) {
        toast.success(`Đã in hoá đơn #${invoice?.invoice_number ?? ''}`)
      } else {
        toast.success(`Đã lưu hoá đơn #${invoice?.invoice_number ?? ''}`)
      }
      onComplete()
    },
    onError: () => {
      toast.error('Lưu hoá đơn thất bại')
    },
  })

  async function applyVoucher() {
    if (!voucherCode.trim()) return
    setVoucherLoading(true)
    try {
      const promo = await window.api.promotions.validateVoucher(voucherCode)
      if (!promo) { toast.error('Mã không hợp lệ hoặc đã hết hạn'); return }
      if (appliedPromos.some(p => p.id === (promo as Promotion).id)) { toast.error('Mã đã được áp dụng'); return }
      setAppliedPromos(prev => [...prev, promo as Promotion])
      setVoucherCode('')
      toast.success(`Áp dụng "${(promo as Promotion).name}" thành công`)
    } finally {
      setVoucherLoading(false)
    }
  }

  function removeVoucher(id: number) {
    setAppliedPromos(prev => prev.filter(p => p.id !== id))
  }

  const invoiceNumber = '-----'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {/* Customer Lookup */}
      <div className="col-span-full bg-[#1c1b1b] border border-[#272525] rounded-xl p-4 mb-2">
        <h3 className="font-semibold text-xs text-white/55 uppercase tracking-widest mb-3">KHÁCH HÀNG (tùy chọn)</h3>
        <CustomerSearchInput onSelect={(c) => { setSelectedCustomer(c); setPointsToRedeem(0); setPointsError('') }} />
        {selectedCustomer && selectedCustomer.points_balance > 0 && (
          <div className="mt-3">
            <Label className="text-[#d4af37] text-xs">Dùng điểm (1 điểm = {formatCurrency(VND_PER_POINT)})</Label>
            <Input
              type="number"
              min={0}
              max={selectedCustomer.points_balance}
              className="mt-1 bg-[#161515] border-[#272525] text-white"
              value={pointsToRedeem || ''}
              onChange={(e) => handlePointsChange(Number(e.target.value))}
            />
            {pointsError && <p className="text-xs text-red-400 mt-1">{pointsError}</p>}
            {pointsToRedeem > 0 && !pointsError && (
              <p className="text-xs text-green-400 mt-1">
                Giảm {formatCurrency(pointsToRedeem * VND_PER_POINT)} •
                Sau TT: +{calcPointsEarned(finalAmount, POINTS_PER_10K)} điểm,
                còn {selectedCustomer.points_balance - pointsToRedeem + calcPointsEarned(finalAmount, POINTS_PER_10K)} điểm
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Bàn {session.table_name}</h2>

        <div className="bg-[#1c1b1b] border border-[#272525] rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-white/90">Đồ uống / thức ăn</h3>
            <Button size="sm" onClick={() => setShowPicker(true)}
              className="btn-gold">
              + Thêm
            </Button>
          </div>
          <OrderList
            items={orderItems}
            onRemove={(id) => removeItemMutation.mutate(id)}
            onAdjust={(id, delta) => adjustQtyMutation.mutate({ itemId: id, delta })}
          />
        </div>

        {/* Section Khuyến mãi */}
        <div className="backdrop-blur-xl bg-white/[0.04] rounded-xl border border-white/10 p-4 space-y-2 mb-4">
          <p className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold mb-2">Khuyến mãi</p>

          {allAppliedPromos.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-white/80">
                <span className="text-xs">🏷</span>
                {formatPromoLabel(p)}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[#d4af37]">
                  −{(promoResult.items.find((r: AppliedPromoResult) => r.id === p.id)?.amount ?? 0).toLocaleString('vi-VN')}đ
                </span>
                {p.type === 'voucher' && (
                  <button onClick={() => removeVoucher(p.id)}
                    className="text-white/30 hover:text-red-400 transition-colors text-xs">✕</button>
                )}
              </span>
            </div>
          ))}

          {allAppliedPromos.length === 0 && (
            <p className="text-white/30 text-xs">Chưa có khuyến mãi nào áp dụng</p>
          )}

          {/* Voucher input */}
          <div className="flex gap-2 pt-1">
            <input
              className="input-glass flex-1 px-3 py-2 text-sm uppercase"
              placeholder="Nhập mã voucher..."
              value={voucherCode}
              onChange={e => setVoucherCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && applyVoucher()}
            />
            <button className="btn-glass text-xs px-3" onClick={applyVoucher} disabled={voucherLoading || !voucherCode.trim()}>
              {voucherLoading ? '...' : 'Áp dụng'}
            </button>
          </div>
        </div>

        <div className="bg-[#1c1b1b] border border-[#272525] rounded-xl p-4 space-y-3">
          <div>
            <label className="text-white/55 text-xs block mb-2">Giảm giá (đồng)</label>
            {/* Quick % buttons */}
            <div className="flex gap-1.5 mb-2">
              {[5, 10, 15, 20, 30, 50].map((pct) => {
                const amt = Math.round((playAmount + itemsAmount) * pct / 100)
                const active = discount === amt && amt > 0
                return (
                  <button
                    key={pct}
                    onClick={() => setDiscount(active ? 0 : amt)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={active
                      ? { background:'linear-gradient(135deg,#f0d060,#d4af37)', color:'#0f0e0f', borderColor:'transparent' }
                      : { background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.75)', borderColor:'rgba(255,255,255,0.1)' }
                    }
                  >
                    {pct}%
                  </button>
                )
              })}
            </div>
            <input
              type="number"
              className="input-glass w-full px-3 py-2 text-sm"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              placeholder="Hoặc nhập số tiền..."
            />
          </div>
          <div className="pt-2 border-t border-[#272525] space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-white/55">Tổng chơi:</span>
              <span>{formatCurrency(playAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/55">Tổng hàng:</span>
              <span>{formatCurrency(itemsAmount)}</span>
            </div>
            {vatRate > 0 && (
              <div className="flex justify-between text-white/55">
                <span>VAT ({vatRate}%):</span>
                <span>+{formatCurrency(vatAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base">
              <span>Tổng cộng:</span>
              <span className="text-[#d4af37] font-bold text-lg">{formatCurrency(finalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-center">Preview hóa đơn</h3>
        <InvoicePreview input={invoiceInput} invoiceNumber={invoiceNumber} />

        <div className="mt-6">
          {paymentStep === 'select' && (
            <div className="space-y-3">
              <p className="text-xs text-white/55 uppercase tracking-widest text-center mb-2">Phương thức thanh toán</p>
              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-[#1c1b1b] border border-[#272525] text-white hover:bg-[#272525] font-bold py-6 text-base"
                  onClick={() => { setPaymentMethod('cash'); setPaymentStep('cash') }}
                >
                  💵 Tiền mặt
                </Button>
                <Button
                  className="flex-1 bg-[#1c1b1b] border border-[#272525] text-white hover:bg-[#272525] font-bold py-6 text-base disabled:opacity-40"
                  disabled={!bankConfigured}
                  title={!bankConfigured ? 'Chưa cấu hình tài khoản ngân hàng trong Cài đặt' : undefined}
                  onClick={() => { setPaymentMethod('bank_transfer'); setPaymentStep('bank') }}
                >
                  🏦 Chuyển khoản
                </Button>
              </div>
              {!bankConfigured && (
                <p className="text-xs text-white/55 text-center">
                  Vào Cài đặt → Tài khoản ngân hàng để bật thanh toán chuyển khoản
                </p>
              )}
            </div>
          )}

          {paymentStep === 'cash' && (
            <div className="space-y-3">
              <div className="bg-[#161515] border border-[#272525] rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">Cần thanh toán</span>
                  <span className="font-bold text-[#d4af37]">{formatCurrency(finalAmount)}</span>
                </div>
                <div>
                  <Label className="text-white/55 text-xs">Tiền khách đưa</Label>
                  <Input
                    type="number"
                    min={0}
                    className="mt-1 bg-[#1c1b1b] border-[#272525] text-white text-right"
                    placeholder="0"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                {cashReceived !== '' && (
                  <div className="flex justify-between text-sm pt-1 border-t border-[#272525]">
                    <span className="text-white/55">Tiền thối</span>
                    <span className={`font-bold text-lg ${cashReceived >= finalAmount ? 'text-green-400' : 'text-red-400'}`}>
                      {cashReceived >= finalAmount
                        ? formatCurrency(cashReceived - finalAmount)
                        : `Thiếu ${formatCurrency(finalAmount - cashReceived)}`}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  className="btn-gold flex-1 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={checkoutMutation.isPending || !!pointsError}
                  onClick={() => checkoutMutation.mutate({ print: true })}
                >
                  🖨 In hóa đơn
                </button>
                <button
                  className="btn-glass flex-1 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={checkoutMutation.isPending || !!pointsError}
                  onClick={() => checkoutMutation.mutate({ print: false })}
                >
                  ✓ Lưu không in
                </button>
              </div>
              <button
                className="w-full text-xs text-white/40 hover:text-white text-center mt-1 transition-colors"
                onClick={() => { setPaymentStep('select'); setCashReceived('') }}
              >
                ← Quay lại chọn phương thức
              </button>
            </div>
          )}

          {paymentStep === 'bank' && (
            <div className="space-y-4">
              <div className="bg-[#161515] border border-[#272525] rounded-xl p-4 text-center">
                <img
                  src={buildVietQRUrl({
                    bankId,
                    bankAccount,
                    bankAccountName,
                    amount: finalAmount,
                    invoiceNumber: `HD${String(session.id).padStart(5, '0')}`,
                  })}
                  alt="QR Chuyển khoản"
                  className="mx-auto w-48 h-48 rounded-lg"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <p className="text-sm text-white/55 mt-2">{bankId} • {bankAccount}</p>
                <p className="text-sm text-white font-medium">{bankAccountName}</p>
                <p className="text-[#d4af37] font-bold text-lg mt-1">{formatCurrency(finalAmount)}</p>
              </div>
              <div className="flex gap-3">
                <button
                  className="btn-gold flex-1 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={checkoutMutation.isPending || !!pointsError}
                  onClick={() => checkoutMutation.mutate({ print: true })}
                >
                  🖨 In hóa đơn
                </button>
                <button
                  className="btn-glass flex-1 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={checkoutMutation.isPending || !!pointsError}
                  onClick={() => checkoutMutation.mutate({ print: false })}
                >
                  ✓ Đã nhận tiền
                </button>
              </div>
              <button
                className="w-full text-xs text-white/40 hover:text-white text-center transition-colors"
                onClick={() => setPaymentStep('select')}
              >
                ← Quay lại chọn phương thức
              </button>
            </div>
          )}
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

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Session, InvoiceCreateInput, Customer } from '../types'
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
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [searchState, setSearchState] = useState<'idle' | 'found' | 'notfound'>('idle')
  const [quickName, setQuickName] = useState('')
  const [pointsError, setPointsError] = useState('')

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

  const VND_PER_POINT = loyaltySettings?.vndPerPoint ?? 100
  const POINTS_PER_10K = loyaltySettings?.pointsPer10k ?? 1
  const MIN_REDEEM = loyaltySettings?.minRedeemPoints ?? 100

  const itemsAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0)
  const discountFromPoints = calcDiscountFromPoints(pointsToRedeem, VND_PER_POINT)
  const { finalAmount } = calcInvoice({
    playAmount, itemsAmount, discount, pointsRedeemed: pointsToRedeem, vndPerPoint: VND_PER_POINT,
  })
  const pointsEarned = calcPointsEarned(finalAmount, POINTS_PER_10K)

  const shopName = settings?.find((s: { key: string }) => s.key === 'shop_name')?.value ?? 'Quán Bida'
  const shopAddress = settings?.find((s: { key: string }) => s.key === 'address')?.value ?? ''
  const shopPhone = settings?.find((s: { key: string }) => s.key === 'phone')?.value ?? ''
  const printerPath = settings?.find((s: { key: string }) => s.key === 'printer_path')?.value ?? 'USB001'

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
  }

  const findCustomerMutation = useMutation({
    mutationFn: (phone: string) => window.api.customers.findByPhone(phone),
    onSuccess: (customer) => {
      if (customer) {
        setSelectedCustomer(customer)
        setSearchState('found')
      } else {
        setSearchState('notfound')
      }
      setPointsToRedeem(0)
      setPointsError('')
    },
  })

  const createCustomerMutation = useMutation({
    mutationFn: () => window.api.customers.create({
      name: quickName, phone: phoneInput, email: null, notes: null,
    }),
    onSuccess: (customer) => {
      if (customer) {
        setSelectedCustomer(customer)
        setSearchState('found')
        setQuickName('')
      }
    },
  })

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

  const invoiceNumber = '-----'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {/* Customer Lookup */}
      <div className="col-span-full bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-2">
        <h3 className="font-semibold text-xs text-[#6b7280] uppercase tracking-widest mb-3">KHÁCH HÀNG (tùy chọn)</h3>

        {searchState === 'idle' && (
          <div className="flex gap-2">
            <Input
              className="bg-[#0a1a0d] border-[#1e3d23] text-white flex-1"
              placeholder="Nhập số điện thoại..."
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && phoneInput && findCustomerMutation.mutate(phoneInput)}
            />
            <Button
              size="sm"
              className="bg-blue-700 hover:bg-blue-600"
              disabled={!phoneInput || findCustomerMutation.isPending}
              onClick={() => findCustomerMutation.mutate(phoneInput)}
            >
              Tìm
            </Button>
          </div>
        )}

        {searchState === 'found' && selectedCustomer && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-green-400">✓ {selectedCustomer.name}</p>
                <p className="text-sm text-[#6b7280]">{selectedCustomer.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-[#d4af37] font-bold">{selectedCustomer.points_balance} điểm</p>
                <button
                  className="text-xs text-[#6b7280] hover:text-white"
                  onClick={() => { setSearchState('idle'); setSelectedCustomer(null); setPointsToRedeem(0); setPointsError('') }}
                >
                  ✕ Xóa
                </button>
              </div>
            </div>
            {selectedCustomer.points_balance > 0 && (
              <div>
                <Label className="text-[#d4af37] text-xs">Dùng điểm (1 điểm = {formatCurrency(VND_PER_POINT)})</Label>
                <Input
                  type="number"
                  min={0}
                  max={selectedCustomer.points_balance}
                  className="mt-1 bg-[#0a1a0d] border-[#1e3d23] text-white"
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
        )}

        {searchState === 'notfound' && (
          <div className="space-y-2">
            <p className="text-sm text-red-400">✗ Không tìm thấy SĐT "{phoneInput}"</p>
            <div className="flex gap-2 items-center">
              <Input
                className="bg-[#0a1a0d] border-[#1e3d23] text-white flex-1"
                placeholder="Tên khách hàng..."
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
              />
              <Button
                size="sm"
                className="bg-green-700 hover:bg-green-600 whitespace-nowrap"
                disabled={!quickName || createCustomerMutation.isPending}
                onClick={() => createCustomerMutation.mutate()}
              >
                + Tạo mới
              </Button>
              <button
                className="text-xs text-[#6b7280] hover:text-white ml-1"
                onClick={() => { setSearchState('idle'); setPhoneInput('') }}
              >
                Huỷ
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Bàn {session.table_name}</h2>

        <div className="bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-[#e2e8f0]">Đồ uống / thức ăn</h3>
            <Button size="sm" onClick={() => setShowPicker(true)}
              className="bg-[#d4af37] text-[#0d1f12] font-bold text-xs hover:bg-yellow-400">
              + Thêm
            </Button>
          </div>
          <OrderList items={orderItems} onRemove={(id) => removeItemMutation.mutate(id)} />
        </div>

        <div className="bg-[#162a1a] border border-[#1e3d23] rounded-xl p-4 space-y-3">
          <div>
            <Label className="text-[#6b7280] text-xs">Giảm giá (đồng)</Label>
            <Input type="number" className="mt-1 bg-[#0a1a0d] border-[#1e3d23] text-white"
              value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </div>
          <div className="pt-2 border-t border-[#1e3d23] space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6b7280]">Tổng chơi:</span>
              <span>{formatCurrency(playAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6b7280]">Tổng hàng:</span>
              <span>{formatCurrency(itemsAmount)}</span>
            </div>
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

        <div className="flex gap-3 mt-6">
          <Button
            className="flex-1 bg-[#d4af37] text-[#0d1f12] font-bold hover:bg-yellow-400"
            disabled={checkoutMutation.isPending || !!pointsError}
            onClick={() => checkoutMutation.mutate(true)}
          >
            In hóa đơn
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-[#d4af37] text-[#d4af37] hover:bg-[#162a1a]"
            disabled={checkoutMutation.isPending || !!pointsError}
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

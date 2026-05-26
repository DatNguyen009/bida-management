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

  const { data: orderItems = [] } = useQuery({
    queryKey: ['orderItems', session.id],
    queryFn: () => api().orderItems.get(session.id),
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api().settings.getAll(),
  })

  const { data: loyaltySettings } = useQuery({
    queryKey: ['settings', 'loyalty'],
    queryFn: async () => {
      const all = await api().settings.getAll() as Array<{ key: string; value: string }>
      return {
        vndPerPoint: Number(all.find((s) => s.key === 'vnd_per_point')?.value ?? 100),
        pointsPer10k: Number(all.find((s) => s.key === 'points_per_10k')?.value ?? 1),
      }
    },
  })

  const { data: customer } = useQuery({
    queryKey: ['customer', session.customer_id],
    queryFn: () => session.customer_id
      ? window.api.customers.getAll().then((list) => list.find((c) => c.id === session.customer_id) ?? null)
      : Promise.resolve(null),
    enabled: !!session.customer_id,
  })

  const VND_PER_POINT = loyaltySettings?.vndPerPoint ?? 100
  const POINTS_PER_10K = loyaltySettings?.pointsPer10k ?? 1

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
    customerId: session.customer_id,
    playAmount, itemsAmount, discount,
    pointsRedeemed: pointsToRedeem,
    discountFromPoints, finalAmount, pointsEarned,
    shopName, shopAddress, shopPhone,
    tableId: session.table_id,
    tableName: session.table_name,
    orderItems: orderItems.map((i) => ({
      product_name: i.product_name ?? '', quantity: i.quantity, subtotal: i.subtotal,
    })),
    customerName: customer?.name,
    customerPhone: customer?.phone,
    customerPoints: customer?.points_balance,
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
            {customer && (
              <p className="text-xs text-yellow-400 mt-0.5">Điểm hiện tại: {customer.points_balance}</p>
            )}
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

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
      {(input.vatRate ?? 0) > 0 && (
        <div className="flex justify-between">
          <span>VAT ({input.vatRate}%):</span>
          <span>+{formatCurrency(input.vatAmount ?? 0)}</span>
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

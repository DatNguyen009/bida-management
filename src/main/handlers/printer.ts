import ThermalPrinter, { PrinterTypes, CharacterSet } from 'node-thermal-printer'
import { formatCurrency } from '../../renderer/src/lib/utils'
import type { InvoiceCreateInput } from '../../renderer/src/types'

export async function printInvoice(
  input: InvoiceCreateInput,
  invoiceNumber: string,
  printerPath: string
): Promise<void> {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: printerPath,
    characterSet: CharacterSet.PC857_TURKISH,
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

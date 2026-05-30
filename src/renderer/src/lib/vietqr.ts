export interface VietQRParams {
  bankId: string
  bankAccount: string
  bankAccountName: string
  amount: number
  invoiceNumber: string
}

export function buildVietQRUrl(params: VietQRParams): string {
  const { bankId, bankAccount, bankAccountName, amount, invoiceNumber } = params
  const base = `https://img.vietqr.io/image/${bankId}-${bankAccount}-compact2.png`
  const query = new URLSearchParams({
    amount: String(amount),
    addInfo: invoiceNumber,
    accountName: bankAccountName,
  })
  // Replace + with %20 to match VietQR spec (spaces as %20 not +)
  const queryString = query.toString().replace(/\+/g, '%20')
  return `${base}?${queryString}`
}

export function isBankConfigured(bankId: string, bankAccount: string, bankAccountName: string): boolean {
  return bankId.trim() !== '' && bankAccount.trim() !== '' && bankAccountName.trim() !== ''
}

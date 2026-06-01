import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { Customer } from '../types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  onSelect: (customer: Customer | null) => void
}

export default function CustomerSearchInput({ onSelect }: Props) {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = async (value: string) => {
    if (value.length < 3) {
      setResults([])
      setIsOpen(false)
      return
    }
    setIsLoading(true)
    try {
      const customers = await window.api.customers.searchByPhone(value)
      setResults(customers)
      setIsOpen(true)
    } catch {
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (value: string) => {
    setInput(value)
    setShowCreate(false)
    setCreateName('')
    setCreateError('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  const handleSelect = (customer: Customer) => {
    setSelected(customer)
    setIsOpen(false)
    setInput('')
    onSelect(customer)
  }

  const handleClear = () => {
    setSelected(null)
    setInput('')
    setResults([])
    setIsOpen(false)
    setShowCreate(false)
    setCreateName('')
    onSelect(null)
  }

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      window.api.customers.create({ name: createName, phone: input, email: null, notes: null }),
    onSuccess: (customer) => {
      if (customer) {
        setSelected(customer)
        setIsOpen(false)
        setInput('')
        setShowCreate(false)
        setCreateName('')
        setCreateError('')
        onSelect(customer)
      }
    },
    onError: () => setCreateError('Không tạo được, thử lại'),
  })

  if (selected) {
    return (
      <div className="flex justify-between items-center">
        <div>
          <p className="font-medium text-green-400">✓ {selected.name}</p>
          <p className="text-sm text-white/55">{selected.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-[#d4af37] font-bold">{selected.points_balance} điểm</p>
          <button className="text-xs text-white/55 hover:text-white" onClick={handleClear}>
            ✕ Xóa
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        className="bg-[#161515] border-[#272525] text-white"
        placeholder="Nhập số điện thoại (≥3 số)..."
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
      />
      {isLoading && <p className="text-xs text-white/55 mt-1">Đang tìm...</p>}
      {isOpen && !showCreate && (
        <div className="absolute z-50 w-full mt-1 bg-[#161515] border border-[#272525] rounded-lg overflow-auto max-h-64 shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              className="w-full text-left px-3 py-2 hover:bg-[#1c1b1b] flex justify-between items-center"
              onMouseDown={() => handleSelect(c)}
            >
              <div>
                <p className="text-white text-sm font-medium">{c.name}</p>
                <p className="text-white/55 text-xs">{c.phone}</p>
              </div>
              <p className="text-[#d4af37] text-xs">{c.points_balance} điểm</p>
            </button>
          ))}
          {results.length === 0 && input.length >= 3 && !isLoading && (
            <button
              className="w-full text-left px-3 py-2 text-green-400 hover:bg-[#1c1b1b] text-sm"
              onMouseDown={() => { setShowCreate(true); setIsOpen(false) }}
            >
              + Thêm khách "{input}"
            </button>
          )}
        </div>
      )}
      {showCreate && (
        <div className="mt-2 bg-[#161515] border border-[#272525] rounded-lg p-3 space-y-2">
          <p className="text-xs text-white/55">Tạo khách mới — SĐT: {input}</p>
          <Input
            className="bg-[#1c1b1b] border-[#272525] text-white text-sm"
            placeholder="Tên khách hàng..."
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createName && createMutation.mutate()}
            autoFocus
          />
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-green-700 hover:bg-green-600 flex-1"
              disabled={!createName || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Tạo
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-[#272525] text-white/55"
              onClick={() => { setShowCreate(false); setCreateError('') }}
            >
              Huỷ
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

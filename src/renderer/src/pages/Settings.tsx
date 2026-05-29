import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SettingRow { key: string; value: string }

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api().settings.getAll() as Promise<SettingRow[]>,
  })

  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty', 'settings'],
    queryFn: () => window.api.loyalty.getSettings(),
  })

  const getVal = (key: string) => settings.find((s) => s.key === key)?.value ?? ''

  const [shopName, setShopName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [defaultRate, setDefaultRate] = useState('')
  const [printerPath, setPrinterPath] = useState('')
  const [pointsPer10k, setPointsPer10k] = useState('')
  const [vndPerPoint, setVndPerPoint] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setShopName(getVal('shop_name'))
    setAddress(getVal('address'))
    setPhone(getVal('phone'))
    setDefaultRate(getVal('default_hourly_rate'))
    setPrinterPath(getVal('printer_path') || 'USB001')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  useEffect(() => {
    if (!loyaltyData) return
    setPointsPer10k(String(loyaltyData.pointsPer10k))
    setVndPerPoint(String(loyaltyData.vndPerPoint))
  }, [loyaltyData])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pairs: [string, string][] = [
        ['shop_name', shopName],
        ['address', address],
        ['phone', phone],
        ['default_hourly_rate', defaultRate],
        ['printer_path', printerPath],
      ]
      for (const [key, value] of pairs) {
        await api().settings.set(key, value)
      }
      await window.api.loyalty.saveSettings({
        pointsPer10k: Number(pointsPer10k) || 1,
        vndPerPoint: Number(vndPerPoint) || 100,
        minRedeemPoints: 100,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Cài đặt</h1>

      <div className="space-y-6">
        <section className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-green-400">Thông tin quán</h2>
          <div><Label>Tên quán</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={shopName}
              onChange={(e) => setShopName(e.target.value)} /></div>
          <div><Label>Địa chỉ</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={address}
              onChange={(e) => setAddress(e.target.value)} /></div>
          <div><Label>Số điện thoại</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={phone}
              onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Giá mặc định (đồng/giờ)</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={defaultRate}
              onChange={(e) => setDefaultRate(e.target.value)} /></div>
        </section>

        <section className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-blue-400">Máy in nhiệt</h2>
          <div>
            <Label>Đường dẫn máy in (USB / Serial)</Label>
            <Input className="mt-1 bg-gray-800 border-gray-600" value={printerPath}
              onChange={(e) => setPrinterPath(e.target.value)}
              placeholder="USB001 hoặc COM3" />
            <p className="text-xs text-gray-500 mt-1">Windows: USB001, COM3 — macOS/Linux: /dev/usb/lp0</p>
          </div>
        </section>

        <section className="bg-gray-900 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-yellow-400">Tích điểm khách hàng</h2>
          <div><Label>Điểm nhận được khi chi 10.000đ</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={pointsPer10k}
              onChange={(e) => setPointsPer10k(e.target.value)} /></div>
          <div><Label>1 điểm = ? đồng giảm giá</Label>
            <Input type="number" className="mt-1 bg-gray-800 border-gray-600" value={vndPerPoint}
              onChange={(e) => setVndPerPoint(e.target.value)} /></div>
          <p className="text-xs text-gray-500">
            VD: Chi 200,000đ = {Math.floor(200000 / 10000) * Number(pointsPer10k || 1)} điểm.
            Đổi 100 điểm = {100 * Number(vndPerPoint || 100)}đ giảm giá.
          </p>
        </section>

        <Button
          className={`w-full ${saved ? 'bg-blue-600' : 'bg-green-700 hover:bg-green-600'}`}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saved ? '✓ Đã lưu' : saveMutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
        </Button>
      </div>
    </div>
  )
}

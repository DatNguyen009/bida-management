import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StaffMember } from '../types'
import { useThemeStore, type AppTheme } from '../stores/themeStore'
import bgV1 from '../assets/bg-v1.jpg'
import bgV2 from '../assets/bg-v2.jpg'

interface SettingRow { key: string; value: string }

const API_URL = import.meta.env.VITE_API_URL ?? 'https://bida-management.onrender.com/api/v1'

export default function SettingsPage({ agentId }: { agentId?: string | null }) {
  const queryClient = useQueryClient()
  const { theme, setTheme } = useThemeStore()

  const [activeTab, setActiveTab] = useState<'settings' | 'staff'>('settings')

  const { data: settings = [] } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api().settings.getAll() as Promise<SettingRow[]>,
  })

  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty', 'settings'],
    queryFn: () => window.api.loyalty.getSettings(),
  })

  const { data: staffList = [], refetch: refetchStaff } = useQuery({
    queryKey: ['staff'],
    queryFn: () => window.api.staff.getAll(),
  })

  const [staffMode, setStaffMode] = useState<'create' | 'edit' | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [staffForm, setStaffForm] = useState({ username: '', password: '', allowedScreens: [] as string[] })

  const SCREENS = [
    { key: 'dashboard', label: '🏠 Dashboard' },
    { key: 'products', label: '📦 Sản phẩm' },
    { key: 'stock', label: '🏪 Kho' },
    { key: 'invoices', label: '🧾 Hóa đơn' },
    { key: 'customers', label: '👥 Khách hàng' },
    { key: 'reports', label: '📊 Báo cáo' },
    { key: 'promotions', label: '🏷 Khuyến mãi' },
    { key: 'settings', label: '⚙️ Cài đặt' },
  ]

  const createStaffMutation = useMutation({
    mutationFn: () => window.api.staff.create({ username: staffForm.username, password: staffForm.password, allowedScreens: staffForm.allowedScreens }),
    onSuccess: () => { refetchStaff(); setStaffMode(null); toast.success('Đã tạo nhân viên') },
    onError: () => toast.error('Tên đăng nhập đã tồn tại'),
  })

  const updateStaffMutation = useMutation({
    mutationFn: () => selectedStaff ? window.api.staff.update(selectedStaff.id, { password: staffForm.password || undefined, allowedScreens: staffForm.allowedScreens }) : Promise.resolve(null),
    onSuccess: () => { refetchStaff(); setStaffMode(null); toast.success('Đã cập nhật nhân viên') },
    onError: () => toast.error('Cập nhật thất bại'),
  })

  const deleteStaffMutation = useMutation({
    mutationFn: (id: number) => window.api.staff.delete(id),
    onSuccess: () => { refetchStaff(); toast.success('Đã xoá nhân viên') },
  })

  const getVal = (key: string) => settings.find((s) => s.key === key)?.value ?? ''

  const [shopName, setShopName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [defaultRate, setDefaultRate] = useState('')
  const [printerPath, setPrinterPath] = useState('')
  const [pointsPer10k, setPointsPer10k] = useState('')
  const [vndPerPoint, setVndPerPoint] = useState('')
  const [bankId, setBankId] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')
  const [vatRate, setVatRate] = useState('10')

  const payosClientId = settings.find((s: { key: string; value: string }) => s.key === 'payos_client_id')?.value ?? ''
  const payosApiKey = settings.find((s: { key: string; value: string }) => s.key === 'payos_api_key')?.value ?? ''
  const payosChecksumKey = settings.find((s: { key: string; value: string }) => s.key === 'payos_checksum_key')?.value ?? ''

  const [localPayosClientId, setLocalPayosClientId] = useState(payosClientId)
  const [localPayosApiKey, setLocalPayosApiKey] = useState(payosApiKey)
  const [localPayosChecksumKey, setLocalPayosChecksumKey] = useState(payosChecksumKey)

  useEffect(() => {
    setShopName(getVal('shop_name'))
    setAddress(getVal('address'))
    setPhone(getVal('phone'))
    setDefaultRate(getVal('default_hourly_rate'))
    setPrinterPath(getVal('printer_path') || 'USB001')
    setBankId(getVal('bank_id'))
    setBankAccount(getVal('bank_account'))
    setBankAccountName(getVal('bank_account_name'))
    setVatRate(getVal('vat_rate') || '10')
    setLocalPayosClientId(payosClientId)
    setLocalPayosApiKey(payosApiKey)
    setLocalPayosChecksumKey(payosChecksumKey)
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
        ['bank_id', bankId],
        ['bank_account', bankAccount],
        ['bank_account_name', bankAccountName],
        ['vat_rate', vatRate],
        ['payos_client_id', localPayosClientId],
        ['payos_api_key', localPayosApiKey],
        ['payos_checksum_key', localPayosChecksumKey],
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
      toast.success('Đã lưu cài đặt')
    },
    onError: () => toast.error('Lưu cài đặt thất bại'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#d4af37]">Cài đặt</h1>
        <div className="flex gap-1 backdrop-blur-xl bg-white/[0.04] border border-white/10 rounded-lg p-1">
          <button
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'settings' ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white hover:text-[#d4af37]'}`}
            onClick={() => setActiveTab('settings')}
          >
            Cài đặt
          </button>
          <button
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${activeTab === 'staff' ? 'bg-[#d4af37] text-[#0f0e0f] font-bold' : 'text-white hover:text-[#d4af37]'}`}
            onClick={() => setActiveTab('staff')}
          >
            Nhân viên
          </button>
        </div>
      </div>

      {activeTab === 'settings' && (
        <div className="space-y-4">
          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-[#d4af37] text-xs uppercase tracking-widest mb-1">Thông tin quán</h2>
            <div><Label className="text-white/55 text-xs">Tên quán</Label>
              <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]" value={shopName}
                onChange={(e) => setShopName(e.target.value)} /></div>
            <div><Label className="text-white/55 text-xs">Địa chỉ</Label>
              <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]" value={address}
                onChange={(e) => setAddress(e.target.value)} /></div>
            <div><Label className="text-white/55 text-xs">Số điện thoại</Label>
              <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]" value={phone}
                onChange={(e) => setPhone(e.target.value)} /></div>
            <div><Label className="text-white/55 text-xs">Giá mặc định (đồng/giờ)</Label>
              <Input type="number" className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]" value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)} /></div>
            <div>
              <Label className="text-white/55 text-xs">VAT (%)</Label>
              <Input type="number" min={0} max={100}
                className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                placeholder="10" />
              <p className="text-xs text-white/55 mt-1">Nhập 0 để tắt VAT. Mặc định 10%.</p>
            </div>
          </section>

          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-[#d4af37] text-xs uppercase tracking-widest mb-1">Máy in nhiệt</h2>
            <div>
              <Label className="text-white/55 text-xs">Đường dẫn máy in (USB / Serial)</Label>
              <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]" value={printerPath}
                onChange={(e) => setPrinterPath(e.target.value)}
                placeholder="USB001 hoặc COM3" />
              <p className="text-xs text-white/55 mt-1">Windows: USB001, COM3 — macOS/Linux: /dev/usb/lp0</p>
            </div>
          </section>

          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-[#d4af37] text-xs uppercase tracking-widest mb-1">Tài khoản ngân hàng</h2>
            <div>
              <Label className="text-white/55 text-xs">Mã ngân hàng (VietQR)</Label>
              <Input
                className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                value={bankId}
                onChange={(e) => setBankId(e.target.value.toUpperCase())}
                placeholder="VD: MB, VCB, TCB, ACB, TPB"
              />
              <p className="text-xs text-white/55 mt-1">
                Tra cứu mã tại: img.vietqr.io/danh-sach-ngan-hang
              </p>
            </div>
            <div>
              <Label className="text-white/55 text-xs">Số tài khoản</Label>
              <Input
                className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="VD: 1234567890"
              />
            </div>
            <div>
              <Label className="text-white/55 text-xs">Tên chủ tài khoản</Label>
              <Input
                className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value.toUpperCase())}
                placeholder="VD: NGUYEN VAN A"
              />
            </div>
          </section>

          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-[#d4af37] text-xs uppercase tracking-widest mb-1">Tích điểm khách hàng</h2>
            <div><Label className="text-white/55 text-xs">Điểm nhận được khi chi 10.000đ</Label>
              <Input type="number" className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]" value={pointsPer10k}
                onChange={(e) => setPointsPer10k(e.target.value)} /></div>
            <div><Label className="text-white/55 text-xs">1 điểm = ? đồng giảm giá</Label>
              <Input type="number" className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]" value={vndPerPoint}
                onChange={(e) => setVndPerPoint(e.target.value)} /></div>
            <p className="text-xs text-white/55">
              VD: Chi 200,000đ = {Math.floor(200000 / 10000) * Number(pointsPer10k || 1)} điểm.
              Đổi 100 điểm = {100 * Number(vndPerPoint || 100)}đ giảm giá.
            </p>
          </section>

          <section className="backdrop-blur-xl bg-white/[0.07] border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-[#d4af37] text-xs uppercase tracking-widest mb-1">PayOS</h2>
            <p className="text-white/40 text-xs">Đăng ký miễn phí tại payos.vn để lấy thông tin bên dưới.</p>
            {agentId && (
              <div>
                <Label className="text-white/55 text-xs">Webhook URL (dán vào PayOS dashboard)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#d4af37] font-mono break-all">
                    {API_URL.replace('/api/v1', '')}/api/v1/payos/webhook/{agentId}
                  </code>
                  <button className="btn-glass text-xs px-3 py-2 flex-shrink-0"
                    onClick={() => navigator.clipboard.writeText(`${API_URL.replace('/api/v1', '')}/api/v1/payos/webhook/${agentId}`)}>
                    Copy
                  </button>
                </div>
              </div>
            )}
            <div>
              <Label className="text-white/55 text-xs">Client ID</Label>
              <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                value={localPayosClientId} onChange={e => setLocalPayosClientId(e.target.value)} />
            </div>
            <div>
              <Label className="text-white/55 text-xs">API Key</Label>
              <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                value={localPayosApiKey} onChange={e => setLocalPayosApiKey(e.target.value)} />
            </div>
            <div>
              <Label className="text-white/55 text-xs">Checksum Key</Label>
              <Input className="bg-white/[0.04] border-white/10 text-white mt-1 focus:border-[#d4af37]"
                value={localPayosChecksumKey} onChange={e => setLocalPayosChecksumKey(e.target.value)} />
            </div>
          </section>

          <section className="bg-white/[0.06] border border-white/10 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-semibold text-sm">Giao diện</h3>
            <p className="text-white/55 text-xs">Chọn background theme cho toàn bộ app.</p>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  {
                    id: 'v1' as AppTheme,
                    label: 'V1 — Blur nhẹ',
                    desc: 'Tím xanh · Ảnh rõ',
                    bg: bgV1,
                    filterStyle: 'brightness(0.52) saturate(1.2)',
                    overlayColor: 'rgba(20,10,40,0.45)',
                  },
                  {
                    id: 'v2' as AppTheme,
                    label: 'V2 — Cinematic',
                    desc: 'Amber warm · Blur nặng',
                    bg: bgV2,
                    filterStyle: 'blur(4px) brightness(0.5) saturate(1.4)',
                    overlayColor: 'rgba(30,10,0,0.5)',
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all text-left
                    ${theme === t.id
                      ? 'border-[#d4af37] shadow-[0_0_16px_rgba(212,175,55,0.4)]'
                      : 'border-white/10 hover:border-white/25'
                    }`}
                >
                  <div className="h-24 relative">
                    <img
                      src={t.bg}
                      alt={t.label}
                      className="w-full h-full object-cover"
                      style={{ filter: t.filterStyle }}
                    />
                    <div className="absolute inset-0" style={{ background: t.overlayColor }} />
                    <div className="absolute bottom-0 left-0 right-0 h-8 backdrop-blur-md bg-white/10 border-t border-white/15" />
                  </div>
                  <div className="p-3 bg-white/[0.04]">
                    <p className="text-white text-xs font-semibold">{t.label}</p>
                    <p className="text-white/65 text-[10px] mt-0.5">{t.desc}</p>
                  </div>
                  {theme === t.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#d4af37] flex items-center justify-center">
                      <span className="text-[10px] text-black font-bold">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          <Button
            className="btn-gold"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
          </Button>
        </div>
      )}

      {activeTab === 'staff' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              className="btn-gold"
              onClick={() => { setStaffForm({ username: '', password: '', allowedScreens: [] }); setSelectedStaff(null); setStaffMode('create') }}
            >
              + Thêm nhân viên
            </Button>
          </div>

          <div className="backdrop-blur-xl bg-white/[0.04] rounded-xl overflow-hidden border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.06] border-b-2 border-[#d4af37]">
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Tên đăng nhập</th>
                  <th className="text-left px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Màn hình được phép</th>
                  <th className="text-right px-4 py-3 text-[#d4af37] text-[10px] uppercase tracking-widest font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((s, i) => (
                  <tr key={s.id} className={`border-b border-white/10 hover:bg-white/[0.06] transition-colors ${i % 2 === 1 ? 'bg-white/[0.03]' : ''}`}>
                    <td className="px-4 py-3 text-white/90 font-medium">{s.username}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {s.allowed_screens.map((sc) => (
                          <span key={sc} className="bg-[#d4af37] text-black text-[10px] px-1.5 py-0.5 rounded-full">
                            {SCREENS.find((x) => x.key === sc)?.label ?? sc}
                          </span>
                        ))}
                        {s.allowed_screens.length === 0 && <span className="text-white/55 text-xs">Không có quyền</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button className="btn-glass text-xs"
                        onClick={() => {
                          setSelectedStaff(s)
                          setStaffForm({ username: s.username, password: '', allowedScreens: s.allowed_screens })
                          setStaffMode('edit')
                        }}>
                        Sửa
                      </Button>
                      <Button className="btn-danger text-xs"
                        onClick={() => deleteStaffMutation.mutate(s.id)}>
                        Xoá
                      </Button>
                    </td>
                  </tr>
                ))}
                {staffList.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-white/55">Chưa có nhân viên nào</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {(staffMode === 'create' || staffMode === 'edit') && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setStaffMode(null)} />
              <div className="modal-glass relative w-full max-w-sm mx-4 p-6 overflow-hidden">
                <div className="mb-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-base">👤</div>
                    <h2 className="text-base font-bold text-white">
                      {staffMode === 'create' ? 'Thêm nhân viên' : 'Sửa nhân viên'}
                    </h2>
                  </div>
                </div>
                <div className="mb-5 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)' }} />

                <div className="space-y-4 mb-5">
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Tên đăng nhập</label>
                    <input
                      className="input-glass w-full px-4 py-2.5 text-sm"
                      value={staffForm.username}
                      onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                      disabled={staffMode === 'edit'}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">
                      {staffMode === 'edit' ? 'Mật khẩu mới (để trống = không đổi)' : 'Mật khẩu'}
                    </label>
                    <input
                      type="password"
                      className="input-glass w-full px-4 py-2.5 text-sm"
                      value={staffForm.password}
                      onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-widest block mb-2">Màn hình được phép truy cập</label>
                    <div className="space-y-2 mt-1">
                      {SCREENS.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            className="accent-[#d4af37] w-4 h-4"
                            checked={staffForm.allowedScreens.includes(key)}
                            onChange={(e) => {
                              const screens = e.target.checked
                                ? [...staffForm.allowedScreens, key]
                                : staffForm.allowedScreens.filter((s) => s !== key)
                              setStaffForm({ ...staffForm, allowedScreens: screens })
                            }}
                          />
                          <span className="text-sm text-white/90 group-hover:text-white transition-colors">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button className="btn-glass flex-1" onClick={() => setStaffMode(null)}>Huỷ</button>
                  <button
                    className="btn-gold flex-1"
                    disabled={staffMode === 'create' && (!staffForm.username || !staffForm.password)}
                    onClick={() => staffMode === 'create' ? createStaffMutation.mutate() : updateStaffMutation.mutate()}
                  >
                    {staffMode === 'create' ? '＋ Thêm nhân viên' : 'Lưu thay đổi'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

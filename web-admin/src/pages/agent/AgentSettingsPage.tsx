import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import { useAuthStore } from '../../stores/authStore'
import AgentLayout from '../../components/AgentLayout'

const VITE_API = import.meta.env.VITE_API_URL ?? '/api/v1'
const SERVER_URL = VITE_API.replace('/api/v1', '')

interface Setting { key: string; value: string }

const KEYS = [
  'shop_name','address','phone','default_hourly_rate','vat_rate',
  'printer_path',
  'points_per_10k_vnd','vnd_per_point',
  'bank_id','bank_account','bank_account_name',
  'payos_client_id','payos_api_key','payos_checksum_key',
]

export default function AgentSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { agentId } = useAuthStore()

  useEffect(() => {
    api.get('/agent/settings').then(({ data }: { data: Setting[] }) => {
      const map: Record<string, string> = {}
      data.forEach(s => { map[s.key] = s.value })
      setSettings(map)
    })
  }, [])

  function set(key: string, value: string) { setSettings(prev => ({ ...prev, [key]: value })) }

  async function save() {
    setSaving(true)
    const updates = KEYS.map(k => ({ key: k, value: settings[k] ?? '' }))
    await api.put('/agent/settings', updates)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const webhookUrl = agentId ? `${SERVER_URL}/api/v1/payos/webhook/${agentId}` : ''

  const pointsPer10k = Number(settings['points_per_10k_vnd'] || 1)
  const vndPerPoint = Number(settings['vnd_per_point'] || 100)

  function Field({ label, k, type = 'text', placeholder }: { label: string; k: string; type?: string; placeholder?: string }) {
    return (
      <div>
        <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">{label}</label>
        <input type={type} className="input-glass" value={settings[k] ?? ''} placeholder={placeholder}
          onChange={e => set(k, e.target.value)} />
      </div>
    )
  }

  return (
    <AgentLayout title="Cài đặt">
      <div className="space-y-4">

        {/* Thông tin quán */}
        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Thông tin quán</h2>
          <Field label="Tên quán" k="shop_name" />
          <Field label="Địa chỉ" k="address" />
          <Field label="Số điện thoại" k="phone" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giá mặc định (đ/giờ)" k="default_hourly_rate" type="number" />
            <div>
              <Field label="VAT (%)" k="vat_rate" type="number" placeholder="10" />
              <p className="text-white/30 text-[10px] mt-1">Nhập 0 để tắt VAT. Mặc định 10%.</p>
            </div>
          </div>
        </section>

        {/* Máy in nhiệt */}
        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Máy in nhiệt</h2>
          <div>
            <Field label="Đường dẫn máy in (USB / Serial)" k="printer_path" placeholder="USB001 hoặc COM3" />
            <p className="text-white/30 text-[10px] mt-1">Windows: USB001, COM3 — macOS/Linux: /dev/usb/lp0</p>
          </div>
        </section>

        {/* Tích điểm */}
        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Tích điểm khách hàng</h2>
          <Field label="Điểm nhận được khi chi 10.000đ" k="points_per_10k_vnd" type="number" />
          <Field label="1 điểm = ? đồng giảm giá" k="vnd_per_point" type="number" />
          <p className="text-white/30 text-xs">
            VD: Chi 200.000đ = {Math.floor(200000 / 10000) * pointsPer10k} điểm.
            Đổi 100 điểm = {formatCurrency(100 * vndPerPoint)} giảm giá.
          </p>
        </section>

        {/* VietQR */}
        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Tài khoản ngân hàng</h2>
          <div>
            <Field label="Mã ngân hàng (VietQR)" k="bank_id" placeholder="VD: MB, VCB, TCB, ACB" />
            <p className="text-white/30 text-[10px] mt-1">Tra cứu mã tại: img.vietqr.io/danh-sach-ngan-hang</p>
          </div>
          <Field label="Số tài khoản" k="bank_account" placeholder="VD: 1234567890" />
          <Field label="Tên chủ tài khoản" k="bank_account_name" placeholder="VD: NGUYEN VAN A" />
        </section>

        {/* PayOS */}
        <section className="glass-card p-5 space-y-4">
          <h2 className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">PayOS</h2>
          <p className="text-white/40 text-xs">Đăng ký miễn phí tại payos.vn để lấy thông tin bên dưới.</p>
          {webhookUrl && (
            <div>
              <label className="text-white/50 text-xs uppercase tracking-widest block mb-1">Webhook URL (dán vào PayOS dashboard)</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#d4af37] font-mono break-all">{webhookUrl}</code>
                <button className="btn-glass text-xs px-3 flex-shrink-0" onClick={() => navigator.clipboard.writeText(webhookUrl)}>Copy</button>
              </div>
            </div>
          )}
          <Field label="Client ID" k="payos_client_id" />
          <Field label="API Key" k="payos_api_key" />
          <Field label="Checksum Key" k="payos_checksum_key" />
        </section>

        <button className="btn-gold w-full" onClick={save} disabled={saving}>
          {saving ? 'Đang lưu...' : saved ? '✓ Đã lưu' : 'Lưu cài đặt'}
        </button>
      </div>
    </AgentLayout>
  )
}

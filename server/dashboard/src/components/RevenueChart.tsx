import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint { date: string; total: number }

function fmtDate(s: string) {
  const d = new Date(s)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function fmtVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ'
}

export default function RevenueChart({ data, color = '#3b82f6' }: { data: DataPoint[]; color?: string }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Chưa có dữ liệu.</div>
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} width={45} />
        <Tooltip formatter={(v: number) => fmtVND(v)} labelFormatter={fmtDate} />
        <Bar dataKey="total" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

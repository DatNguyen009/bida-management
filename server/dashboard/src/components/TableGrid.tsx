interface Table {
  id: number
  name: string
  status: string
}

export default function TableGrid({ tables }: { tables: Table[] }) {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
      {tables.map((t) => (
        <div key={t.id}
          className={`rounded-lg p-3 text-center text-xs font-medium ${
            t.status === 'playing'
              ? 'bg-red-100 text-red-800 ring-1 ring-red-200'
              : 'bg-green-100 text-green-800 ring-1 ring-green-200'
          }`}>
          <div className="font-semibold">{t.name}</div>
          <div className="mt-1 opacity-80">{t.status === 'playing' ? 'Đang chơi' : 'Trống'}</div>
        </div>
      ))}
      {tables.length === 0 && (
        <div className="col-span-4 text-center text-gray-400 py-4 text-sm">Chưa có bàn nào.</div>
      )}
    </div>
  )
}

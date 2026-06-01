interface Props {
  onBack: () => void
}

export default function AccessDenied({ onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="text-4xl">🚫</div>
      <h2 className="text-lg font-semibold text-[#d4af37]">Không có quyền truy cập</h2>
      <p className="text-[#6b7280] text-sm">Bạn không được phép vào màn hình này.</p>
      <button
        onClick={onBack}
        className="bg-[#d4af37] text-[#0f0e0f] font-bold px-4 py-2 rounded-lg text-sm hover:bg-yellow-400 transition-colors"
      >
        Về Dashboard
      </button>
    </div>
  )
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface Props {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
}

export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [20, 50, 100] }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1e3d23]">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#6b7280]">Hiển thị:</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="w-20 h-7 bg-[#0a1a0d] border-[#1e3d23] text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0a1a0d] border-[#1e3d23]">
            {pageSizeOptions.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-white text-xs hover:bg-[#162a1a]">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-[#6b7280]">
          {total === 0 ? 'Không có kết quả' : `${from}–${to} / ${total}`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 border-[#1e3d23] text-[#6b7280] hover:bg-[#162a1a] disabled:opacity-30"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Trước
        </Button>
        <span className="text-xs text-white px-2">
          Trang {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 border-[#1e3d23] text-[#6b7280] hover:bg-[#162a1a] disabled:opacity-30"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau →
        </Button>
      </div>
    </div>
  )
}

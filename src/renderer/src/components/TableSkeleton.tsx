import { Skeleton } from './ui/skeleton'

const COL_WIDTHS = ['w-1/4', 'w-1/3', 'w-1/5', 'w-1/4', 'w-1/6']

interface Props {
  rows?: number
  cols?: number
}

export default function TableSkeleton({ rows = 10, cols = 4 }: Props) {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-lg bg-[#0d1f12]/40">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={`h-4 ${COL_WIDTHS[(i + j) % COL_WIDTHS.length]} flex-shrink-0`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[#1e3d23]/50 ${className}`} />
  )
}

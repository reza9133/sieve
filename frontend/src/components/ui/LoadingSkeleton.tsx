
export function SkeletonLine({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`shimmer rounded bg-surface-2 ${className}`} />
}

export function SkeletonCard() {
  return (
    <div className="card space-y-4">
      <SkeletonLine className="h-6 w-1/3" />
      <SkeletonLine className="h-4 w-full" />
      <SkeletonLine className="h-4 w-5/6" />
      <div className="grid grid-cols-2 gap-4 pt-2">
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-full" />
      </div>
    </div>
  )
}

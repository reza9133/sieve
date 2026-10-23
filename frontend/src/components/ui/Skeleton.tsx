export function Skeleton({ className = '', label }: { className?: string; label?: string }) {
  return <div className={`skeleton ${className}`} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="surface space-y-3 p-5" role="status" aria-label="Loading">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i % 2 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

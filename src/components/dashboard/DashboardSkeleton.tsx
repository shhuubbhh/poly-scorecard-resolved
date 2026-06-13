export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="glass-card h-48 animate-pulse" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card h-64 animate-pulse lg:col-span-2" />
        <div className="glass-card h-64 animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-card h-24 animate-pulse" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card h-72 animate-pulse lg:col-span-2" />
        <div className="glass-card h-72 animate-pulse" />
      </div>
    </div>
  );
}

import { SkeletonBox, SkeletonCard } from "@/components/shared"

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBox className="h-24" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

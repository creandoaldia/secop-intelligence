import { SkeletonCard } from "@/components/shared"

export default function SuscripcionLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SkeletonCard className="h-64" />
      <SkeletonCard className="h-64" />
    </div>
  )
}

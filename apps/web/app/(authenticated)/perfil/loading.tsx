import { SkeletonCard } from "@/components/shared"

export default function PerfilLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SkeletonCard className="h-48" />
      <SkeletonCard className="h-48" />
    </div>
  )
}

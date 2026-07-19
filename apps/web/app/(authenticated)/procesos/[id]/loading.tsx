import { SkeletonBox, SkeletonCard } from "@/components/shared"

export default function ProcesoDetailLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBox className="h-5 w-24" />
      <SkeletonCard className="h-96" />
    </div>
  )
}

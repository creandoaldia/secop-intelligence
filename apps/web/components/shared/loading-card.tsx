import { cn } from "@/lib/utils"
import { SkeletonCard } from "./skeleton"

interface LoadingCardProps {
  count?: number
  columns?: number
  className?: string
}

export function LoadingCard({ count = 6, columns = 3, className }: LoadingCardProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  }[columns] ?? "grid-cols-3"

  return (
    <div
      className={cn("grid gap-4", gridCols, className)}
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

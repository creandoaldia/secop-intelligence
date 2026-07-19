"use client"

import { cn } from "@/lib/utils"
import { SkeletonCard } from "./skeleton"

interface LoadingCardProps {
  count?: number
  columns?: number
  className?: string
}

export function LoadingCard({ count = 6, columns = 3, className }: LoadingCardProps) {
  return (
    <div
      className={cn("grid gap-4", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      aria-label="Loading"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

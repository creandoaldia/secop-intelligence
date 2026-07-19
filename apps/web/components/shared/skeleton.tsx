"use client"

import { cn } from "@/lib/utils"

function SkeletonBox({
  className,
  width,
  height,
}: {
  className?: string
  width?: string
  height?: string
}) {
  return (
    <div
      aria-label="Loading"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      style={{ width, height }}
    />
  )
}

function SkeletonText({ className, lines = 1 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  )
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-label="Loading"
      className={cn("rounded-xl border bg-card p-4", className)}
    >
      <SkeletonBox className="mb-3 h-4 w-3/4" />
      <SkeletonBox className="mb-2 h-3 w-full" />
      <SkeletonBox className="h-3 w-1/2" />
    </div>
  )
}

export { SkeletonBox, SkeletonText, SkeletonCard }

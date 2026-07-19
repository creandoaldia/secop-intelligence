"use client"

import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface ErrorMessageProps {
  message: string
  details?: string
  onRetry?: () => void
  className?: string
}

export function ErrorMessage({ message, details, onRetry, className }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-destructive/50 p-6 text-center",
        className
      )}
    >
      <AlertCircle className="mb-2 size-8 text-destructive" />
      <p className="text-sm font-medium text-destructive">{message}</p>
      {details && (
        <p className="mt-1 max-w-md text-xs text-muted-foreground">{details}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}

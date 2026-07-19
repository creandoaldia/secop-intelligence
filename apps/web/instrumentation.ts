import { startWorker } from "@/lib/analysis/worker"

export function register() {
  try {
    startWorker()
  } catch (e) {
    console.error("[Analysis Worker] Failed to start:", e)
  }
}

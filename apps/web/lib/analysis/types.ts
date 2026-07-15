// ─────────────────────────────────────────────────────────────
// SECOP Intelligence Hub — Analysis Pipeline Types
// Shared types for job lifecycle and results
// ─────────────────────────────────────────────────────────────

export type AnalysisJobStatus =
  | "pending"
  | "downloading"
  | "ocr"
  | "extracting"
  | "verifying"
  | "completed"
  | "failed";

export interface AnalysisJobProgress {
  jobId: string;
  status: AnalysisJobStatus;
  progress: number; // 0-100
  pagesTotal: number;
  pagesProcessed: number;
  error?: string;
}

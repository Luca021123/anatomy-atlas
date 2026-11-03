/**
 * Real-time feedback channel. The executor publishes RunEvents; the terminal
 * live view, the dashboard server (SSE) and the run log all subscribe.
 */
import type {
  AttemptRecord,
  Config,
  LiveTotals,
  RoutedPlan,
  RunSummary,
  SubsectionRunState,
} from "./types.ts";

export type RunEvent =
  | { type: "run.started"; at: string; plan: RoutedPlan; concurrency: number; budget_usd?: number; dry_run: boolean }
  | { type: "subsection.queued"; at: string; id: string }
  | { type: "subsection.started"; at: string; id: string; attempt: number; model: string; effort: Config["effort"] }
  | {
      type: "subsection.progress";
      at: string;
      id: string;
      attempt: number;
      /** Output tokens generated so far (visible text estimated at 4 chars/token, plus thinking when reported). */
      output_tokens: number;
      /** Last ~120 characters of visible output, for a live preview. */
      tail: string;
    }
  | { type: "subsection.attempt_finished"; at: string; id: string; record: AttemptRecord }
  | { type: "subsection.verifying"; at: string; id: string; attempt: number; judge_model: string }
  | { type: "subsection.escalated"; at: string; id: string; from: Config; to: Config; reason: string }
  | { type: "subsection.completed"; at: string; id: string; state: SubsectionRunState }
  | { type: "subsection.failed"; at: string; id: string; state: SubsectionRunState; reason: string }
  | { type: "subsection.skipped"; at: string; id: string; reason: string }
  | { type: "metrics"; at: string; totals: LiveTotals }
  | { type: "warning"; at: string; message: string; id?: string }
  | { type: "run.finished"; at: string; summary: RunSummary };

export type RunEventType = RunEvent["type"];
export type Listener = (event: RunEvent) => void;

/** Minimal synchronous pub/sub with history replay for late subscribers (e.g. a browser that connects mid-run). */
export class EventBus {
  private readonly listeners = new Set<Listener>();
  readonly history: RunEvent[] = [];

  emit(event: RunEvent): void {
    this.history.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken subscriber must never break the run.
      }
    }
  }

  /** Subscribes; with `replay`, first delivers every event emitted so far. Returns an unsubscribe function. */
  subscribe(listener: Listener, replay = false): () => void {
    if (replay) for (const e of this.history) listener(e);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const now = (): string => new Date().toISOString();

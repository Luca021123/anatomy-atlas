/** Shared display helpers for every renderer (terminal, Markdown, HTML, dispatch). */
import type { AgentAlias } from "./types.ts";

/** Dollars with precision that scales with magnitude: $12.34, $0.123, $0.0012. */
export const usd = (v: number): string => {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const body = a >= 1 ? a.toFixed(2) : a >= 0.01 ? a.toFixed(3) : a > 0 ? a.toFixed(4) : "0";
  return `${sign}$${body}`;
};

/** Probability as a percentage, with one decimal only when it matters (97.5%, 95%). */
export const pct = (p: number): string => {
  const v = p * 100;
  return `${Math.abs(v - Math.round(v)) < 0.05 ? v.toFixed(0) : v.toFixed(1)}%`;
};

/** Percentage that never rounds up past a threshold: 99.49% stays 99.49%, so "below the 99.5% floor" reads correctly. */
export const pctFloor = (p: number): string => (p >= 0.99 && p < 1 ? `${(Math.floor(p * 10000) / 100).toFixed(2)}%` : pct(p));

/** Seconds as a compact duration: 42s, 3m 05s, 1h 20m. */
export const duration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}m`;
};

/** Token counts: 950, 12.3k, 1.2M. */
export const tokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;

/** One stable colour per model family, for terminal (ANSI 256) and HTML (hex). */
export const MODEL_COLORS: Record<AgentAlias, { ansi256: number; hex: string; label: string }> = {
  haiku: { ansi256: 79, hex: "#2a9d8f", label: "Haiku" },
  sonnet: { ansi256: 69, hex: "#4c6ef5", label: "Sonnet" },
  opus: { ansi256: 135, hex: "#9c36b5", label: "Opus" },
  fable: { ansi256: 208, hex: "#e8590c", label: "Fable" },
};

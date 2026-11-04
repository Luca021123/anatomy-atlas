/**
 * Terminal renderers: plan tables, run summaries, model/stat tables and the
 * live view shown during `mopt run`. Pure render functions are deterministic;
 * only the live view's interactive redraw timer reads the clock.
 */
import type { Catalog } from "../catalog.ts";
import { defaultCatalog } from "../catalog.ts";
import type { RunEvent } from "../events.ts";
import { duration, MODEL_COLORS, pct, tokens, usd } from "../format.ts";
import type { AgentAlias, LedgerStats, LiveTotals, RoutedPlan, Routing, RunSummary } from "../types.ts";
import { EFFORTS } from "../types.ts";

export interface TermOptions {
  color: boolean;
  width: number;
}

/** color: FORCE_COLOR set, or (stream.isTTY && !NO_COLOR && TERM !== "dumb"); width: stream.columns ?? 100, clamped to [60, 160]. */
export function termOptionsFromEnv(stream?: NodeJS.WriteStream): TermOptions {
  const env = process.env;
  const forced = env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0";
  const tty = Boolean(stream?.isTTY) && !env.NO_COLOR && env.TERM !== "dumb";
  const cols = stream?.columns ?? 100;
  return { color: forced || tty, width: Math.min(160, Math.max(60, Math.floor(cols))) };
}

// ---------------------------------------------------------------------------
// Styling helpers
// ---------------------------------------------------------------------------

const ESC = "\x1b";
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");
const vlen = (s: string): number => [...stripAnsi(s)].length;

interface Style {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  yellow(s: string): string;
  green(s: string): string;
  c256(n: number, s: string): string;
  model(alias: AgentAlias | undefined, s: string): string;
}

function makeStyle(color: boolean): Style {
  const wrap = (code: string) => (s: string) => (color ? `${ESC}[${code}m${s}${ESC}[0m` : s);
  return {
    bold: wrap("1"),
    dim: wrap("2"),
    red: wrap("31"),
    yellow: wrap("33"),
    green: wrap("32"),
    c256: (n, s) => (color ? `${ESC}[38;5;${n}m${s}${ESC}[0m` : s),
    model: (alias, s) => (color && alias ? `${ESC}[38;5;${MODEL_COLORS[alias].ansi256}m${s}${ESC}[0m` : s),
  };
}

const padR = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - vlen(s)));
const padL = (s: string, w: number): string => " ".repeat(Math.max(0, w - vlen(s))) + s;

/** Truncates plain text to `w` visible characters with an ellipsis. */
function trunc(s: string, w: number): string {
  const chars = [...s];
  if (chars.length <= w) return s;
  if (w <= 1) return w === 1 ? "…" : "";
  return chars.slice(0, w - 1).join("") + "…";
}

function wrap(text: string, width: number, indent = ""): string[] {
  const out: string[] = [];
  const room = Math.max(10, width - indent.length);
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > room) {
        out.push(indent + line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(indent + line);
  }
  return out;
}

interface Col {
  header: string;
  align?: "l" | "r";
  /** Flexible columns absorb leftover width and truncate. */
  flex?: boolean;
  min?: number;
}

const SEP = " │ ";

/** Renders a table; rows may contain ANSI codes, widths come from visible text. */
function table(cols: Col[], rows: string[][], st: Style, width: number): string[] {
  const widths = cols.map((c, i) => Math.max(vlen(c.header), ...rows.map((r) => vlen(r[i] ?? ""))));
  const flexIdx = cols.findIndex((c) => c.flex);
  if (flexIdx >= 0) {
    const others = widths.reduce((a, w, i) => (i === flexIdx ? a : a + w), 0) + SEP.length * (cols.length - 1);
    const room = width - others;
    widths[flexIdx] = Math.max(cols[flexIdx]!.min ?? 10, Math.min(widths[flexIdx]!, room));
  }
  const cell = (c: Col, i: number, s: string): string => {
    let t = s;
    if (vlen(t) > widths[i]!) t = trunc(stripAnsi(t), widths[i]!);
    return c.align === "r" ? padL(t, widths[i]!) : padR(t, widths[i]!);
  };
  const line = (cells: string[]) => cols.map((c, i) => cell(c, i, cells[i] ?? "")).join(st.dim(SEP)).trimEnd();
  const out = [st.bold(line(cols.map((c) => c.header)))];
  out.push(st.dim(widths.map((w) => "─".repeat(w)).join("─┼─")));
  for (const r of rows) out.push(line(r));
  return out;
}

const shortModel = (id: string): string => {
  try {
    return defaultCatalog.get(id).name.replace(/^Claude\s+/, "");
  } catch {
    return id;
  }
};
const aliasOf = (id: string): AgentAlias | undefined => {
  try {
    return defaultCatalog.get(id).alias;
  } catch {
    return undefined;
  }
};
const shortFromName = (name: string): string => name.replace(/^Claude\s+/, "");
const signed = (v: number, digits = 2): string => `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(digits)}`;
const signedPct = (v: number): string => `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(1)}%`;

const FLAG_MARK: Record<string, string> = {
  "below-floor": "!",
  "human-review": "H",
  "batch-eligible": "B",
  batched: "b",
  "exceeds-max-output": "X",
  "long-context-pricing": "L",
};
const FLAG_LEGEND: Record<string, string> = {
  "below-floor": "! below quality floor",
  "human-review": "H human review recommended",
  "batch-eligible": "B batch-eligible (--batch)",
  batched: "b batched",
  "exceeds-max-output": "X exceeds max output",
  "long-context-pricing": "L long-context pricing",
};

function heading(st: Style, text: string): string {
  return st.bold(text);
}

function labelled(st: Style, label: string, text: string): string {
  return `  ${st.bold(padR(label, 14))}${text}`;
}

// ---------------------------------------------------------------------------
// renderPlan
// ---------------------------------------------------------------------------

function plannerLine(plan: RoutedPlan): string {
  const src = plan.decomposition.source;
  if (src.planner === "llm") {
    const parts = [`LLM: ${src.model ? shortModel(src.model) : "unknown"}${src.effort ? ` @ ${src.effort}` : ""}`];
    if (src.usage) parts.push(usd(src.usage.cost_usd));
    if (src.elapsed_s !== undefined) parts.push(`${src.elapsed_s.toFixed(1)}s`);
    return parts.join(", ");
  }
  return src.planner === "heuristic" ? "heuristic (offline)" : "external";
}

export function renderPlan(plan: RoutedPlan, opts: TermOptions, detail: { verbose?: boolean } = {}): string {
  const st = makeStyle(opts.color);
  const m = plan.metrics;
  const out: string[] = [];
  const dec = plan.decomposition;

  out.push(st.bold(dec.title));
  out.push(...wrap(dec.goal, opts.width, ""));
  out.push(st.dim(`Planner: ${plannerLine(plan)}`));
  out.push("");

  // Table
  const cols: Col[] = [
    { header: "ID" },
    { header: "Title", flex: true, min: 14 },
    { header: "Category" },
    { header: "Lvl", align: "r" },
    { header: "Model" },
    { header: "Effort" },
    { header: "1st", align: "r" },
    { header: "Final", align: "r" },
    { header: "Verify" },
    { header: "Expected", align: "r" },
    { header: "Baseline", align: "r" },
    { header: "" },
  ];
  const cells = (r: Routing): string[] => [
    r.id,
    r.title,
    r.category,
    r.difficulty.level.toFixed(2),
    st.model(r.agent_alias, shortFromName(r.model_name)),
    r.effort,
    pct(r.p_first),
    r.meets_floor ? pct(r.p_final) : st.red(pct(r.p_final)),
    r.verification.method,
    usd(r.cost.expected),
    usd(r.cost.baseline),
    r.flags.map((f) => FLAG_MARK[f] ?? "?").join(""),
  ];
  const allRows = plan.routes.map(cells);
  // Drop low-priority columns until the title has room.
  const dropOrder = ["Category", "Verify", "Baseline", "Effort"];
  let keep = cols.map((_, i) => i);
  const fits = (idx: number[]) => {
    const fixed = idx.reduce((a, i) => (cols[i]!.flex ? a : a + Math.max(vlen(cols[i]!.header), ...allRows.map((r) => vlen(r[i]!)))), 0);
    return opts.width - fixed - SEP.length * (idx.length - 1) >= 18;
  };
  for (const name of dropOrder) {
    if (fits(keep)) break;
    keep = keep.filter((i) => cols[i]!.header !== name);
  }
  const tcols = keep.map((i) => cols[i]!);
  const trows = allRows.map((r) => keep.map((i) => r[i]!));
  const tlines = table(tcols, trows, st, opts.width);
  if (detail.verbose) {
    // Interleave detail lines beneath each row (rows start after header + rule).
    const res: string[] = [tlines[0]!, tlines[1]!];
    plan.routes.forEach((r, i) => {
      res.push(tlines[i + 2]!);
      const ind = "      ";
      for (const reason of r.reasons) res.push(...wrap(`• ${reason}`, opts.width, ind).map((l) => st.dim(l)));
      const ladder = [`${shortModel(r.model)}@${r.effort}`, ...r.escalation.map((c) => `${shortModel(c.model)}@${c.effort}`)];
      res.push(st.dim(`${ind}ladder: ${ladder.join(" → ")}`));
      const rq = r.request;
      res.push(
        st.dim(
          `${ind}request: max_tokens ${rq.max_tokens} · cache ${rq.cache.enabled ? `${rq.cache.prefix_tokens} tok / ${rq.cache.ttl}` : "off"} · fallbacks ${rq.fallbacks ? "server-side" : "none"}${rq.batch ? " · batch" : ""}`,
        ),
      );
    });
    out.push(...res);
  } else out.push(...tlines);

  const flagsUsed = [...new Set(plan.routes.flatMap((r) => r.flags))].filter((f) => FLAG_LEGEND[f]);
  if (flagsUsed.length) out.push(st.dim(`Flags: ${flagsUsed.map((f) => FLAG_LEGEND[f]).join(" · ")}`));
  out.push("");

  // Metrics
  const sch = m.schedule;
  out.push(heading(st, "Metrics"));
  out.push(
    labelled(
      st,
      "Schedule",
      `${sch.waves.length} wave${sch.waves.length === 1 ? "" : "s"} · critical path ${sch.critical_path.join(" → ")} (${duration(sch.critical_path_s)}) · sequential ${duration(sch.sequential_s)} · ${sch.parallelism.toFixed(2)}x parallelism`,
    ),
  );
  const agentMode = plan.options.mode === "agent";
  let cost = agentMode
    ? `${st.bold(usd(m.cost.expected_with_cache))} expected usage as Claude Code subagents (API-equivalent) · p50 ${usd(m.cost.p50)} · p90 ${usd(m.cost.p90)} · worst case ${usd(m.cost.worst_case)}`
    : `${st.bold(usd(m.cost.expected_with_cache))} expected (with cache) · p50 ${usd(m.cost.p50)} · p90 ${usd(m.cost.p90)} · worst case ${usd(m.cost.worst_case)} · cache saves ${usd(m.cost.cache_saving)}`;
  if (m.cost.batch_saving_available > 0) cost += ` · batching could save ${usd(m.cost.batch_saving_available)} more (try --batch)`;
  out.push(labelled(st, "Cost", cost));
  const sv = m.savings;
  let sav = `${st.green(`${usd(sv.usd)} (${sv.pct.toFixed(1)}%)`)} vs ${sv.vs}`;
  if (m.planner_overhead > 0) sav += ` · net of planner overhead ${usd(sv.net_of_planner_usd)}`;
  out.push(labelled(st, "Savings", sav));
  const others = m.baselines.filter((b) => b.label !== sv.vs && !b.label.includes("(reference)"));
  if (others.length) {
    out.push(
      labelled(
        st,
        "Compared",
        others.map((b) => `${b.label.replace(/^All on /, "")} ${usd(b.cost)}${b.below_floor > 0 ? ` (${b.below_floor} below floor)` : ""}`).join(" · "),
      ),
    );
  }
  const sc = m.single_config;
  if (sc) {
    const cfg = `${shortModel(sc.model)} @ ${sc.effort}`;
    out.push(
      sc.recommended
        ? labelled(st, "Single config", st.yellow(`⚠ Use ${cfg} for everything: routing gains only ${sc.routing_gain_pct.toFixed(1)}%. ${sc.reason}`))
        : labelled(st, "Single config", `Not recommended: routing beats ${cfg} by ${sc.routing_gain_pct.toFixed(1)}%`),
    );
  }
  const q = m.quality;
  out.push(
    labelled(
      st,
      "Quality",
      `floor ${pct(q.floor_min)}${q.floor_max !== q.floor_min ? `–${pct(q.floor_max)}` : ""} · mean final ${pct(q.mean_p_final)} · min ${pct(q.min_p_final)} · ~${q.expected_escalations.toFixed(1)} expected escalations · human review: ${q.human_review.length ? q.human_review.join(", ") : "none"}${q.below_floor.length ? ` · ${st.red(`below floor: ${q.below_floor.join(", ")}`)}` : ""}`,
    ),
  );
  // Model mix
  const mix = m.model_mix;
  const barW = Math.max(10, Math.min(40, opts.width - 16));
  const total = mix.reduce((a, e) => a + e.share_of_cost, 0) || 1;
  let used = 0;
  let bar = "";
  mix.forEach((e, i) => {
    const target = Math.round(((mix.slice(0, i + 1).reduce((a, x) => a + x.share_of_cost, 0)) / total) * barW);
    const n = Math.max(e.share_of_cost > 0 ? 1 : 0, target - used);
    used += n;
    bar += st.model(e.alias, "█".repeat(n));
  });
  out.push(labelled(st, "Model mix", bar));
  for (const e of mix) {
    out.push(`  ${" ".repeat(14)}${st.model(e.alias, "■")} ${e.alias} ${e.subsections} sub${e.subsections === 1 ? "" : "s"} · ${usd(e.expected_cost)} (${Math.round(e.share_of_cost * 100)}%)`);
  }
  out.push("");

  // Issues
  const errs = plan.issues.filter((i) => i.level === "error");
  const warns = plan.issues.filter((i) => i.level === "warning");
  const infos = plan.issues.filter((i) => i.level === "info");
  if (plan.issues.length) {
    out.push(heading(st, "Issues"));
    const fmt = (i: (typeof plan.issues)[number]) => `${i.subsection ? `[${i.subsection}] ` : ""}${i.message}`;
    for (const i of errs) out.push(...wrap(`✗ ${fmt(i)}`, opts.width, "  ").map((l) => st.red(l)));
    for (const i of warns) out.push(...wrap(`⚠ ${fmt(i)}`, opts.width, "  ").map((l) => st.yellow(l)));
    if (detail.verbose) for (const i of infos) out.push(...wrap(`i ${fmt(i)}`, opts.width, "  ").map((l) => st.dim(l)));
    else if (infos.length) out.push(st.dim(`  ${infos.length} info note${infos.length === 1 ? "" : "s"} - use --verbose`));
    out.push("");
  }
  if (dec.open_questions.length) {
    out.push(heading(st, "Open questions"));
    for (const q2 of dec.open_questions) out.push(...wrap(`? ${q2}`, opts.width, "  "));
    out.push("");
  }
  if (dec.assumptions.length) {
    out.push(heading(st, "Assumptions"));
    for (const a of dec.assumptions) out.push(...wrap(`- ${a}`, opts.width, "  "));
    out.push("");
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// renderRunSummary
// ---------------------------------------------------------------------------

export function renderRunSummary(summary: RunSummary, plan: RoutedPlan, opts: TermOptions): string {
  const st = makeStyle(opts.color);
  const t = summary.totals;
  const out: string[] = [];
  out.push(st.bold(`Run summary: ${summary.plan_title}`));
  out.push("");
  const routeById = new Map(plan.routes.map((r) => [r.id, r]));
  const cols: Col[] = [
    { header: "ID" },
    { header: "Title", flex: true, min: 12 },
    { header: "Model" },
    { header: "Tries", align: "r" },
    { header: "Estimated", align: "r" },
    { header: "Actual", align: "r" },
    { header: "Delta", align: "r" },
    { header: "Latency", align: "r" },
    { header: "Status" },
  ];
  const rows = summary.states.map((s) => {
    const modelId = s.final_model ?? s.attempts[s.attempts.length - 1]?.model ?? routeById.get(s.id)?.model;
    const alias = modelId ? aliasOf(modelId) : undefined;
    const lat = s.attempts.reduce((a, r) => a + r.latency_s, 0);
    const delta = s.est_cost_usd > 0 ? signedPct(((s.cost_usd - s.est_cost_usd) / s.est_cost_usd) * 100) : "-";
    const status =
      s.status === "done" ? st.green("✓ done") : s.status === "failed" ? st.red("✗ failed") : s.status === "skipped" ? st.dim("skipped") : s.status;
    return [
      s.id,
      s.title,
      modelId ? st.model(alias, shortModel(modelId)) : "-",
      String(s.attempts.length),
      usd(s.est_cost_usd),
      usd(s.cost_usd),
      delta,
      s.attempts.length ? duration(lat) : "-",
      status,
    ];
  });
  out.push(...table(cols, rows, st, opts.width));
  out.push("");
  const saved = t.baseline_usd - t.spent_usd;
  const savedPct = t.baseline_usd > 0 ? (saved / t.baseline_usd) * 100 : 0;
  out.push(heading(st, "Totals"));
  out.push(labelled(st, "Spent", `${st.bold(usd(t.spent_usd))} · router estimate ${usd(t.est_total_usd)} · baseline ${usd(t.baseline_usd)}`));
  out.push(labelled(st, "Savings", st.green(`${usd(saved)} (${savedPct.toFixed(1)}%)`) + " vs baseline"));
  const fp = t.done > 0 ? `${t.first_pass_successes}/${t.done} (${pct(t.first_pass_successes / t.done)})` : "n/a";
  out.push(labelled(st, "First pass", `${fp} succeeded first time · ${t.escalations} escalation${t.escalations === 1 ? "" : "s"}`));
  const k = t.tokens;
  out.push(
    labelled(st, "Tokens", `in ${tokens(k.input)} · out ${tokens(k.output)} · thinking ${tokens(k.thinking)} · cache read ${tokens(k.cache_read)} · cache write ${tokens(k.cache_write)}`),
  );
  const stText = summary.status === "completed" ? st.green(summary.status) : st.red(summary.status);
  out.push(labelled(st, "Status", `${stText} · ${duration(t.elapsed_s)} · ${t.done} done, ${t.failed} failed, ${t.skipped} skipped`));
  out.push(labelled(st, "Output", summary.out_dir));
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// renderModels
// ---------------------------------------------------------------------------

export function renderModels(catalog: Catalog, opts: TermOptions): string {
  const st = makeStyle(opts.color);
  const price = (v: number) => `$${v}`;
  const ctx = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`);
  const out: string[] = [st.bold(`Models (pricing as of ${catalog.pricingAsOf}, $ per million tokens)`), ""];
  const rows = catalog.models.map((m) => [
    st.model(m.alias, m.alias),
    m.id,
    price(m.pricing.input),
    price(m.pricing.output),
    price(m.pricing.cacheRead),
    `-${Math.round(m.batchDiscount * 100)}%`,
    ctx(m.contextWindow),
  ]);
  out.push(
    ...table(
      [
        { header: "Alias" },
        { header: "ID" },
        { header: "Input", align: "r" },
        { header: "Output", align: "r" },
        { header: "Cache read", align: "r" },
        { header: "Batch", align: "r" },
        { header: "Context", align: "r" },
      ],
      rows,
      st,
      opts.width,
    ),
  );
  out.push("", st.bold("Capability ceilings (level at ~90% first-pass)"), "");
  const cell = (m: (typeof catalog.models)[number], rec: Record<string, number>, fmt: (n: number) => string) =>
    EFFORTS.map((e) => (m.efforts.includes(e) ? fmt(rec[e]!) : "-"));
  const effCols: Col[] = EFFORTS.map((e) => ({ header: e, align: "r" as const }));
  out.push(
    ...table(
      [{ header: "Model" }, ...effCols],
      catalog.models.map((m) => [st.model(m.alias, m.alias), ...cell(m, m.ceiling, (n) => n.toFixed(2))]),
      st,
      opts.width,
    ),
  );
  out.push("", st.bold("Output multipliers (total output / visible output)"), "");
  out.push(
    ...table(
      [{ header: "Model" }, ...effCols, { header: "tok/s", align: "r" as const }],
      catalog.models.map((m) => [st.model(m.alias, m.alias), ...cell(m, m.outputMultiplier, (n) => `${n.toFixed(2)}x`), String(m.outputTps)]),
      st,
      opts.width,
    ),
  );
  out.push("", st.dim("Ceilings, multipliers and throughput are priors; `mopt stats` shows what your own runs have taught the router."));
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// renderStats
// ---------------------------------------------------------------------------

export function renderStats(stats: LedgerStats, opts: TermOptions): string {
  const st = makeStyle(opts.color);
  const out: string[] = [];
  out.push(st.bold("Outcome ledger"));
  out.push(labelled(st, "Path", stats.path));
  out.push(labelled(st, "Records", `${stats.records}${stats.since ? ` since ${stats.since}` : ""}`));
  out.push("");
  if (stats.records === 0) {
    out.push("No records yet. The ledger fills up as you use the tool: every attempt from `mopt run` is recorded automatically,");
    out.push("and `mopt log` lets you add outcomes by hand. Until then the router relies on its built-in priors.");
    return out.join("\n") + "\n";
  }
  out.push(st.bold("By category"));
  out.push(
    ...table(
      [
        { header: "Category" },
        { header: "Attempts", align: "r" },
        { header: "Observed", align: "r" },
        { header: "Predicted", align: "r" },
        { header: "Offset", align: "r" },
      ],
      stats.by_category.map((c) => {
        const off = signed(c.offset);
        return [c.category, String(c.attempts), pct(c.pass_rate), pct(c.predicted_rate), c.offset > 0 ? st.yellow(off) : c.offset < 0 ? st.green(off) : off];
      }),
      st,
      opts.width,
    ),
  );
  out.push("", st.bold("By config"));
  out.push(
    ...table(
      [
        { header: "Config" },
        { header: "Attempts", align: "r" },
        { header: "Pass rate", align: "r" },
        { header: "Cost ratio", align: "r" },
        { header: "Out mult", align: "r" },
        { header: "Tokens/s", align: "r" },
      ],
      stats.by_config.map((c) => [
        c.config,
        String(c.attempts),
        pct(c.pass_rate),
        `${c.cost_ratio.toFixed(2)}x`,
        c.output_multiplier === null ? "-" : `${c.output_multiplier.toFixed(2)}x`,
        c.tps === null ? "-" : c.tps.toFixed(0),
      ]),
      st,
      opts.width,
    ),
  );
  out.push("");
  const ratios = stats.by_config.filter((c) => c.attempts > 0);
  if (ratios.length) {
    const mean = ratios.reduce((a, c) => a + c.cost_ratio, 0) / ratios.length;
    const p = Math.round(Math.abs(mean - 1) * 100);
    const text = p === 0 ? "Estimates are accurate on average" : mean > 1 ? `Estimates run ${p}% low on average` : `Estimates run ${p}% high on average`;
    out.push(`${text} (mean actual/estimated cost ${mean.toFixed(2)}x).`);
  }
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Live view
// ---------------------------------------------------------------------------

export interface LiveView {
  onEvent(event: RunEvent): void;
  stop(): void;
}

interface Row {
  id: string;
  title: string;
  status: "pending" | "queued" | "running" | "verifying" | "done" | "failed" | "skipped";
  model?: string;
  effort?: string;
  attempt: number;
  outTokens: number;
  cost: number;
  note: string;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function createLiveView(stream: NodeJS.WriteStream, opts: TermOptions & { interactive: boolean }): LiveView {
  const st = makeStyle(opts.color);
  const rows = new Map<string, Row>();
  const warnings: string[] = [];
  let totals: LiveTotals | undefined;
  let budget: number | undefined;
  let title = "";
  let startMs = 0; // event-time of run.started
  let startWall = 0;
  let finished = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let frame = 0;
  let drawnLines = 0;
  let dirty = false;
  let lastMetricsOffset = -Infinity;
  let lastOffset = 0;

  const offsetOf = (at: string): number => {
    const t = Date.parse(at);
    return Number.isNaN(t) || !startMs ? lastOffset : (lastOffset = Math.max(0, (t - startMs) / 1000));
  };
  const write = (s: string) => {
    try {
      stream.write(s);
    } catch {
      /* closed stream */
    }
  };

  const modelLabel = (r: Row): string => {
    if (!r.model) return "";
    const text = `${shortModel(r.model)}${r.effort ? `@${r.effort}` : ""}`;
    return st.model(aliasOf(r.model), text);
  };

  function buildBlock(): string[] {
    const lines: string[] = [];
    const w = opts.width;
    const t = totals;
    const elapsed = t ? t.elapsed_s : (Date.now() - startWall) / 1000;
    const done = t ? t.done : [...rows.values()].filter((r) => r.status === "done").length;
    const parts = [st.bold(clock(elapsed))];
    if (t) {
      parts.push(`spent ${usd(t.spent_usd)}`);
      parts.push(`projected ${usd(t.projected_total_usd)} / est ${usd(t.est_total_usd)}`);
      parts.push(`saving ${t.projected_savings_pct.toFixed(0)}%`);
    }
    parts.push(`${done}/${rows.size} done`);
    parts.push(`${t ? t.escalations : 0} esc`);
    if (t && budget !== undefined && budget > 0) {
      const used = t.spent_usd / budget;
      const txt = `budget ${Math.round(used * 100)}% of ${usd(budget)}`;
      parts.push(used > 1 ? st.red(txt) : used > 0.8 ? st.yellow(txt) : txt);
    }
    lines.push(`${st.bold(trunc(title, 24))} ${parts.join(st.dim(" · "))}`);
    const spin = SPINNER[frame % SPINNER.length]!;
    for (const r of rows.values()) {
      const glyph =
        r.status === "running" || r.status === "verifying"
          ? st.c256(214, spin)
          : r.status === "done"
            ? st.green("✓")
            : r.status === "failed"
              ? st.red("✗")
              : r.status === "skipped"
                ? st.dim("⇢")
                : st.dim("·");
      const idCol = padR(r.id, 4);
      const tail = [
        modelLabel(r),
        r.attempt > 0 ? `#${r.attempt}` : "",
        r.outTokens > 0 ? `${tokens(r.outTokens)} tok` : "",
        r.cost > 0 ? usd(r.cost) : "",
      ].filter(Boolean);
      const tailVis = tail.reduce((a, s) => a + vlen(s) + 2, 0);
      const note = r.note;
      const fixed = 2 + 4 + 1 + tailVis + 2;
      const room = Math.max(12, w - fixed);
      const titleW = Math.max(10, Math.min(28, Math.floor(room * 0.4)));
      const noteW = Math.max(0, room - titleW - 2);
      const noteTxt = trunc(note, noteW);
      const noteStyled = r.status === "failed" ? st.red(noteTxt) : st.dim(noteTxt);
      lines.push(`${glyph} ${idCol} ${padR(trunc(r.title, titleW), titleW)}  ${tail.join("  ")}  ${noteStyled}`.trimEnd());
    }
    for (const msg of warnings.slice(-3)) lines.push(st.yellow(trunc(`⚠ ${msg}`, w - 1)));
    return lines;
  }

  function draw(): void {
    if (!opts.interactive) return;
    const block = buildBlock();
    let buf = "";
    if (drawnLines > 0) buf += `${ESC}[${drawnLines}F${ESC}[0J`;
    buf += block.join("\n") + "\n";
    drawnLines = block.length;
    write(buf);
    dirty = false;
  }

  function ensureTimer(): void {
    if (!opts.interactive || timer || stopped) return;
    timer = setInterval(() => {
      const active = [...rows.values()].some((r) => r.status === "running" || r.status === "verifying");
      if (active) frame++;
      if (dirty || active) draw();
    }, 100);
    timer.unref();
  }

  const plain = (offset: number, text: string) => write(`[${clock(offset)}] ${text}\n`);

  function metricsLine(t: LiveTotals): string {
    let s = `${t.done}/${rows.size} done · spent ${usd(t.spent_usd)} · projected ${usd(t.projected_total_usd)} (est ${usd(t.est_total_usd)}) · saving ${t.projected_savings_pct.toFixed(0)}% · ${t.escalations} escalations`;
    if (t.budget_usd !== undefined) s += ` · budget ${Math.round((t.spent_usd / t.budget_usd) * 100)}%`;
    return s;
  }

  function onEvent(e: RunEvent): void {
    if (stopped && e.type !== "run.finished") return;
    const off = e.type === "run.started" ? 0 : offsetOf(e.at);
    switch (e.type) {
      case "run.started": {
        startMs = Date.parse(e.at) || 0;
        startWall = Date.now();
        lastOffset = 0;
        title = e.plan.decomposition.title;
        budget = e.budget_usd;
        rows.clear();
        for (const r of e.plan.routes) {
          rows.set(r.id, { id: r.id, title: r.title, status: "pending", model: r.model, effort: r.effort, attempt: 0, outTokens: 0, cost: 0, note: "" });
        }
        if (opts.interactive) {
          ensureTimer();
          draw();
        } else
          plain(0, `Run started: ${title} (${rows.size} subsections, concurrency ${e.concurrency}${e.dry_run ? ", dry run" : ""}${e.budget_usd !== undefined ? `, budget ${usd(e.budget_usd)}` : ""})`);
        return;
      }
      case "subsection.queued": {
        const r = rows.get(e.id);
        if (r) r.status = "queued";
        break;
      }
      case "subsection.started": {
        const r = rows.get(e.id);
        if (r) {
          r.status = "running";
          r.model = e.model;
          r.effort = e.effort;
          r.attempt = e.attempt;
          r.outTokens = 0;
          r.note = e.attempt > 1 ? "retrying" : "running";
        }
        if (!opts.interactive) plain(off, `${e.id} started: ${shortModel(e.model)} @ ${e.effort} (attempt ${e.attempt})`);
        break;
      }
      case "subsection.progress": {
        const r = rows.get(e.id);
        if (r) r.outTokens = e.output_tokens;
        break;
      }
      case "subsection.attempt_finished": {
        const r = rows.get(e.id);
        if (r) {
          r.cost += e.record.cost_usd + (e.record.verdict?.judge_cost_usd ?? 0);
          r.outTokens = e.record.usage.output + e.record.usage.thinking;
        }
        break;
      }
      case "subsection.verifying": {
        const r = rows.get(e.id);
        if (r) {
          r.status = "verifying";
          r.note = `verifying with ${shortModel(e.judge_model)}`;
        }
        break;
      }
      case "subsection.escalated": {
        const r = rows.get(e.id);
        const note = `escalated → ${shortModel(e.to.model)} @ ${e.to.effort}`;
        if (r) {
          r.status = "queued";
          r.model = e.to.model;
          r.effort = e.to.effort;
          r.note = note;
        }
        if (!opts.interactive) plain(off, `${e.id} ${note} (${e.reason})`);
        break;
      }
      case "subsection.completed": {
        const r = rows.get(e.id);
        if (r) {
          r.status = "done";
          r.cost = e.state.cost_usd;
          r.note = "pass";
          if (e.state.final_model) r.model = e.state.final_model;
        }
        if (!opts.interactive) plain(off, `${e.id} completed: ${usd(e.state.cost_usd)} after ${e.state.attempts.length} attempt${e.state.attempts.length === 1 ? "" : "s"}`);
        break;
      }
      case "subsection.failed": {
        const r = rows.get(e.id);
        if (r) {
          r.status = "failed";
          r.cost = e.state.cost_usd;
          r.note = e.reason;
        }
        if (!opts.interactive) plain(off, `${e.id} FAILED: ${e.reason}`);
        break;
      }
      case "subsection.skipped": {
        const r = rows.get(e.id);
        if (r) {
          r.status = "skipped";
          r.note = e.reason;
        }
        if (!opts.interactive) plain(off, `${e.id} skipped: ${e.reason}`);
        break;
      }
      case "metrics": {
        totals = e.totals;
        if (e.totals.budget_usd !== undefined) budget = e.totals.budget_usd;
        if (!opts.interactive && off - lastMetricsOffset >= 10) {
          lastMetricsOffset = off;
          plain(off, metricsLine(e.totals));
        }
        break;
      }
      case "warning": {
        warnings.push(e.id ? `[${e.id}] ${e.message}` : e.message);
        if (!opts.interactive) plain(off, `warning: ${e.id ? `[${e.id}] ` : ""}${e.message}`);
        break;
      }
      case "run.finished": {
        if (finished) return;
        finished = true;
        totals = e.summary.totals;
        for (const s of e.summary.states) {
          const r = rows.get(s.id);
          if (r && (r.status === "running" || r.status === "verifying" || r.status === "queued")) r.status = s.status;
        }
        if (opts.interactive) {
          draw();
          if (timer) clearInterval(timer);
          timer = undefined;
        } else {
          plain(off, `Run ${e.summary.status}: ${metricsLine(e.summary.totals)}`);
        }
        return;
      }
    }
    dirty = true;
  }

  return {
    onEvent,
    stop(): void {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      if (opts.interactive && rows.size && !finished) draw();
    },
  };
}

/**
 * Self-contained HTML dashboard: a static report of a routed plan (optionally with
 * the results of a finished run) and, when `live` is given, a page that follows a
 * running plan through Server-Sent Events.
 *
 * The page has no external resources. Markup is rendered here with every string
 * escaped; the inline script only ever uses textContent / setAttribute for dynamic text.
 */
import { defaultCatalog } from "../catalog.ts";
import { duration, MODEL_COLORS, pct, tokens, usd } from "../format.ts";
import type { AgentAlias, Routing, RoutedPlan, RunSummary, SubsectionRunState } from "../types.ts";

export interface HtmlInput {
  plan: RoutedPlan;
  run?: RunSummary;
  live?: { eventsUrl: string };
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** JSON that is safe inside an inline <script>: no "<", no U+2028/U+2029. */
const safeJson = (v: unknown): string =>
  JSON.stringify(v).replace(/</g, "\\u003c").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029");

const ALIASES = Object.keys(MODEL_COLORS) as AgentAlias[];
const aliasOf = (model: string): AgentAlias | undefined => ALIASES.find((a) => model.toLowerCase().includes(a));

const STATUS_LABEL: Record<string, string> = {
  pending: "pending",
  queued: "queued",
  running: "running",
  verifying: "verifying",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};
const STATUS_GLYPH: Record<string, string> = {
  pending: "○",
  queued: "○",
  running: "",
  verifying: "◎",
  done: "✓",
  failed: "✕",
  skipped: "–",
};

function statusBadge(id: string, status: string): string {
  const glyph = STATUS_GLYPH[status] ?? "";
  return `<span class="st" data-st="${esc(id)}" data-status="${esc(status)}"><span class="glyph" aria-hidden="true">${glyph}</span><span class="stl">${esc(STATUS_LABEL[status] ?? status)}</span></span>`;
}

function modelBadge(alias: AgentAlias | undefined, label: string, effort?: string): string {
  const style = alias ? ` style="--mc:var(--m-${alias})"` : "";
  return `<span class="mbadge"${style}><i class="dot" aria-hidden="true"></i>${esc(label)}${effort ? ` @ ${esc(effort)}` : ""}</span>`;
}

function routeBadge(r: Routing): string {
  return modelBadge(r.agent_alias, r.model_name, r.effort);
}

function tile(label: string, value: string, sub?: string, extra = "", key?: string): string {
  const k = key ? ` data-k="${esc(key)}"` : "";
  return `<div class="tile${extra ? " " + extra : ""}"><div class="tl">${esc(label)}</div><div class="tv"${k}>${esc(value)}</div>${sub !== undefined ? `<div class="ts">${esc(sub)}</div>` : ""}</div>`;
}

function flagBadges(r: Routing): string {
  const out: string[] = [];
  if (!r.meets_floor) out.push(`<span class="flag bad">below floor</span>`);
  if (r.verification.human_review) out.push(`<span class="flag warn">human review</span>`);
  if (r.batch.applied) out.push(`<span class="flag">batched</span>`);
  else if (r.batch.eligible) out.push(`<span class="flag">batch-eligible</span>`);
  return out.join("");
}

export function renderHtml(input: HtmlInput): string {
  const { plan, run, live } = input;
  const dec = plan.decomposition;
  const m = plan.metrics;
  const routeById = new Map(plan.routes.map((r) => [r.id, r]));
  const stateById = new Map<string, SubsectionRunState>((run?.states ?? []).map((s) => [s.id, s]));
  const critical = new Set(m.schedule.critical_path);
  const modelName = (model: string): string =>
    plan.routes.find((r) => r.model === model)?.model_name ?? (aliasOf(model) ? MODEL_COLORS[aliasOf(model)!].label : model);

  const statusOf = (id: string): string => stateById.get(id)?.status ?? "pending";

  /** Run-mode / live placeholders shown on cards and rows. */
  const runBits = (r: Routing, where: "card" | "row"): string => {
    if (!run && !live) return "";
    const s = stateById.get(r.id);
    const id = esc(r.id);
    let fin = "";
    if (s?.final_model && s.final_model !== r.model) fin = `escalated → ${modelName(s.final_model)}`;
    const att = s ? `${s.attempts.length} attempt${s.attempts.length === 1 ? "" : "s"}` : "";
    const cost = s ? `actual ${usd(s.cost_usd)} / est ${usd(s.est_cost_usd || r.cost.expected)}` : "";
    if (where === "row") {
      return `<td>${statusBadge(r.id, statusOf(r.id))}</td><td data-fin="${id}">${esc(fin)}</td><td data-att="${id}">${esc(att)}</td><td class="num" data-act="${id}">${esc(cost)}</td>`;
    }
    return (
      `<div class="runline"><span data-fin="${id}" class="fin">${esc(fin)}</span> <span data-att="${id}">${esc(att)}</span></div>` +
      `<div class="runline" data-act="${id}">${esc(cost)}</div>` +
      (live ? `<div class="runline" data-cur="${id}"></div><div class="tokline"><span data-tok="${id}"></span></div><div class="tail" data-tail="${id}"></div>` : "")
    );
  };

  // ---- header ----------------------------------------------------------
  const src = dec.source;
  const planner =
    src.planner === "llm"
      ? `LLM planner${src.model ? ` (${src.model}${src.effort ? ` @ ${src.effort}` : ""})` : ""}${src.usage ? `, cost ${usd(src.usage.cost_usd)}` : ""}`
      : src.planner === "heuristic"
        ? "Heuristic planner"
        : "External decomposition";
  const header = `<header class="hdr">
<div class="eyebrow">Model Optimizer${run ? " · run report" : live ? " · live" : " · plan"}</div>
<h1>${esc(dec.title)}</h1>
<p class="goal">${esc(dec.goal)}</p>
<p class="meta">Planner: ${esc(planner)} · Pricing as of ${esc(m.pricing_as_of)} · routed ${esc(plan.created_at.replace("T", " ").slice(0, 16))} UTC</p>
</header>`;

  // ---- KPI tiles -------------------------------------------------------
  const tiles: string[] = [];
  tiles.push(
    tile(
      plan.options.mode === "agent" ? "Expected usage (API-equivalent)" : "Expected cost",
      usd(m.cost.expected_with_cache),
      `p50 ${usd(m.cost.p50)} · p90 ${usd(m.cost.p90)} · worst case ${usd(m.cost.worst_case)}`,
      "hero",
    ),
  );
  tiles.push(
    tile(
      `Savings vs ${m.savings.vs}`,
      `${usd(m.savings.usd)} (${m.savings.pct.toFixed(1)}%)`,
      `net of planner overhead ${usd(m.savings.net_of_planner_usd)}`,
    ),
  );
  tiles.push(
    tile(
      "Quality (final)",
      `mean ${pct(m.quality.mean_p_final)}`,
      `min ${pct(m.quality.min_p_final)} · ${m.quality.below_floor.length} below floor`,
      m.quality.below_floor.length ? "warnt" : "",
    ),
  );
  tiles.push(
    tile(
      "Schedule",
      duration(m.schedule.critical_path_s),
      `${m.schedule.waves.length} wave${m.schedule.waves.length === 1 ? "" : "s"} · parallelism ${m.schedule.parallelism.toFixed(2)}×`,
    ),
  );
  tiles.push(tile("Subsections", String(m.subsections), `${m.total_repetitions} total repetitions`));
  if (run) {
    const t = run.totals;
    const done = t.done + t.failed;
    const sav = t.baseline_usd > 0 ? (1 - t.spent_usd / t.baseline_usd) * 100 : 0;
    tiles.push(tile("Spent vs estimated", usd(t.spent_usd), `estimated ${usd(t.est_total_usd)}`, "run"));
    tiles.push(tile("Savings vs baseline (actual)", `${sav.toFixed(1)}%`, `baseline ${usd(t.baseline_usd)}`, "run"));
    tiles.push(
      tile(
        "First-pass success",
        done > 0 ? pct(t.first_pass_successes / done) : "n/a",
        `${t.first_pass_successes} of ${done} finished`,
        "run",
      ),
    );
    tiles.push(tile("Escalations", String(t.escalations), `${t.failed} failed · ${t.skipped} skipped`, "run"));
  }
  const kpis = `<section class="tiles" aria-label="Key figures">${tiles.join("")}</section>`;

  // ---- single-config callout ------------------------------------------
  const sc = m.single_config;
  const callout =
    sc && sc.recommended
      ? `<section class="callout" role="note"><strong>Single configuration recommended: ${esc(modelName(sc.model))} @ ${esc(sc.effort)}</strong><p>${esc(sc.reason)}</p><p class="ts">Single-config expected cost ${esc(usd(sc.expected_cost))}; routing gain ${esc(sc.routing_gain_pct.toFixed(1))}%.</p></section>`
      : "";

  // ---- live panel ------------------------------------------------------
  const livePanel = live
    ? `<section class="live" aria-label="Live run"><div id="conn" class="banner" hidden role="status">Connection lost, retrying…</div>
<h2>Live run <span class="runstatus" id="runstatus">waiting for run</span></h2>
<div class="tiles small">
${tile("Spent", "$0", undefined, "", "spent")}${tile("Projected total", usd(m.cost.expected_with_cache), undefined, "", "projected")}${tile("Projected savings", "-", undefined, "", "psave")}${tile("Done", `0 / ${m.subsections}`, undefined, "", "done")}
</div>
<div class="budget" id="budget" hidden><div class="blabel" id="budgetlabel"></div><div class="btrack"><div class="bfill" id="budgetfill"></div></div></div>
<h3>Event log</h3><ol class="log" id="log" aria-live="off"></ol></section>`
    : "";

  // ---- model mix -------------------------------------------------------
  const mix = m.model_mix.filter((e) => e.share_of_cost > 0 || e.subsections > 0);
  const segs = mix
    .map(
      (e) =>
        `<div class="seg" style="flex:${Math.max(e.share_of_cost, 0.004)} 1 0;--mc:var(--m-${e.alias})" title="${esc(`${e.model_name}: ${usd(e.expected_cost)} (${pct(e.share_of_cost)})`)}"></div>`,
    )
    .join("");
  const legend = mix
    .map(
      (e) =>
        `<li><i class="dot" style="--mc:var(--m-${e.alias})" aria-hidden="true"></i><span class="lname">${esc(e.model_name)}</span><span class="lval">${e.subsections} subsection${e.subsections === 1 ? "" : "s"} · ${esc(usd(e.expected_cost))} · ${esc(pct(e.share_of_cost))}</span></li>`,
    )
    .join("");
  const mixSec = `<section><h2>Model mix</h2><p class="sub">Share of expected cost by model.</p><div class="stack" role="img" aria-label="${esc("Share of cost: " + mix.map((e) => `${e.model_name} ${pct(e.share_of_cost)}`).join(", "))}">${segs}</div><ul class="legend">${legend}</ul></section>`;

  // ---- cost comparison -------------------------------------------------
  const cmp = [
    {
      label: "Routed plan",
      value: m.cost.expected_with_cache,
      below: m.quality.below_floor.length,
      routed: true,
      note: "expected, with cache",
    },
    ...m.baselines.map((b) => ({ label: b.label, value: b.cost, below: b.below_floor, routed: false, note: "first attempt" })),
  ];
  const maxCost = Math.max(...cmp.map((c) => c.value), 1e-9);
  const cmpRows = cmp
    .map(
      (c) =>
        `<div class="crow${c.routed ? " routed" : ""}"><div class="clabel">${esc(c.label)}${c.routed ? ` <span class="flag acc">routed</span>` : ""}</div><div class="ctrack"><div class="cbar" style="width:${Math.max((c.value / maxCost) * 100, 0.8).toFixed(2)}%" title="${esc(`${c.label}: ${usd(c.value)} (${c.note})`)}"></div></div><div class="cval"><b>${esc(usd(c.value))}</b>${c.below > 0 ? `<span class="ann"> · ${c.below} below floor</span>` : ""}</div></div>`,
    )
    .join("");
  const cmpSec = `<section><h2>Cost comparison</h2><p class="sub">Routed plan versus running every subsection on one configuration. Baselines are first-attempt costs.</p><div class="cmp">${cmpRows}</div></section>`;

  // ---- schedule --------------------------------------------------------
  const wavesHtml = m.schedule.waves
    .map((wave, i) => {
      const cards = wave
        .map((id) => {
          const r = routeById.get(id);
          if (!r) return "";
          return `<article class="card${critical.has(id) ? " crit" : ""}" data-card="${esc(id)}">
<div class="ch"><span class="cid">${esc(id)}</span>${critical.has(id) ? `<span class="flag acc">critical path</span>` : ""}${run || live ? statusBadge(id, statusOf(id)) : ""}</div>
<div class="ctitle">${esc(r.title)}</div>
<div>${routeBadge(r)}</div>
<div class="cnums"><span>first ${esc(pct(r.p_first))}</span><span>final ${esc(pct(r.p_final))}</span><span>${esc(usd(r.cost.expected))}</span></div>
<div class="flags">${flagBadges(r)}</div>
${runBits(r, "card")}
</article>`;
        })
        .join("");
      return `<div class="wave"><div class="wh">Wave ${i + 1}</div>${cards}</div>`;
    })
    .join("");
  const schedSec = `<section><h2>Schedule</h2><p class="sub">Waves run left to right; subsections in a wave can run in parallel. Critical path ${esc(duration(m.schedule.critical_path_s))}.</p><div class="waves">${wavesHtml}</div></section>`;

  // ---- detail table ----------------------------------------------------
  const cols = run || live ? 14 : 10;
  const rowsHtml = plan.routes
    .map((r) => {
      const ver = `${r.verification.method}${r.verification.judge ? ` (${modelName(r.verification.judge.model)} @ ${r.verification.judge.effort})` : ""}`;
      const ladder = r.escalation.length ? r.escalation.map((c) => `${modelName(c.model)} @ ${c.effort}`).join(" → ") : "none";
      const req = r.request;
      const reqLine = `max_tokens ${req.max_tokens} · effort ${req.output_config.effort} · cache ${req.cache.enabled ? `on (${req.cache.ttl}, ${tokens(req.cache.prefix_tokens)} prefix tokens)` : "off"} · batch ${req.batch ? "yes" : "no"} · fallbacks ${req.fallbacks ? `${req.fallbacks.value} (${req.fallbacks.beta})` : "none"}`;
      return `<tr data-row="${esc(r.id)}"><td class="mono">${esc(r.id)}</td><td>${esc(r.title)}</td><td>${esc(r.category)}</td><td class="num">${esc(r.difficulty.level.toFixed(1))}</td><td>${routeBadge(r)}</td><td>${esc(r.effort)}</td><td>${esc(ver)}</td><td class="num">${esc(usd(r.cost.expected))}</td><td class="num">${esc(usd(r.cost.baseline))}</td><td>${esc(ladder)}</td>${run || live ? runBits(r, "row") : ""}</tr>
<tr class="dr"><td colspan="${cols}"><details><summary>Why ${esc(r.id)}: reasons and request</summary><ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="req">${esc(reqLine)}</p></details></td></tr>`;
    })
    .join("");
  const detailSec = `<section><h2>Subsection detail</h2><div class="tablewrap" tabindex="0" role="region" aria-label="Subsection detail table"><table><thead><tr><th>ID</th><th>Title</th><th>Category</th><th>Difficulty</th><th>Model</th><th>Effort</th><th>Verification</th><th>Expected</th><th>Baseline</th><th>Escalation ladder</th>${run || live ? "<th>Status</th><th>Final model</th><th>Attempts</th><th>Actual vs est</th>" : ""}</tr></thead><tbody>${rowsHtml}</tbody></table></div></section>`;

  // ---- issues and questions -------------------------------------------
  const levels: Array<"error" | "warning" | "info"> = ["error", "warning", "info"];
  const issueGroups = levels
    .map((lv) => {
      const items = plan.issues.filter((i) => i.level === lv);
      if (!items.length) return "";
      return `<div class="igroup ${lv}"><h3>${lv === "error" ? "Errors" : lv === "warning" ? "Warnings" : "Info"} (${items.length})</h3><ul>${items.map((i) => `<li><span class="mono">${esc(i.code)}</span>${i.subsection ? ` <span class="mono">${esc(i.subsection)}</span>` : ""} ${esc(i.message)}</li>`).join("")}</ul></div>`;
    })
    .join("");
  const list = (title: string, items: string[]) =>
    items.length ? `<div class="igroup"><h3>${esc(title)} (${items.length})</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const issuesSec = `<section><h2>Issues and open questions</h2>${issueGroups || `<p class="sub">No issues found.</p>`}${list("Open questions", dec.open_questions)}${list("Assumptions", dec.assumptions)}</section>`;

  const modelNames = Object.fromEntries(defaultCatalog.models.map((spec) => [spec.id, spec.name]));
  const data = { plan, run: run ?? null, live: live ?? null, model_names: modelNames };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc("Model Optimizer - " + dec.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
${header}
${callout}
${kpis}
${livePanel}
${mixSec}
${cmpSec}
${schedSec}
${detailSec}
${issuesSec}
</main>
<script type="application/json" id="mopt-data">${safeJson(data)}</script>
<script>${live ? SCRIPT : ""}</script>
</body>
</html>`;
}

const modelVars = (suffix: string): string =>
  ALIASES.map((a) => `--m-${a}:${MODEL_COLORS[a].hex};`).join("") + suffix;

const CSS = `
:root{color-scheme:light dark;
--bg:#f6f6f4;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#6b6a66;--line:#dcdbd5;--track:#ebeae5;
--accent:#2a78d6;--neutral:#a3a29b;--good:#0f7b3f;--warn:#9a6700;--bad:#b42318;--critbg:#eef4fd;--warnbg:#fff6e0;
${modelVars("")}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;
--bg:#121211;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#9d9c93;--line:#34332f;--track:#2a2926;
--accent:#3987e5;--neutral:#6f6e68;--good:#4cc38a;--warn:#e0a53a;--bad:#f07167;--critbg:#1b2635;--warnbg:#2e2614;}}
:root[data-theme="dark"]{color-scheme:dark;
--bg:#121211;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#9d9c93;--line:#34332f;--track:#2a2926;
--accent:#3987e5;--neutral:#6f6e68;--good:#4cc38a;--warn:#e0a53a;--bad:#f07167;--critbg:#1b2635;--warnbg:#2e2614;}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1200px;margin:0 auto;padding:16px 16px 48px}
h1{font-size:1.6rem;line-height:1.2;margin:.2rem 0 .4rem;overflow-wrap:anywhere}
h2{font-size:1.15rem;margin:0 0 .25rem}
h3{font-size:.95rem;margin:.8rem 0 .3rem}
section{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}
.hdr{padding:8px 0}
.eyebrow{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}
.goal{margin:.2rem 0;color:var(--ink2);overflow-wrap:anywhere}
.meta,.sub,.ts{color:var(--muted);font-size:.85rem;margin:.2rem 0}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em}
.num{text-align:right;white-space:nowrap}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px;background:none;border:0;padding:0}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-width:0}
.tile.hero{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
.tile.warnt .ts{color:var(--warn)}
.tl{font-size:.78rem;color:var(--muted)}
.tv{font-size:1.35rem;font-weight:650;line-height:1.25;overflow-wrap:anywhere}
.tiles.small{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin:8px 0}
.callout{border:2px solid var(--warn);background:var(--warnbg);border-radius:10px}
.callout p{margin:.3rem 0}
.stack{display:flex;gap:2px;height:28px;margin:10px 0}
.seg{background:var(--mc);border-radius:4px;min-width:3px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--mc);margin-right:6px;flex:none}
.legend{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:4px}
.legend li{display:flex;align-items:baseline;flex-wrap:wrap}
.legend .lname{font-weight:600;margin-right:10px}
.legend .lval{color:var(--ink2);font-size:.9rem}
.cmp{display:grid;gap:8px;margin-top:10px}
.crow{display:grid;grid-template-columns:minmax(120px,28%) 1fr 150px;gap:10px;align-items:center}
.clabel{font-size:.9rem;overflow-wrap:anywhere}
.crow.routed .clabel{font-weight:700}
.ctrack{background:var(--track);border-radius:4px;height:18px}
.cbar{height:100%;background:var(--neutral);border-radius:4px}
.crow.routed .cbar{background:var(--accent);height:100%}
.crow.routed .ctrack{height:24px}
.cval{font-size:.85rem;text-align:right}
.ann{color:var(--bad)}
@media (max-width:600px){.crow{grid-template-columns:1fr 150px}.crow .ctrack{grid-column:1/-1;order:3}}
.waves{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(230px,1fr);gap:12px;overflow-x:auto;padding-bottom:6px;margin-top:10px}
.wave{display:flex;flex-direction:column;gap:10px;min-width:0}
.wh{font-size:.8rem;font-weight:650;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
@media (max-width:700px){.waves{grid-auto-flow:row;grid-auto-columns:auto;grid-template-columns:minmax(0,1fr);overflow-x:visible}}
.card{border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface);display:flex;flex-direction:column;gap:6px;min-width:0}
.card.crit{border-color:var(--accent);background:var(--critbg);box-shadow:inset 3px 0 0 var(--accent)}
.ch{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.cid{font-weight:700}
.ctitle{font-size:.92rem;overflow-wrap:anywhere}
.cnums{display:flex;gap:10px;flex-wrap:wrap;font-size:.82rem;color:var(--ink2)}
.flags{display:flex;gap:4px;flex-wrap:wrap}
.flag{font-size:.72rem;border:1px solid var(--line);border-radius:999px;padding:0 7px;color:var(--ink2);white-space:nowrap}
.flag.bad{border-color:var(--bad);color:var(--bad)}
.flag.warn{border-color:var(--warn);color:var(--warn)}
.flag.acc{border-color:var(--accent);color:var(--accent)}
.mbadge{display:inline-flex;align-items:center;border:1.5px solid var(--mc,var(--line));border-radius:6px;padding:1px 8px;font-size:.8rem;white-space:nowrap}
.runline{font-size:.8rem;color:var(--ink2);overflow-wrap:anywhere}
.fin{color:var(--warn);font-weight:600}
.tokline{font-size:.78rem;color:var(--muted)}
.tail{font:.75rem/1.3 ui-monospace,Menlo,monospace;color:var(--muted);max-height:2.7em;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap}
.st{display:inline-flex;align-items:center;gap:4px;font-size:.75rem;border:1px solid var(--line);border-radius:999px;padding:0 8px;color:var(--ink2);margin-left:auto;white-space:nowrap}
td .st{margin-left:0}
.st[data-status="done"]{color:var(--good);border-color:var(--good)}
.st[data-status="failed"]{color:var(--bad);border-color:var(--bad)}
.st[data-status="skipped"]{color:var(--muted)}
.st[data-status="running"],.st[data-status="verifying"]{color:var(--accent);border-color:var(--accent)}
.st[data-status="running"] .glyph{width:9px;height:9px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.st[data-status="running"] .glyph{animation:none}}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin-top:10px}
table{border-collapse:collapse;width:100%;font-size:.85rem}
th,td{padding:6px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{position:sticky;top:0;background:var(--surface);font-size:.75rem;color:var(--muted);white-space:nowrap}
td{min-width:70px}
td:nth-child(2){min-width:180px}
tr.dr td{padding-top:0;border-bottom:1px solid var(--line)}
tr:not(.dr) td{border-bottom:0}
details summary{cursor:pointer;color:var(--accent);font-size:.8rem}
.reasons{margin:.4rem 0;padding-left:1.2rem}
.req{color:var(--ink2);font-size:.8rem;margin:.3rem 0;overflow-wrap:anywhere}
.igroup{margin-top:8px}
.igroup ul{margin:.2rem 0;padding-left:1.2rem}
.igroup.error h3{color:var(--bad)}.igroup.warning h3{color:var(--warn)}
.banner{background:var(--warnbg);border:1px solid var(--warn);color:var(--ink);border-radius:8px;padding:8px 12px;margin-bottom:8px}
.runstatus{font-size:.8rem;color:var(--muted);font-weight:400;margin-left:8px}
.btrack{height:10px;background:var(--track);border-radius:5px;overflow:hidden}
.bfill{height:100%;width:0;background:var(--accent)}
.bfill.over{background:var(--bad)}
.blabel{font-size:.8rem;color:var(--ink2);margin-bottom:3px}
.log{list-style:none;margin:0;padding:0;max-height:260px;overflow:auto;font:.78rem/1.4 ui-monospace,Menlo,monospace;border:1px solid var(--line);border-radius:8px}
.log li{padding:3px 8px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
.log li .t{color:var(--muted);margin-right:6px}
[hidden]{display:none!important}
`;

/** Inline live-mode client. No backticks or template placeholders: it is embedded in a TS template string. */
const SCRIPT = String.raw`
(function(){
var D=JSON.parse(document.getElementById('mopt-data').textContent);
if(!D.live||!window.EventSource)return;
var routes={};D.plan.routes.forEach(function(r){routes[r.id]=r;});
var names=D.model_names||{};D.plan.routes.forEach(function(r){names[r.model]=r.model_name;});
function usd(v){var s=v<0?'-':'',a=Math.abs(v);return s+'$'+(a>=1?a.toFixed(2):a>=0.01?a.toFixed(3):a>0?a.toFixed(4):'0');}
function pct(p){var v=p*100;return (Math.abs(v-Math.round(v))<0.05?v.toFixed(0):v.toFixed(1))+'%';}
function mname(m){return names[m]||m;}
var LABEL={pending:'pending',queued:'queued',running:'running',verifying:'verifying',done:'done',failed:'failed',skipped:'skipped'};
var GLYPH={pending:'○',queued:'○',running:'',verifying:'◎',done:'✓',failed:'✕',skipped:'–'};
function q(sel){return document.querySelectorAll(sel);}
function setText(sel,t){q(sel).forEach(function(e){e.textContent=t;});}
function setStatus(id,st){
  q('[data-st="'+id+'"]').forEach(function(e){
    e.setAttribute('data-status',st);
    var g=e.querySelector('.glyph'),l=e.querySelector('.stl');
    if(g)g.textContent=GLYPH[st]||'';if(l)l.textContent=LABEL[st]||st;
  });
}
function kv(k,t){setText('[data-k="'+k+'"]',t);}
function setTotals(t){
  kv('spent',usd(t.spent_usd));
  kv('projected',usd(t.projected_total_usd));
  kv('psave',t.projected_savings_pct.toFixed(1)+'%');
  var total=t.done+t.failed+t.running+t.pending+t.skipped;
  kv('done',(t.done+t.failed+t.skipped)+' / '+total);
  if(t.budget_usd){setBudget(t.spent_usd,t.budget_usd);}
}
function setBudget(spent,b){
  var box=document.getElementById('budget');box.hidden=false;
  var f=document.getElementById('budgetfill');f.style.width=Math.min(100,spent/b*100)+'%';
  f.className='bfill'+(spent>b?' over':'');
  document.getElementById('budgetlabel').textContent='Budget: '+usd(spent)+' of '+usd(b)+' ('+Math.round(spent/b*100)+'%)';
}
var actual={},attempts={};
function showCost(id){
  var r=routes[id];setText('[data-act="'+id+'"]','actual '+usd(actual[id]||0)+' / est '+usd(r?r.cost.expected:0));
}
var pend={},raf=0;
function flush(){
  raf=0;
  Object.keys(pend).forEach(function(id){
    var e=pend[id];
    setText('[data-tok="'+id+'"]',e.output_tokens+' output tokens');
    setText('[data-tail="'+id+'"]',e.tail);
  });
  pend={};
}
var log=document.getElementById('log');
function addLog(e,text){
  var li=document.createElement('li'),t=document.createElement('span');
  t.className='t';t.textContent=(e.at||'').slice(11,19);
  li.appendChild(t);li.appendChild(document.createTextNode(text));
  log.insertBefore(li,log.firstChild);
  while(log.children.length>50)log.removeChild(log.lastChild);
}
function finalize(id,s){
  var r=routes[id];
  actual[id]=s.cost_usd;showCost(id);
  setText('[data-att="'+id+'"]',s.attempts.length+' attempt'+(s.attempts.length===1?'':'s'));
  setText('[data-fin="'+id+'"]',(s.final_model&&r&&s.final_model!==r.model)?'escalated → '+mname(s.final_model):'');
  setText('[data-cur="'+id+'"]','');setText('[data-tail="'+id+'"]','');
}
function handle(e){
  var id=e.id;
  switch(e.type){
  case 'run.started':
    document.getElementById('runstatus').textContent=e.dry_run?'dry run':'running';
    if(e.budget_usd)setBudget(0,e.budget_usd);
    addLog(e,'run started (concurrency '+e.concurrency+')');break;
  case 'subsection.queued':setStatus(id,'queued');addLog(e,id+' queued');break;
  case 'subsection.started':
    setStatus(id,'running');
    setText('[data-cur="'+id+'"]','attempt '+e.attempt+' on '+mname(e.model)+' @ '+e.effort);
    addLog(e,id+' started attempt '+e.attempt+' ('+mname(e.model)+' @ '+e.effort+')');break;
  case 'subsection.progress':pend[id]=e;if(!raf)raf=requestAnimationFrame(flush);break;
  case 'subsection.attempt_finished':
    actual[id]=(actual[id]||0)+e.record.cost_usd;showCost(id);
    addLog(e,id+' attempt '+e.record.attempt+' '+e.record.status+' ('+usd(e.record.cost_usd)+')');break;
  case 'subsection.verifying':setStatus(id,'verifying');addLog(e,id+' verifying with '+mname(e.judge_model));break;
  case 'subsection.escalated':
    setText('[data-cur="'+id+'"]','escalated → '+mname(e.to.model)+' @ '+e.to.effort);
    addLog(e,id+' escalated to '+mname(e.to.model)+' @ '+e.to.effort+': '+e.reason);break;
  case 'subsection.completed':setStatus(id,'done');finalize(id,e.state);addLog(e,id+' done ('+usd(e.state.cost_usd)+')');break;
  case 'subsection.failed':setStatus(id,'failed');finalize(id,e.state);addLog(e,id+' failed: '+e.reason);break;
  case 'subsection.skipped':setStatus(id,'skipped');addLog(e,id+' skipped: '+e.reason);break;
  case 'metrics':setTotals(e.totals);break;
  case 'warning':addLog(e,'warning'+(id?' ['+id+']':'')+': '+e.message);break;
  case 'run.finished':
    var s=e.summary;
    s.states.forEach(function(st){setStatus(st.id,st.status);finalize(st.id,st);});
    setTotals(s.totals);
    document.getElementById('runstatus').textContent='finished: '+s.status+' · spent '+usd(s.totals.spent_usd)+' of '+usd(s.totals.est_total_usd)+' estimated · '+s.totals.escalations+' escalations';
    addLog(e,'run finished: '+s.status);
    finished=true;if(es)es.close();banner.hidden=true;break;
  }
}
var finished=false;
var banner=document.getElementById('conn');
var es=new EventSource(D.live.eventsUrl);
es.onopen=function(){banner.hidden=true;};
es.onerror=function(){if(!finished)banner.hidden=false;};
es.onmessage=function(m){try{handle(JSON.parse(m.data));}catch(err){}};
})();
`;

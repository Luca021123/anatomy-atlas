/**
 * mopt - the model-optimizer command line.
 *
 *   plan    decompose any input and route every subsection to a model
 *   route   route an existing decomposition (no API calls)
 *   run     execute a routed plan with live feedback, verification and escalation
 *   report  render a saved plan or run (table, markdown, html, json, dispatch)
 *   log     record an outcome by hand (e.g. from a Claude Code subagent)
 *   stats   show what the outcome ledger has learned
 *   models  show the catalog: prices, limits and capability priors
 *   schema  print the decomposition JSON Schema
 *   rubric  print the scoring rubric
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { z } from "zod";
import { Catalog, defaultCatalog } from "./catalog.ts";
import { EventBus } from "./events.ts";
import { runPlan } from "./executor/run.ts";
import { duration, pct, usd } from "./format.ts";
import { DEFAULT_LEDGER_PATH, Ledger } from "./ledger.ts";
import { AnthropicClient, describeError, isAuthError, isSdkMissing } from "./llm.ts";
import { planHeuristically } from "./planner/heuristic.ts";
import { planWithLlm } from "./planner/llm.ts";
import { renderDispatch } from "./render/dispatch.ts";
import { renderHtml } from "./render/html.ts";
import { renderPlanMarkdown, renderRunMarkdown } from "./render/markdown.ts";
import { createLiveView, renderModels, renderPlan, renderRunSummary, renderStats, termOptionsFromEnv } from "./render/terminal.ts";
import { DEFAULT_ROUTER_OPTIONS, emptyCalibration, PlanError, routePlan } from "./router.ts";
import { rubricMarkdown } from "./rubric.ts";
import { successProbability } from "./scoring.ts";
import { startDashboard } from "./server.ts";
import {
  type Config,
  type Decomposition,
  DecompositionSchema,
  type Effort,
  EFFORTS,
  QUALITY_PRESETS,
  type QualityPreset,
  type RoutedPlan,
  type RouterOptions,
  type RunSummary,
} from "./types.ts";

const VERSION = "0.2.0";

class UsageError extends Error {}

const HELP: Record<string, string> = {
  main: `mopt ${VERSION} - break any task, project or plan into subsections and run each on the right Claude model

Usage: mopt <command> [options]

Commands:
  plan <file | - | "text">   Decompose the input and route every subsection (LLM planner, or --offline)
  route <decomposition.json> Route an existing decomposition without calling the API
  run <plan.json>            Execute a routed plan with live feedback, verification and escalation
  report <plan.json|run.json> Render a saved plan or run (--format table|md|html|json|dispatch)
  log                        Record an outcome by hand so the router learns from it
  stats                      Show what the outcome ledger has learned
  models                     Show the model catalog, prices and capability priors
  schema                     Print the decomposition JSON Schema (for planners outside this tool)
  rubric                     Print the scoring rubric and decomposition principles

Run "mopt help <command>" for the options of one command.`,
  plan: `Usage: mopt plan <file | - | "text"> [options]

Decomposes the input with an LLM planner (or offline heuristics), routes every
subsection, prints the plan and saves it for "mopt run".

Planner options:
  --offline                  Use the offline heuristic planner (no API call)
  --planner <model@effort>   Planner model (default opus@medium)
  --context <file>           Extra project context for the planner (repeatable)
  --title <text>             Plan title
${"{routing}"}`,
  route: `Usage: mopt route <decomposition.json | plan.json> [options]

Routes a decomposition (for example one written by Claude Code from "mopt schema")
without calling the API. Given a saved plan, re-routes its decomposition with the
current options and calibration.
${"{routing}"}`,
  run: `Usage: mopt run <plan.json> [options]

Runs the plan wave by wave. Each subsection runs on its assigned model, is checked
against its acceptance criteria, and escalates up its ladder on a detected failure.

  --dry-run                  Simulate the run from the router's estimates (no API calls, no spend)
  --speed <n>                Dry-run time compression (default 25)
  --seed <n>                 Dry-run random seed (default: random, printed so the run can be repeated)
  --budget <usd>             Stop starting new attempts once spend would exceed this
  --concurrency <n>          Parallel attempts (default from the plan, usually 4)
  --dashboard                Serve a live dashboard in the browser
  --port <n>                 Dashboard port (default 4777)
  --out-dir <dir>            Where to write attempts, artifacts and the run log (default .mopt/runs/<slug>-<time>)
  --no-fallbacks             Do not use the server-side refusal fallback
  --ledger <file>            Outcome ledger (default ${DEFAULT_LEDGER_PATH})
  --yes                      Do not ask for confirmation before spending
  --catalog <file>           Model catalog override (JSON)`,
  report: `Usage: mopt report <plan.json | run.json> [--format table|md|html|json|dispatch] [--out <file>] [--verbose]`,
  log: `Usage: mopt log --plan <plan.json> --id <subsection> --model <alias> --result pass|fail [options]

Records one attempt in the outcome ledger, for work executed outside "mopt run"
(for example by Claude Code subagents following a dispatch sheet).

  --effort <level>           Effort used (default: the plan's assigned effort)
  --rung <n>                 0 for the first attempt, 1+ for escalations (default 0)
  --total-tokens <n> --duration-ms <n>   What Claude Code reported for the subagent (calibrates agent mode)
  --input-tokens <n> --output-tokens <n> --thinking-tokens <n> --cost <usd> --latency <s>   (API attempts)
  --ledger <file>            Outcome ledger (default ${DEFAULT_LEDGER_PATH})`,
  stats: `Usage: mopt stats [--ledger <file>] [--json]`,
  models: `Usage: mopt models [--json] [--catalog <file>]`,
  schema: `Usage: mopt schema`,
  rubric: `Usage: mopt rubric`,
};

const ROUTING_HELP = `
Routing options:
  --mode <agent|api>         agent (default): Claude Code subagents on a subscription, costs as
                             API-equivalent usage; api: one Messages API call per attempt, in dollars
  --quality <max|balanced|economy>  Quality floor preset (default max: 99%, 99.5% for critical
                             or mechanically checkable work, every output verified)
  --models <list>            Allowed models, e.g. haiku,sonnet,opus (default all)
  --efforts <list>           Allowed effort levels (default all)
  --baseline <model@effort>  Reference for savings (default opus@high)
  --batch                    Use the Batch API for eligible subsections (50% off, asynchronous)
  --no-cache                 Do not assume prompt caching of the shared brief
  --max-escalations <n>      Escalation ladder length (default 2)
  --concurrency <n>          Parallel attempts, for latency estimates (default 4)
  --ledger <file>            Outcome ledger used for calibration (default ${DEFAULT_LEDGER_PATH})
  --no-calibrate             Ignore what the ledger has learned
  --catalog <file>           Model catalog override (JSON)

Output options:
  --format <table|json|md|html|dispatch>  (default table)
  --out <file>               Write the rendered output to a file
  --save <file>              Where to save the routed plan JSON (default .mopt/plans/<slug>.json)
  --no-save                  Do not save the plan
  --verbose                  Show the reasoning behind every assignment`;

const routingOptions = {
  mode: { type: "string" },
  quality: { type: "string" },
  models: { type: "string" },
  efforts: { type: "string" },
  baseline: { type: "string" },
  batch: { type: "boolean" },
  "no-cache": { type: "boolean" },
  "max-escalations": { type: "string" },
  concurrency: { type: "string" },
  ledger: { type: "string" },
  "no-calibrate": { type: "boolean" },
  catalog: { type: "string" },
  format: { type: "string" },
  out: { type: "string" },
  save: { type: "string" },
  "no-save": { type: "boolean" },
  verbose: { type: "boolean", short: "v" },
} as const satisfies NonNullable<ParseArgsConfig["options"]>;

type Values = Record<string, string | boolean | string[] | undefined>;

export async function main(argv: string[]): Promise<number> {
  process.stdout.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EPIPE") process.exit(0);
  });
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        return help(rest[0]);
      case "--version":
      case "-V":
        process.stdout.write(`${VERSION}\n`);
        return 0;
      case "plan":
        return await cmdPlan(rest);
      case "route":
        return await cmdRoute(rest);
      case "run":
        return await cmdRun(rest);
      case "report":
        return cmdReport(rest);
      case "log":
        return cmdLog(rest);
      case "stats":
        return cmdStats(rest);
      case "models":
        return cmdModels(rest);
      case "schema":
        process.stdout.write(`${JSON.stringify(z.toJSONSchema(DecompositionSchema, { io: "input" }), null, 2)}\n`);
        return 0;
      case "rubric":
        process.stdout.write(`${rubricMarkdown()}\n`);
        return 0;
      default:
        throw new UsageError(`Unknown command "${command}".`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`mopt: ${e.message}\nRun "mopt help" for usage.\n`);
      return 2;
    }
    if (e instanceof PlanError) {
      process.stderr.write(`mopt: the plan cannot be routed:\n${e.message}\n`);
      return 1;
    }
    process.stderr.write(`mopt: ${describeError(e)}\n`);
    return 1;
  }
}

function help(topic?: string): number {
  const text = topic && HELP[topic] ? HELP[topic] : HELP.main;
  process.stdout.write(`${(text ?? "").replace("{routing}", ROUTING_HELP)}\n`);
  return 0;
}

function parse(args: string[], options: NonNullable<ParseArgsConfig["options"]>) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
}

// --------------------------------------------------------------------- plan

async function cmdPlan(args: string[]): Promise<number> {
  const { values, positionals } = parse(args, {
    ...routingOptions,
    offline: { type: "boolean" },
    planner: { type: "string" },
    context: { type: "string", multiple: true },
    title: { type: "string" },
  });
  const v = values as Values;
  const catalog = loadCatalog(v);
  const input = await readInput(positionals);
  const title = typeof v.title === "string" ? v.title : undefined;
  let dec: Decomposition;
  if (v.offline) {
    dec = planHeuristically(input, title ? { title } : {});
  } else {
    const planner = catalog.parseConfig(typeof v.planner === "string" ? v.planner : "opus@medium");
    const context = ((v.context as string[] | undefined) ?? []).map((f) => readFileSync(f, "utf8"));
    const progress = progressLine(`Planning with ${catalog.label(planner)}`);
    try {
      dec = await planWithLlm(input, {
        client: await AnthropicClient.create({ fallbackModels: fallbackModels(catalog) }),
        catalog,
        planner,
        context,
        ...(title ? { title } : {}),
        onProgress: (tok, s) => progress.update(`${tok.toLocaleString("en-US")} tokens · ${s.toFixed(0)}s`),
      });
      progress.done(`planned in ${dec.source.elapsed_s ?? 0}s for ${usd(dec.source.usage?.cost_usd ?? 0)}`);
    } catch (e) {
      progress.done("failed");
      if (!isAuthError(e) && !isSdkMissing(e)) throw e;
      process.stderr.write(
        (isSdkMissing(e)
          ? "mopt: the LLM planner needs the Anthropic SDK and an API key, which this install does not have.\n"
          : "mopt: no Claude API credentials were found (set ANTHROPIC_API_KEY or run `ant auth login`).\n") +
          "      Falling back to the offline heuristic planner; its signal scores are keyword estimates.\n" +
          "      On a subscription, let Claude Code write the decomposition (the optimize skill) and use `mopt route`.\n\n",
      );
      dec = planHeuristically(input, title ? { title } : {});
    }
  }
  const plan = route(dec, v, catalog);
  return emitPlan(plan, v);
}

// -------------------------------------------------------------------- route

async function cmdRoute(args: string[]): Promise<number> {
  const { values, positionals } = parse(args, routingOptions);
  const v = values as Values;
  const catalog = loadCatalog(v);
  const raw = positionals[0] === "-" || positionals.length === 0 ? await readStdin() : readFileSync(positionals[0] as string, "utf8");
  const json = JSON.parse(raw) as Record<string, unknown>;
  const decInput = "decomposition" in json && "routes" in json ? json.decomposition : json;
  const parsed = DecompositionSchema.safeParse(decInput);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new UsageError(`The decomposition does not match the schema ("mopt schema" prints it):\n${issues.join("\n")}`);
  }
  return emitPlan(route(parsed.data, v, catalog), v);
}

function route(dec: Decomposition, v: Values, catalog: Catalog): RoutedPlan {
  const ledgerPath = typeof v.ledger === "string" ? v.ledger : DEFAULT_LEDGER_PATH;
  const calibration = v["no-calibrate"] ? emptyCalibration() : new Ledger(ledgerPath).calibration(catalog);
  return routePlan({ decomposition: dec, catalog, options: routerOptions(v, catalog), calibration });
}

function emitPlan(plan: RoutedPlan, v: Values): number {
  const format = (typeof v.format === "string" ? v.format : "table") as string;
  if (!["table", "json", "md", "html", "dispatch"].includes(format)) throw new UsageError(`Unknown --format "${format}".`);
  let savedPath: string | undefined;
  if (!v["no-save"]) {
    savedPath = typeof v.save === "string" ? v.save : join(".mopt", "plans", `${slug(plan.decomposition.title)}.json`);
    mkdirSync(dirname(savedPath), { recursive: true });
    writeFileSync(savedPath, JSON.stringify(plan, null, 2));
  }
  const term = termOptionsFromEnv(process.stdout);
  let body: string;
  switch (format) {
    case "json":
      body = JSON.stringify(plan, null, 2);
      break;
    case "md":
      body = renderPlanMarkdown(plan);
      break;
    case "dispatch":
      body = renderDispatch(plan, savedPath ? { planPath: savedPath } : {});
      break;
    case "html":
      body = renderHtml({ plan });
      break;
    default:
      body = renderPlan(plan, typeof v.out === "string" ? { ...term, color: false } : term, { verbose: v.verbose === true });
  }
  if (typeof v.out === "string" || format === "html") {
    const out = typeof v.out === "string" ? v.out : join(".mopt", "plans", `${slug(plan.decomposition.title)}.html`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, body);
    process.stdout.write(`Wrote ${format} to ${out}\n`);
  } else {
    process.stdout.write(`${body}\n`);
  }
  if (savedPath) {
    process.stderr.write(
      `\nSaved plan: ${savedPath}\nNext: mopt run ${savedPath} --dry-run   (simulate)   ·   mopt report ${savedPath} --format dispatch   (Claude Code)\n`,
    );
  }
  return 0;
}

// ---------------------------------------------------------------------- run

async function cmdRun(args: string[]): Promise<number> {
  const { values, positionals } = parse(args, {
    ...routingOptions,
    "dry-run": { type: "boolean" },
    speed: { type: "string" },
    seed: { type: "string" },
    budget: { type: "string" },
    dashboard: { type: "boolean" },
    port: { type: "string" },
    "out-dir": { type: "string" },
    "no-fallbacks": { type: "boolean" },
    yes: { type: "boolean", short: "y" },
  });
  const v = values as Values;
  const catalog = loadCatalog(v);
  if (!positionals[0]) throw new UsageError("run needs a plan file (from `mopt plan` or `mopt route`).");
  const json = JSON.parse(readFileSync(positionals[0], "utf8")) as Record<string, unknown>;
  let plan: RoutedPlan =
    "routes" in json && "metrics" in json ? (json as unknown as RoutedPlan) : route(DecompositionSchema.parse(json), { ...v, mode: "api" }, catalog);
  if (plan.options.mode !== "api") {
    // Executing on the API: re-cost the same decomposition as API calls, keeping the plan's other options.
    process.stderr.write("Re-routing this plan for API execution (it was routed for Claude Code subagents).\n");
    plan = routePlan({ decomposition: plan.decomposition, catalog, options: { ...plan.options, mode: "api" }, calibration: plan.calibration });
  }
  const dryRun = v["dry-run"] === true;
  const seed = num(v.seed, "seed") ?? Math.floor(Math.random() * 1_000_000);
  const budget = num(v.budget, "budget");
  const concurrency = num(v.concurrency, "concurrency");

  if (!dryRun) {
    const expected = plan.metrics.cost.expected_with_cache;
    const summary = `About to run "${plan.decomposition.title}": ${plan.routes.length} subsections, expected ${usd(expected)} (worst case ${usd(plan.metrics.cost.worst_case)})${budget !== undefined ? `, budget ${usd(budget)}` : ""}.`;
    if (!v.yes) {
      if (!process.stdin.isTTY) throw new UsageError(`${summary}\nThis spends real API credits. Re-run with --yes to confirm, or use --dry-run.`);
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const answer = await rl.question(`${summary}\nProceed? [y/N] `);
      rl.close();
      if (!/^y(es)?$/i.test(answer.trim())) {
        process.stderr.write("Cancelled.\n");
        return 0;
      }
    }
  }

  const outDir = typeof v["out-dir"] === "string" ? v["out-dir"] : join(".mopt", "runs", `${slug(plan.decomposition.title)}-${timestamp()}`);
  const bus = new EventBus();
  const term = termOptionsFromEnv(process.stdout);
  const live = createLiveView(process.stdout, { ...term, interactive: process.stdout.isTTY === true });
  bus.subscribe((e) => live.onEvent(e));

  let dashboard: Awaited<ReturnType<typeof startDashboard>> | undefined;
  if (v.dashboard) {
    dashboard = await startDashboard({ plan, bus, port: num(v.port, "port") ?? 4777 });
    process.stderr.write(`Live dashboard: ${dashboard.url}\n`);
  }

  const controller = new AbortController();
  let interrupts = 0;
  const onSigint = () => {
    interrupts++;
    if (interrupts > 1) process.exit(130);
    controller.abort();
  };
  process.on("SIGINT", onSigint);

  let summary: RunSummary;
  try {
    summary = await runPlan({
      plan,
      catalog,
      bus,
      outDir,
      ...(dryRun ? {} : { client: await AnthropicClient.create({ fallbackModels: fallbackModels(catalog) }) }),
      ...(concurrency !== undefined ? { concurrency } : {}),
      ...(budget !== undefined ? { budgetUsd: budget } : {}),
      dryRun,
      ...(num(v.speed, "speed") !== undefined ? { speed: num(v.speed, "speed") as number } : {}),
      seed,
      ...(dryRun ? {} : { ledger: new Ledger(typeof v.ledger === "string" ? v.ledger : DEFAULT_LEDGER_PATH) }),
      fallbacks: v["no-fallbacks"] !== true,
      signal: controller.signal,
    });
  } finally {
    live.stop();
    process.off("SIGINT", onSigint);
  }

  writeFileSync(join(outDir, "run.md"), renderRunMarkdown(summary, plan));
  writeFileSync(join(outDir, "report.html"), renderHtml({ plan, run: summary }));
  process.stdout.write(`\n${renderRunSummary(summary, plan, term)}\n`);
  process.stderr.write(`\nRun files: ${outDir} (run.json, run.md, report.html, artifacts/)\n`);
  if (dryRun) {
    const c = plan.metrics.cost;
    process.stderr.write(
      `This was a dry run (seed ${seed}; repeat it with --seed ${seed}): no API calls were made and nothing was recorded in the ledger.\n` +
        `One simulated run is one draw. Across simulated runs this plan costs ${usd(c.p50)} at the median and ${usd(c.p90)} at the 90th percentile (expected ${usd(c.expected_with_cache)}).\n`,
    );
  }

  if (dashboard) {
    if (process.stdin.isTTY) {
      process.stderr.write(`Dashboard still serving at ${dashboard.url} - press Ctrl+C to exit.\n`);
      await new Promise<void>((resolve) => process.once("SIGINT", () => resolve()));
    }
    await dashboard.close();
  }
  return summary.status === "completed" ? 0 : 3;
}

// ------------------------------------------------------------------- report

function cmdReport(args: string[]): number {
  const { values, positionals } = parse(args, {
    format: { type: "string" },
    out: { type: "string" },
    verbose: { type: "boolean", short: "v" },
  });
  const v = values as Values;
  if (!positionals[0]) throw new UsageError("report needs a plan.json or run.json file.");
  const file = positionals[0];
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const format = typeof v.format === "string" ? v.format : "table";
  const term = termOptionsFromEnv(process.stdout);
  let body: string;
  if ("states" in json && "totals" in json) {
    const summary = json as unknown as RunSummary;
    const planPath = join(dirname(file), "plan.json");
    if (!existsSync(planPath)) throw new UsageError(`Expected the run's plan at ${planPath}.`);
    const plan = JSON.parse(readFileSync(planPath, "utf8")) as RoutedPlan;
    if (format === "md") body = renderRunMarkdown(summary, plan);
    else if (format === "html") body = renderHtml({ plan, run: summary });
    else if (format === "json") body = JSON.stringify(summary, null, 2);
    else if (format === "table") body = renderRunSummary(summary, plan, typeof v.out === "string" ? { ...term, color: false } : term);
    else throw new UsageError(`--format ${format} is not available for a run (use table, md, html or json).`);
  } else if ("routes" in json && "metrics" in json) {
    const plan = json as unknown as RoutedPlan;
    if (format === "md") body = renderPlanMarkdown(plan);
    else if (format === "html") body = renderHtml({ plan });
    else if (format === "json") body = JSON.stringify(plan, null, 2);
    else if (format === "dispatch") body = renderDispatch(plan, { planPath: file });
    else if (format === "table") body = renderPlan(plan, typeof v.out === "string" ? { ...term, color: false } : term, { verbose: v.verbose === true });
    else throw new UsageError(`Unknown --format "${format}".`);
  } else {
    throw new UsageError(`${file} is neither a routed plan nor a run summary.`);
  }
  if (typeof v.out === "string") {
    mkdirSync(dirname(resolve(v.out)), { recursive: true });
    writeFileSync(v.out, body);
    process.stdout.write(`Wrote ${format} to ${v.out}\n`);
  } else {
    process.stdout.write(`${body}\n`);
  }
  return 0;
}

// ---------------------------------------------------------------------- log

function cmdLog(args: string[]): number {
  const { values } = parse(args, {
    plan: { type: "string" },
    id: { type: "string" },
    model: { type: "string" },
    effort: { type: "string" },
    result: { type: "string" },
    rung: { type: "string" },
    "input-tokens": { type: "string" },
    "output-tokens": { type: "string" },
    "thinking-tokens": { type: "string" },
    cost: { type: "string" },
    latency: { type: "string" },
    "total-tokens": { type: "string" },
    "duration-ms": { type: "string" },
    ledger: { type: "string" },
    catalog: { type: "string" },
  });
  const v = values as Values;
  const catalog = loadCatalog(v);
  for (const k of ["plan", "id", "model", "result"]) if (typeof v[k] !== "string") throw new UsageError(`log needs --${k}.`);
  if (v.result !== "pass" && v.result !== "fail") throw new UsageError("--result must be pass or fail.");
  const plan = JSON.parse(readFileSync(v.plan as string, "utf8")) as RoutedPlan;
  const routing = plan.routes.find((r) => r.id === v.id);
  const sub = plan.decomposition.subsections.find((s) => s.id === v.id);
  if (!routing || !sub) throw new UsageError(`Subsection ${String(v.id)} is not in ${String(v.plan)}.`);
  const spec = catalog.get(v.model as string);
  const effort = (typeof v.effort === "string" ? v.effort : routing.model === spec.id ? routing.effort : spec.defaultEffort) as Effort;
  if (!spec.efforts.includes(effort)) throw new UsageError(`${spec.name} does not support effort "${effort}".`);
  const ceiling = spec.ceiling[effort];
  const out = num(v["output-tokens"], "output-tokens");
  const totalTokens = num(v["total-tokens"], "total-tokens");
  const durationMs = num(v["duration-ms"], "duration-ms");
  const ledger = new Ledger(typeof v.ledger === "string" ? v.ledger : DEFAULT_LEDGER_PATH);
  ledger.append({
    v: 1,
    ts: new Date().toISOString(),
    source: "manual",
    plan: plan.decomposition.title,
    subsection: sub.id,
    category: sub.category,
    level_raw: routing.difficulty.raw,
    ceiling,
    predicted_p: Math.round(successProbability(ceiling, routing.difficulty.level) * 10_000) / 10_000,
    model: spec.id,
    effort,
    rung: num(v.rung, "rung") ?? 0,
    pass: v.result === "pass",
    ...(routing.model === spec.id && routing.effort === effort && routing.tokens.total
      ? { est: { input: routing.tokens.prefix + routing.tokens.input, output: routing.tokens.output, cost: routing.cost.first_attempt / Math.max(1, routing.repetitions), total: routing.tokens.total } }
      : {}),
    ...(out === undefined && (totalTokens !== undefined || durationMs !== undefined)
      ? {
          actual: {
            input: 0,
            output: 0,
            thinking: 0,
            cache_read: 0,
            cache_write: 0,
            cost: 0,
            latency_s: (durationMs ?? 0) / 1000,
            ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
          },
        }
      : {}),
    ...(out !== undefined
      ? {
          actual: {
            input: num(v["input-tokens"], "input-tokens") ?? 0,
            output: out,
            thinking: num(v["thinking-tokens"], "thinking-tokens") ?? 0,
            cache_read: 0,
            cache_write: 0,
            cost: num(v.cost, "cost") ?? 0,
            latency_s: num(v.latency, "latency") ?? 0,
          },
        }
      : {}),
  });
  process.stdout.write(`Recorded ${sub.id} on ${catalog.label({ model: spec.id, effort })}: ${v.result} → ${ledger.path}\n`);
  return 0;
}

// ------------------------------------------------------------ stats, models

function cmdStats(args: string[]): number {
  const { values } = parse(args, { ledger: { type: "string" }, json: { type: "boolean" }, catalog: { type: "string" } });
  const v = values as Values;
  const stats = new Ledger(typeof v.ledger === "string" ? v.ledger : DEFAULT_LEDGER_PATH).stats(loadCatalog(v));
  process.stdout.write(`${v.json ? JSON.stringify(stats, null, 2) : renderStats(stats, termOptionsFromEnv(process.stdout))}\n`);
  return 0;
}

function cmdModels(args: string[]): number {
  const { values } = parse(args, { json: { type: "boolean" }, catalog: { type: "string" } });
  const v = values as Values;
  const catalog = loadCatalog(v);
  process.stdout.write(
    `${v.json ? JSON.stringify({ pricing_as_of: catalog.pricingAsOf, models: catalog.models }, null, 2) : renderModels(catalog, termOptionsFromEnv(process.stdout))}\n`,
  );
  return 0;
}

// ------------------------------------------------------------------ helpers

function loadCatalog(v: Values): Catalog {
  return typeof v.catalog === "string" ? Catalog.fromFile(v.catalog) : defaultCatalog;
}

function fallbackModels(catalog: Catalog): Set<string> {
  return new Set(catalog.models.filter((m) => m.serverFallback).map((m) => m.id));
}

function routerOptions(v: Values, catalog: Catalog): Partial<RouterOptions> {
  const o: Partial<RouterOptions> = {};
  if (typeof v.mode === "string") {
    if (v.mode !== "agent" && v.mode !== "api") throw new UsageError("--mode must be agent or api.");
    o.mode = v.mode;
  }
  if (typeof v.quality === "string") {
    if (!(QUALITY_PRESETS as readonly string[]).includes(v.quality)) throw new UsageError(`--quality must be one of ${QUALITY_PRESETS.join(", ")}.`);
    o.quality = v.quality as QualityPreset;
  }
  if (typeof v.models === "string") o.models = list(v.models).map((m) => catalog.get(m).id);
  if (typeof v.efforts === "string") {
    const efforts = list(v.efforts);
    for (const e of efforts) if (!(EFFORTS as readonly string[]).includes(e)) throw new UsageError(`Unknown effort "${e}".`);
    o.efforts = efforts as Effort[];
  }
  if (typeof v.baseline === "string") o.baseline = catalog.parseConfig(v.baseline) satisfies Config;
  if (v.batch) o.batch = true;
  if (v["no-cache"]) o.cache = false;
  const esc = num(v["max-escalations"], "max-escalations");
  if (esc !== undefined) o.maxEscalations = Math.max(0, Math.round(esc));
  const conc = num(v.concurrency, "concurrency");
  if (conc !== undefined) o.concurrency = Math.max(1, Math.round(conc));
  return { ...DEFAULT_ROUTER_OPTIONS, ...o };
}

function num(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (typeof value !== "string" || !Number.isFinite(n)) throw new UsageError(`--${name} must be a number.`);
  return n;
}

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

async function readInput(positionals: string[]): Promise<string> {
  if (positionals.length === 1 && positionals[0] === "-") return readStdin();
  if (positionals.length === 1 && existsSync(positionals[0] as string)) return readFileSync(positionals[0] as string, "utf8");
  if (positionals.length) return positionals.join(" ");
  if (!process.stdin.isTTY) return readStdin();
  throw new UsageError('plan needs input: a file, "-" for stdin, or the task in quotes.');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) throw new UsageError("stdin was empty.");
  return text;
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "plan"
  );
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/** A single status line on stderr that updates in place on a TTY. */
function progressLine(label: string): { update(text: string): void; done(text: string): void } {
  const tty = process.stderr.isTTY === true;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let last = "";
  let timer: NodeJS.Timeout | undefined;
  const draw = () => process.stderr.write(`\r\x1b[2K${frames[i++ % frames.length]} ${label}${last ? ` · ${last}` : ""}`);
  if (tty) timer = setInterval(draw, 100).unref();
  else process.stderr.write(`${label}...\n`);
  return {
    update(text) {
      last = text;
    },
    done(text) {
      if (timer) clearInterval(timer);
      process.stderr.write(tty ? `\r\x1b[2K✓ ${label} · ${text}\n` : `${label}: ${text}\n`);
    },
  };
}

export const _test = { routerOptions, slug, readInput, pct, duration };

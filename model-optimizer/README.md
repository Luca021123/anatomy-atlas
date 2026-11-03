# model-optimizer (`mopt`)

`mopt` takes any task, project or plan, breaks it into subsections, and assigns each subsection the Claude model and effort level that delivers a guaranteed quality floor at the lowest expected cost. Every subsection gets a precise brief, a verification method and an escalation ladder, and an explicit interface contract with the rest of the plan. You get the plan with its metrics before you spend anything. While the plan runs you get live feedback in the terminal or a browser dashboard, and every outcome is fed back into a ledger, so the router corrects its own assumptions over time.

On the bundled example (a seven-part clinic booking app), routing is expected to cost $0.72 against $1.63 for running everything on Claude Opus 5.5 at high effort, a 56% saving. Every subsection still meets its quality floor, which running everything on Sonnet 5.5 would not: three subsections would fall below it.

![The plan dashboard for the bundled example: key figures, model mix and the cost of the routed plan against every single-model baseline](examples/dashboard.png)

```bash
cd model-optimizer && npm install
node bin/mopt.js route examples/decomposition.json            # route a ready-made decomposition (no API calls)
node bin/mopt.js run .mopt/plans/clinic-appointment-booking-web-app-mvp.json --dry-run --dashboard   # simulate it live
```

## How it decides

The router treats model choice as a constrained optimisation, the same way a triage system matches acuity to the level of care. Each subsection is first scored on eight anchored 1-to-5 signals (`mopt rubric` prints the anchors). Six of them measure difficulty: reasoning depth, ambiguity, expertise, context breadth, output size and agentic horizon. Two measure risk: criticality (what an undetected error costs) and verifiability (how mechanically the output can be checked). The six difficulty signals combine into a required capability level, weighted 55% towards the hardest single dimension, because a task is roughly as hard as its hardest part, and 45% towards overall breadth.

Every configuration (a model at an effort level) has a capability ceiling, which is the difficulty at which its first attempt succeeds about 90% of the time. A logistic curve turns the gap between ceiling and required level into a success probability. In practice, Claude Haiku 5.5 at high effort is about 96% likely to get a routine reminder job right on the first pass, and about 40% likely to get a concurrency-safe schema design right. That difference is what moves the schema to Opus.

The choice itself has two hard constraints and one objective. The first constraint is that the probability of a correct final result, after verification and escalation, must reach the subsection's quality floor. The floor comes from the quality preset (`max` 95%, `balanced` 92%, `economy` 85%), adjusted for criticality. The second is that the first attempt must succeed at least 85% of the time under `max`, so the plan never budgets on a model that will probably fail. Among configurations that satisfy both, the router picks the lowest expected cost per completed subsection. That cost is the first attempt, plus the verification call, plus each escalation weighted by its probability, so a cheap model that needs retries is not mistaken for a cheap result. This follows Anthropic's cost guidance that spend should be measured as cost per completed task, not cost per token.

Verification depends on the risk signals. Low-stakes, easy work checks itself. Mechanically checkable work is checked with tests plus a judge. Everything else gets an independent judge model that is capable enough to evaluate the work, and criticality-5 work is flagged for human sign-off. A detected failure escalates to the cheapest configuration in a stronger tier, carrying the judge's feedback into the retry. Escalation always starts a fresh conversation, because switching models mid-conversation cold-starts the prompt cache.

Several plan-level checks keep the result honest. The router computes the cheapest single configuration that would meet every floor, and recommends that instead whenever routing saves less than 10%: one model keeps one prompt cache and a simpler workflow, and Anthropic's own measurements found that, for a single chain of work, the coordinating model alone at lower effort came out ahead of handing parts to other models. Prompt caching of the shared brief is enabled per model only where the cache write pays for itself, with a time to live (TTL) long enough to cover the idle gaps in the schedule. Work that nobody is waiting on is marked eligible for the Batch API at half price. A Monte Carlo pass over the escalation ladders reports the median and 90th-percentile cost, so you see the tail as well as the average.

## Interfaces that fit together

A plan only works if its parts connect. Every subsection declares named output artifacts and names the exact artifact and producer for each input. The graph checker rejects cycles and duplicate ids. It adds dependency edges that an input implies but the plan forgot, catches inputs that reference an artifact the producer never declares (with a "did you mean" hint), flags outputs nobody consumes, and warns when several final outputs are never assembled by an integration step. The result is scheduled into parallel waves with a critical path, so you know what can run at once and how long the whole thing should take.

## Two ways to run a plan

### With the Claude API

```bash
export ANTHROPIC_API_KEY=...                                   # or: ant auth login
mopt plan brief.md --context README.md                         # LLM decomposition (Opus 5.5 @ medium) + routing
mopt run .mopt/plans/<plan>.json --dry-run --dashboard         # rehearse: no API calls, live dashboard
mopt run .mopt/plans/<plan>.json --budget 2 --dashboard        # real run, stops before exceeding $2
mopt stats                                                     # what the ledger has learned
```

The planner only judges the work. It decides what the parts are, how hard and how risky each one is, and how they connect, and it is told never to choose models. The deterministic router makes every model decision, which keeps routing auditable and lets the ledger recalibrate it. Without credentials, `mopt plan` falls back to an offline heuristic planner (`--offline` forces it), which scores signals from keywords and says so in the plan's assumptions.

`mopt run` executes wave by wave. Subsections in a wave run in parallel, up to `--concurrency`. Each request streams, carries `output_config.effort`, caches the shared brief where that pays, and opts into the server-side refusal fallback (`fallbacks: "default"`) on models that support it. Outputs are parsed into the declared artifacts. A missing artifact or a truncated response fails the attempt immediately; otherwise the judge returns a structured verdict per acceptance criterion. Accepted artifacts are inlined into downstream prompts. A failed subsection skips its dependents rather than letting them build on bad input. Credential errors stop the run at once instead of escalating, and the budget guard stops new attempts before the projected spend crosses `--budget`. Everything lands in `.mopt/runs/<plan>-<time>/`: each attempt, each verdict, the final artifacts, `events.jsonl`, `run.json`, `run.md` and a static `report.html`.

`--dry-run` simulates the run from the router's own estimates and success model, using a seeded random generator, so you can rehearse the schedule, the escalations and the live views for free. Dry runs never write to the ledger.

### With Claude Code subagents (no API key needed)

Claude Code can act as the planner and run the plan with its own subagents. Install the skill in `skill/` (instructions in the [skill section](#claude-code-skill)), or do it by hand.

```bash
mopt schema > decomposition.schema.json                        # the contract a decomposition must meet
mopt rubric                                                    # the scoring anchors
mopt route decomposition.json --format dispatch --out dispatch.md
mopt log --plan .mopt/plans/<plan>.json --id S3 --model haiku --result pass
```

The dispatch sheet tells the orchestrator which waves to launch in parallel. For each subsection it gives the exact Agent call (`model: haiku|sonnet|opus|fable`) and the full subagent prompt, which is built by the same function the API executor uses, so the two never drift. It also gives the verification method and the escalation ladder. Subagents exchange artifacts as files under `.mopt/artifacts/`. Recording each outcome with `mopt log` feeds the same ledger the API path uses.

## Real-time feedback

During a run, the terminal redraws a live block. The header shows elapsed time, spend so far, the projected total and the projected saving against the baseline. Each subsection's row shows its status, model, attempt number, token count and cost, and recent warnings appear below. The projection rescales the remaining estimate by the ratio of actual to estimated cost observed so far, so it sharpens as the run progresses. When output is piped or running in continuous integration (CI), the view switches to one line per event. `--dashboard` serves the same feed over Server-Sent Events (SSE) to a self-contained browser page, which shows key-figure tiles, a model-mix bar, a cost comparison with every baseline, the wave schedule with critical-path highlighting, per-subsection reasoning, a budget bar and an event log. The page works offline and adapts to light and dark mode.

## The feedback loop

The capability ceilings, thinking-token multipliers and throughput figures in `src/catalog.ts` are priors, not benchmarks. The outcome ledger (`.mopt/ledger.jsonl`) records every attempt's predicted and actual result, and recalibrates three things. For each category of work, it solves for the difficulty offset that makes the success curve reproduce the observed first-attempt pass rate, then shrinks that offset towards zero for small samples. For each model and effort pair, it learns the real ratio of thinking to visible output, from the API's reported thinking tokens. And it learns each model's real input-token ratio and throughput. `mopt plan`, `mopt route` and `mopt run` apply the calibration automatically (`--no-calibrate` ignores it), and `mopt stats` shows what has been learned and how far estimates were off.

## Commands

| Command | What it does |
| --- | --- |
| `mopt plan <file \| - \| "text">` | Decompose (LLM or `--offline`) and route; saves `.mopt/plans/<slug>.json` |
| `mopt route <decomposition.json>` | Route an existing decomposition, or re-route a saved plan with new options |
| `mopt run <plan.json>` | Execute with verification, escalation, budget and live feedback (`--dry-run`, `--dashboard`) |
| `mopt report <plan.json \| run.json>` | Render as `table`, `md`, `html`, `json` or `dispatch` |
| `mopt log` | Record an outcome from outside `mopt run` |
| `mopt stats` | Show the ledger's calibration |
| `mopt models` | Show prices, limits and capability priors |
| `mopt schema` / `mopt rubric` | Print the decomposition JSON Schema / the scoring rubric |

Routing options shared by `plan` and `route` include `--quality max|balanced|economy`, `--models haiku,sonnet,opus`, `--efforts`, `--baseline opus@high`, `--batch`, `--no-cache` and `--max-escalations`. `mopt help <command>` lists them all.

## Prices and models

Prices are Anthropic first-party API rates as of 2026-10-06 (`mopt models`). The defaults cover Claude Haiku 5.5 ($0.10/$0.50 per million input/output tokens up to 100K-token prompts, $0.50/$2.50 above), Sonnet 5.5 ($2/$10), Opus 5.5 ($4/$20) and Fable 5.1 ($10/$50), with their cache and batch rates. To change prices, add models or tune the priors, pass `--catalog my-catalog.json` with `{ "pricing_as_of": "...", "models": [ ... ] }`. Entries for known ids are merged over the defaults. On a Claude subscription, usage limits are not published per token, so treat the dollar figures as relative cost between models rather than as your bill.

## Claude Code skill

`skill/SKILL.md` teaches Claude Code to plan with this rubric, route with `mopt`, dispatch subagents on the assigned models and log outcomes. To install it for every project, copy the folder:

```bash
mkdir -p ~/.claude/skills/model-optimizer && cp skill/SKILL.md ~/.claude/skills/model-optimizer/SKILL.md
```

## Limits worth knowing

The routing is only as good as the signal scores and the priors. LLM scoring is usually sound, but keyword scoring in offline mode is rough, so review those plans before running them. The priors encode the tier ordering and Anthropic's published guidance, not measured pass rates on your work, which is exactly why the ledger exists: run a few small plans with `--budget` set, then check `mopt stats`. The executor's API path is covered by tests that drive it through a scripted client. Before trusting it with a large plan, rehearse with `--dry-run` and run a small real plan under a tight budget. Repeated subsections run one call per listed item; without an item list they run as a single call, and the plan warns that its estimate assumed separate calls.

## Development

The package runs directly from TypeScript on Node 22.18 or later, which strips types natively, so `node bin/mopt.js` always runs the current source in a checkout. When installed as a package, it runs the compiled `dist/`.

```bash
npm run check        # type-check + the full node:test suite
npm run build        # compile to dist/
```

The source is organised by stage. `types.ts`, `catalog.ts` and `rubric.ts` hold the data contracts, the prices and priors, and the scoring anchors. `scoring.ts`, `estimate.ts` and `router.ts` hold the difficulty, success and quality-floor model, the token and cost model, and the routing policy. `dag.ts`, `metrics.ts` and `simulate.ts` hold the contract checks and schedule, the plan metrics and baselines, and the cost distribution. `planner/` contains the LLM and offline planners. `prompts.ts` and `executor/run.ts` hold the briefs and the executor. `llm.ts` is the only module that calls the API. `ledger.ts` handles calibration, and `render/` with `server.ts` covers the terminal, Markdown, dispatch and HTML views and the live dashboard.

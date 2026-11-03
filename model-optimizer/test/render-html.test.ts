import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DecompositionSchema } from "../src/types.ts";
import type { RunSummary, SubsectionRunState } from "../src/types.ts";
import { routePlan } from "../src/router.ts";
import { renderHtml } from "../src/render/html.ts";
import { startDashboard } from "../src/server.ts";
import { EventBus, now } from "../src/events.ts";

const dec = DecompositionSchema.parse(
  JSON.parse(readFileSync(new URL("../examples/decomposition.json", import.meta.url), "utf8")),
);
const plan = routePlan({ decomposition: dec });

function embedded(html: string): any {
  const m = html.match(/<script type="application\/json" id="mopt-data">([\s\S]*?)<\/script>/);
  assert.ok(m, "embedded data block present");
  return JSON.parse(m[1]!);
}

function fakeRun(): RunSummary {
  const states: SubsectionRunState[] = plan.routes.map((r, i) => ({
    id: r.id,
    title: r.title,
    status: i === 1 ? "failed" : "done",
    attempts: [],
    artifacts: {},
    final_model: i === 2 ? "claude-opus-5-5" : r.model,
    cost_usd: 0.123456 + i,
    est_cost_usd: r.cost.expected,
  }));
  return {
    plan_title: dec.title,
    started_at: now(),
    ended_at: now(),
    status: "completed",
    out_dir: "/tmp/out",
    states,
    totals: {
      elapsed_s: 10,
      spent_usd: 7.7777,
      est_total_usd: 1.5,
      projected_total_usd: 7.7777,
      baseline_usd: 20,
      projected_savings_pct: 61,
      done: 6,
      failed: 1,
      running: 0,
      pending: 0,
      skipped: 0,
      escalations: 3,
      first_pass_successes: 4,
      tokens: { input: 1, output: 1, thinking: 0, cache_write: 0, cache_read: 0 },
    },
  };
}

test("static page has every subsection id and embeds the plan", () => {
  const html = renderHtml({ plan });
  for (const r of plan.routes) assert.ok(html.includes(`data-card="${r.id}"`), r.id);
  assert.ok(html.includes(`<title>Model Optimizer - ${dec.title}</title>`));
  assert.deepEqual(embedded(html).plan, JSON.parse(JSON.stringify(plan)));
  assert.ok(!html.includes("new EventSource"), "static page has no live client");
});

test("hostile titles cannot break out of the page", () => {
  const evil = "</script><script>alert(1)</script>";
  const bad = routePlan({
    decomposition: { ...dec, title: evil + "\u2028", subsections: dec.subsections.map((s, i) => (i === 0 ? { ...s, title: evil } : s)) },
  });
  const html = renderHtml({ plan: bad });
  assert.ok(!html.includes("<script>alert(1)"), "no raw script injection");
  assert.equal((html.match(/<script/g) ?? []).length, 2, "only the two intended script tags");
  assert.ok(!html.slice(html.indexOf('id="mopt-data"')).includes("\u2028"), "no raw U+2028 in script data");
  assert.equal(embedded(html).plan.decomposition.title, evil + "\u2028");
  assert.ok(html.includes("&lt;/script&gt;"));
});

test("page has no external resources", () => {
  for (const html of [renderHtml({ plan }), renderHtml({ plan, live: { eventsUrl: "/events" } })]) {
    assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
    assert.doesNotMatch(html, /url\(\s*["']?https?:/i);
    assert.doesNotMatch(html, /@import/i);
  }
});

test("run mode renders actual costs, status and escalation", () => {
  const html = renderHtml({ plan, run: fakeRun() });
  assert.ok(html.includes("actual $0.123"));
  assert.ok(html.includes("actual $1.12"));
  assert.ok(html.includes("failed"));
  assert.ok(html.includes("escalated → Claude Opus 5.5") || html.includes("escalated → "));
  assert.ok(html.includes("Spent vs estimated"));
  assert.ok(html.includes("$7.78"));
});

test("live mode includes the event client", () => {
  const html = renderHtml({ plan, live: { eventsUrl: "/events" } });
  assert.ok(html.includes("new EventSource(D.live.eventsUrl)"));
  assert.ok(html.includes("requestAnimationFrame"));
  assert.ok(html.includes("Connection lost, retrying"));
  assert.ok(!/innerHTML/.test(html));
});

test("server serves /, /plan.json, 404 and streams /events", async () => {
  const bus = new EventBus();
  bus.emit({ type: "subsection.queued", at: now(), id: "S1" });
  const srv = await startDashboard({ plan, bus, port: 0 });
  try {
    assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const root = await fetch(srv.url);
    assert.equal(root.status, 200);
    assert.equal(root.headers.get("content-type"), "text/html; charset=utf-8");
    assert.ok((await root.text()).includes('"eventsUrl":"/events"'));

    const pj = await fetch(new URL("plan.json", srv.url));
    assert.deepEqual(await pj.json(), JSON.parse(JSON.stringify(plan)));

    const nf = await fetch(new URL("nope", srv.url));
    assert.equal(nf.status, 404);
    await nf.text();

    const ac = new AbortController();
    const res = await fetch(new URL("events", srv.url), { signal: ac.signal });
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const reader = res.body!.getReader();
    const dec8 = new TextDecoder();
    let buf = "";
    let emitted = false;
    while (!(buf.includes('"id":"S1"') && buf.includes('"id":"S2"'))) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec8.decode(value, { stream: true });
      if (!emitted && buf.includes('"id":"S1"')) {
        emitted = true;
        bus.emit({ type: "subsection.queued", at: now(), id: "S2" });
      }
    }
    assert.ok(buf.includes('data: {"type":"subsection.queued"'));
    assert.ok(buf.indexOf('"id":"S1"') < buf.indexOf('"id":"S2"'));
    ac.abort();
    await reader.cancel().catch(() => {});
  } finally {
    await srv.close();
  }
});

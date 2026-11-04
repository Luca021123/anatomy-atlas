---
name: optimize
description: Break a multi-part task, project or plan into subsections and run each one as a Claude Code subagent on the right model (haiku, sonnet, opus or fable) and effort, with every output independently verified to a 99%+ quality floor at the lowest usage. Use when a task has several distinct parts, when choosing which model a subagent should use, when the user wants to save usage without losing quality, or says "optimize", "route this", "which model for each part", "mopt" or "break this down and dispatch it". Do not use for a single small task one response can do well.
argument-hint: "<task, plan or path to a plan file>"
---

# Optimize: plan, route, dispatch, verify, learn

The quality bar is a verified 99% chance that each subsection is correct, and 99.5% for critical or mechanically checkable work. No subsection is ever accepted with a known failure, and nothing downstream builds on unverified work. Within that bar, every subsection runs on the cheapest model and effort that clears it.

The work is split three ways:
- **You** judge the work: what the parts are, how hard and how risky each one is, and how they connect.
- **`mopt`** makes the model, effort, verification and escalation decisions, with explicit cost and quality metrics.
- **Subagents** do the work, and reviewer subagents check it.

`mopt` is on your PATH while this plugin is enabled. Check with `mopt --version`.

The task to optimize is: $ARGUMENTS

## 1. Decompose

Run `mopt rubric` and follow its anchors and principles exactly. Run `mopt schema` for the JSON contract. Then write `.mopt/decomposition.json`:

- **Size:** size the plan to the task. A small task can be one subsection, and splitting adds overhead. Isolate the hard core so routine work around it can go to cheaper models.
- **Interfaces:** give every input the exact artifact name and the producing subsection id, or `"project"` for existing material. Name and format every output.
- **Checkable criteria:** write acceptance criteria that someone who has not seen this conversation could check. Make them mechanically checkable wherever possible (tests pass, schema validates, exact values), because checkable work is what can be pushed towards 100%.
- **Scoring:** score the eight signals honestly. Put context every part needs into `shared_context`.
- **Integration:** end with an integration subsection when there are several final outputs.
- **No model choices:** do not choose models in the decomposition.

## 2. Route

```bash
mopt route .mopt/decomposition.json --format dispatch --out .mopt/dispatch.md
```

Read the summary it prints to stderr and the top of `.mopt/dispatch.md`:

- **Below its floor:** split the subsection further, sharpen its criteria, re-route, and plan human review if it still falls short.
- **Single model recommended:** routing saves under 10%, so use that model for everything.

## 3. Dispatch

Follow `.mopt/dispatch.md` wave by wave:

- **Parallel launch:** within a wave, launch every subagent in ONE message, with one Agent tool call per subsection. Wait for the whole wave before starting the next.
- **Model and effort:** this skill explicitly asks you to pass both the `model` AND the `effort` given for each subsection on its Agent call.
- **Agent type:** use `subagent_type` `mopt-worker` (shown as `model-optimizer:mopt-worker`). Fall back to `general-purpose` if it is unavailable; the prompts are self-contained.
- **Artifacts:** subagents exchange artifacts through `.mopt/artifacts/<name>.md`. Make sure each upstream artifact exists and passed review before its consumer starts.
- **Never downgrade:** never run a subsection on a weaker model or a lower effort than assigned.

## 4. Verify, and escalate on any failure

A subsection is done only when every check named on its "Verify" line passes:

- **`tests`:** run the project's mechanical checks (tests, type-check, lint, schema validation) until they pass. Then a `mopt-reviewer` subagent, on the given model and effort, must return `VERDICT: PASS`.
- **`judge`:** one `mopt-reviewer` subagent must return `VERDICT: PASS`.
- **`dual-judge`:** two `mopt-reviewer` subagents on different models must both return `VERDICT: PASS`. Run the second only after the first passes.
- **Human review required:** get the user's sign-off before dependents start.

Use the review prompt from the dispatch sheet. Do not substitute your own impression for a reviewer.

On any failure, re-dispatch the same prompt with a `## Feedback on a previous attempt` section that quotes exactly what failed. Run it on the next model in that subsection's escalation ladder, then verify again. If the ladder is exhausted, stop that branch, tell the user what failed and why, and do not start its dependents.

## 5. Record every attempt

Claude Code reports each subagent's total tokens and duration when it finishes. Log every attempt with them, so routing and usage estimates calibrate to your real work:

```bash
mopt log --plan .mopt/plans/<plan>.json --id S3 --model haiku --effort high --result pass --total-tokens 41200 --duration-ms 38000
```

`mopt stats` shows what has been learned: pass rates by category, and how far estimates were off.

## 6. Report

Lead with the outcome. Say which subsections passed, on which models, and with how many escalations. Name anything that needs the user's sign-off or failed, and where the artifacts are.

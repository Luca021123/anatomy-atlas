---
name: model-optimizer
description: Break a multi-part task, project or plan into subsections and run each one on the right Claude model (haiku, sonnet, opus or fable) at the lowest expected cost that still meets a quality floor, with verification, escalation and outcome logging. Use when a task has several distinct parts, when deciding which model a subagent should use, when the user asks to save usage or credits without losing quality, or when they say "optimise models", "route this", "which model for each part", "mopt", or "break this down and dispatch it". Do not use for a single small task that one response can do well.
---

# Model optimizer

You plan, `mopt` routes, subagents execute. You supply the judgment about the work (what the parts are, how hard and how risky each one is, and how they connect). The `mopt` CLI turns that into model, effort, verification and escalation decisions with explicit cost and quality metrics. Then you dispatch each part to a subagent on its assigned model and record what happened, so the router keeps learning.

Check the tool is available: `mopt --version`, or `node <path-to>/model-optimizer/bin/mopt.js --version`. If it is not installed, use the manual fallback at the end of this file.

## 1. Decompose

Run `mopt rubric` and follow its anchors and principles exactly. Run `mopt schema` for the JSON contract. Then write `decomposition.json`:

- Size the plan to the task. A small task can be one subsection, and splitting adds overhead. Isolate the hard core so routine work around it can go to cheaper models.
- Give every input the exact artifact name and the producing subsection id, or `"project"` for existing material. Give every output a name and a format.
- Write acceptance criteria that someone who has not seen this conversation could check.
- Score the eight signals honestly. Inflated scores waste money; deflated scores waste rework. Put context that every part needs into `shared_context`.
- End with an integration subsection when there are several final outputs.
- Do not choose models in the decomposition. Routing is `mopt`'s job.

## 2. Route

```bash
mopt route decomposition.json --format dispatch --out .mopt/dispatch.md
```

Read the plan summary it prints, and act on two things before dispatching:

- If it recommends a single configuration (routing saves under 10%), run everything on that model instead.
- If any subsection is below its quality floor, split it further or plan human review.

For a stricter or cheaper plan, re-run with `--quality max|balanced|economy`. To exclude a model, use `--models haiku,sonnet,opus`.

## 3. Dispatch

Follow `.mopt/dispatch.md` wave by wave:

- Within a wave, launch every subagent in ONE message, with one Agent tool call per subsection. Use the `model` and prompt given for that subsection.
- Wait for the whole wave to finish before starting the next.
- Subagents exchange artifacts through `.mopt/artifacts/<name>.md`. Make sure each upstream artifact exists before its consumer starts.
- Never run a subsection on a weaker model than assigned. Get a human sign-off on anything flagged for human review before its dependents start.

## 4. Verify and escalate

Check each subsection's artifacts against its acceptance criteria, using the method in the sheet:

- `tests`: run the project's tests, type-check or schema validation, then check the criteria.
- `judge`: check each criterion yourself, or with a reviewer subagent on the judge model.
- `self-check`: trust the subagent's own PASS lines unless something looks wrong.

On a failure, re-dispatch the same prompt with a "Feedback on a previous attempt" section listing exactly what failed. Run it on the next model in that subsection's escalation ladder.

## 5. Record outcomes

After every attempt, log it so future routing is calibrated to real results:

```bash
mopt log --plan .mopt/plans/<plan>.json --id S3 --model haiku --effort high --result pass
```

`mopt stats` shows what has been learned.

## Manual fallback (no `mopt`)

Apply the same policy by hand:

1. Rate each part's difficulty from 1 to 5, as roughly its hardest dimension: reasoning, ambiguity, expertise, or horizon.
2. Choose the model by difficulty:
   - About 1 to 2.4: `haiku` (mechanical or routine).
   - About 2.4 to 3.5: `sonnet` (substantive, well specified).
   - About 3.5 to 4.4: `opus` (hard, ambiguous, expert, cross-cutting).
   - Above that, or criticality 5 with poor verifiability: `fable`.
3. Move up one model when the part is critical (errors propagate, or touch users, money, security or health) and hard to check. Move down one when mechanical checks (tests, schemas) will catch failures cheaply.
4. Check every output against its criteria, and escalate one model up on failure.
5. If every part would land on the same model anyway, just use that model for everything.

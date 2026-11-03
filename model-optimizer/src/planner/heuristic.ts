/**
 * Offline heuristic planner.
 *
 * Splits free text (markdown plan, numbered list, bullets, prose) into
 * subsections and scores each one with keyword rules that follow the anchors in
 * rubric.ts. Deterministic: no randomness, no clock, no network.
 */
import { DecompositionSchema } from "../types.ts";
import type { Category, Decomposition, Signals } from "../types.ts";

export interface HeuristicOptions {
  title?: string;
}

const MAX_SUBSECTIONS = 25;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type ItemKind = "num" | "bullet" | "heading" | "prose";

interface RawItem {
  title: string;
  text: string;
  kind: ItemKind;
  /** Original list/heading numbers (for "step N" references). */
  nums: number[];
}

interface Line {
  kind: "heading" | "list" | "text" | "blank";
  indent: number;
  level: number;
  numbered: boolean;
  num: number;
  text: string;
}

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RULE_RE = /^\s*([-*_=])(?:\s*\1){2,}\s*$/;

function stripMd(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^>\s?/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCheckbox(s: string): string {
  return s.replace(/^\[[ xX]\]\s*/, "");
}

function tokenize(text: string): Line[] {
  const out: Line[] = [];
  let inFence = false;
  for (const raw of text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    const blank: Line = { kind: "blank", indent: 0, level: 0, numbered: false, num: 0, text: "" };
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (raw.trim()) out.push({ ...blank, kind: "text", indent: raw.length - raw.trimStart().length, text: raw.trim() });
      continue;
    }
    if (!raw.trim() || RULE_RE.test(raw)) {
      out.push(blank);
      continue;
    }
    const h = HEADING_RE.exec(raw);
    if (h) {
      out.push({ ...blank, kind: "heading", level: (h[1] ?? "#").length, text: stripMd(h[2] ?? "") });
      continue;
    }
    const l = LIST_RE.exec(raw);
    if (l) {
      const marker = l[2] ?? "-";
      const numbered = /\d/.test(marker);
      out.push({
        ...blank,
        kind: "list",
        indent: (l[1] ?? "").length,
        numbered,
        num: numbered ? Number.parseInt(marker, 10) : 0,
        text: stripMd(stripCheckbox(l[3] ?? "")),
      });
      continue;
    }
    out.push({ ...blank, kind: "text", indent: raw.length - raw.trimStart().length, text: stripMd(raw) });
  }
  return out;
}

function lineText(l: Line): string {
  return l.text;
}

/** Items (or prose sentences) found in a block of non-heading lines. */
function bodyItems(lines: Line[]): { preamble: string[]; items: RawItem[] } {
  const listLines = lines.filter((l) => l.kind === "list");
  if (listLines.length > 0) {
    const base = Math.min(...listLines.map((l) => l.indent));
    const preamble: string[] = [];
    const items: RawItem[] = [];
    let current: { first: Line; parts: string[] } | null = null;
    const flush = (): void => {
      if (!current) return;
      const text = current.parts.join("\n").trim();
      items.push({
        title: deriveTitle(current.first.text),
        text,
        kind: current.first.numbered ? "num" : "bullet",
        nums: current.first.numbered ? [current.first.num] : [],
      });
      current = null;
    };
    for (const l of lines) {
      if (l.kind === "blank") continue;
      if (l.kind === "list" && l.indent <= base) {
        flush();
        current = { first: l, parts: [l.text] };
      } else if (current) {
        current.parts.push(lineText(l));
      } else {
        preamble.push(lineText(l));
      }
    }
    flush();
    return { preamble, items };
  }
  return { preamble: [], items: proseItems(lines) };
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/;

const GROUP_STOP = new Set([
  "that", "this", "with", "from", "have", "will", "should", "would", "could", "also", "then", "into", "make",
  "sure", "need", "needs", "must", "they", "them", "their", "there", "these", "those", "when", "what", "which",
  "while", "about", "after", "before", "using", "used", "being", "been", "than", "very", "more", "most", "some",
  "each", "every", "please", "just", "like", "want", "wants", "only", "over", "same", "such", "does", "done",
]);

function contentWords(s: string): Set<string> {
  const words = s.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const out = new Set<string>();
  for (const w of words) {
    if (GROUP_STOP.has(w)) continue;
    out.add(w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w);
  }
  return out;
}

function proseItems(lines: Line[]): RawItem[] {
  const text = lines
    .filter((l) => l.kind !== "blank")
    .map(lineText)
    .join(" ")
    .trim();
  if (!text) return [];
  const sentences = text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  const groups: { sentences: string[]; words: Set<string> }[] = [];
  for (const s of sentences) {
    const words = contentWords(s);
    const last = groups[groups.length - 1];
    const pronoun = /^(it|this|that|they|these|those|also|and|make sure|ensure)\b/i.test(s);
    let shares = false;
    if (last) for (const w of words) if (last.words.has(w)) shares = true;
    if (last && (shares || pronoun)) {
      last.sentences.push(s);
      for (const w of words) last.words.add(w);
    } else {
      groups.push({ sentences: [s], words: new Set(words) });
    }
  }
  return groups.map((g) => ({
    title: deriveTitle(g.sentences[0] ?? ""),
    text: g.sentences.join(" "),
    kind: "prose" as ItemKind,
    nums: [],
  }));
}

// ---------------------------------------------------------------------------
// Titles and names
// ---------------------------------------------------------------------------

const LEAD_CONNECTORS = /^(?:and|then|also|next|finally|first(?:ly)?|second(?:ly)?|third(?:ly)?|lastly|afterwards|after that|please|so|but)\b[,:]?\s+/i;
const LEAD_NEED = /^(?:(?:we|i|you)\s+(?:need|want|should|must|have|will|would like)\s+to|(?:need|needs|want)\s+to|(?:let's|lets))\s+/i;
const LEAD_STEP = /^(?:step|task|phase|part|item)\s*\d+\s*[:.)-]\s*/i;

const VERBS = new Set([
  "implement", "build", "create", "write", "design", "add", "make", "develop", "set", "setup", "test", "review",
  "draft", "document", "research", "investigate", "compare", "extract", "parse", "convert", "translate", "classify",
  "label", "summarize", "summarise", "analyze", "analyse", "deploy", "configure", "integrate", "assemble", "combine",
  "merge", "refactor", "fix", "rename", "migrate", "update", "audit", "verify", "check", "plan", "define", "prepare",
  "run", "produce", "generate", "collect", "gather", "identify", "list", "outline", "choose", "select", "evaluate",
  "prove", "derive", "debug", "triage", "sort", "tag", "format", "reformat", "install", "launch", "ship", "publish",
]);

const NAME_STOP = new Set(["the", "a", "an", "of", "for", "to", "and", "or", "in", "on", "with", "by", "from", "all", "our", "your", "their", "its", "into", "that", "this"]);

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function deriveTitle(raw: string): string {
  let s = stripMd(raw.split("\n")[0] ?? "");
  for (let i = 0; i < 3; i++) {
    s = s.replace(LEAD_STEP, "").replace(LEAD_CONNECTORS, "").replace(LEAD_NEED, "");
  }
  s = s.replace(/^\d+[.)]\s+/, "");
  const sentence = s.split(/(?<=[.!?])\s+/)[0] ?? s;
  s = sentence.trim();
  if (s.length > 70) {
    const head = s.slice(0, 70);
    const cut = Math.max(head.lastIndexOf(","), head.lastIndexOf(";"), head.lastIndexOf(" - "), head.lastIndexOf(" — "));
    if (cut >= 25) s = head.slice(0, cut);
    else {
      const sp = head.lastIndexOf(" ");
      s = sp >= 25 ? head.slice(0, sp) : head;
    }
  }
  s = s.replace(/[\s.:;,\-—]+$/, "").trim();
  return capitalise(s) || "Complete the task";
}

function contentTitleWords(title: string): string[] {
  const words = title.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  let i = 0;
  const first = words[0];
  if (first && VERBS.has(first) && words.length > 1) i = 1;
  return words.slice(i).filter((w) => !NAME_STOP.has(w));
}

function kebabName(title: string, fallback: string): string {
  const words = contentTitleWords(title).slice(0, 4);
  return words.length ? words.join("-") : fallback;
}

// ---------------------------------------------------------------------------
// Category rules
// ---------------------------------------------------------------------------

interface Rule {
  cat: Category;
  strong: RegExp;
  weak?: RegExp;
}

// Order is the tie-break priority: more specific categories first.
const RULES: Rule[] = [
  { cat: "testing", strong: /\b(unit tests?|integration tests?|e2e|end-to-end tests?|test (?:suite|plan|cases?)|tests?|testing|specs?|coverage|fixtures?|assertions?)\b/gi },
  {
    cat: "review",
    strong: /\b(review\w*|audit\w*|critiqu\w*|proofread\w*|verif(?:y|ies|ied|ication)|sanity[- ]check|inspect\w*)\b/gi,
    weak: /\b(check\w*|assess\w*|validat\w*)\b/gi,
  },
  { cat: "extraction", strong: /\b(extract\w*|pars(?:e|es|ed|ing)|pull(?:s|ed|ing)? out|scrap(?:e|es|ed|ing)|harvest\w*)\b/gi },
  { cat: "classification", strong: /\b(classif(?:y|ies|ied|ication)|label\w*|tag(?:s|ged|ging)?|triag\w*|sort(?:s|ed|ing)?|categori[sz]\w*|bucket\w*)\b/gi },
  { cat: "summarization", strong: /\b(summari[sz]\w*|summary|summaries|tl;?dr|condens\w*|digest|recap|abridg\w*)\b/gi },
  {
    cat: "transformation",
    strong: /\b(convert\w*|re-?format\w*|translat\w*|transform\w*|normali[sz]\w*|transcod\w*)\b/gi,
    weak: /\b(format\w*|export|serialis\w*|serializ\w*)\b/gi,
  },
  {
    cat: "data_analysis",
    strong: /\b(statistic\w*|regression|correlation|forecast\w*|metrics?|kpis?|data analysis|analy[sz]e (?:the )?(?:data|results|numbers|dataset))\b/gi,
    weak: /\b(analy[sz]\w*|data|datasets?|csv|trends?|charts?|dashboards?)\b/gi,
  },
  {
    cat: "research",
    strong: /\b(research\w*|investigat\w*|compar(?:e|es|ed|ing|ison)|find(?:ing)? sources|literature|survey\w*|state of the art|benchmark\w*|explor(?:e|ing)|look into|due diligence)\b/gi,
    weak: /\b(sources?|options|alternatives|evaluat\w*|stud(?:y|ies)|market)\b/gi,
  },
  {
    cat: "ops",
    strong: /\b(deploy\w*|configur\w*|ci\/cd|ci|docker\w*|pipelines?|kubernetes|k8s|terraform|ansible|provision\w*|infrastructure|nginx|systemd|cron|github actions|makefile|bash script|shell script|scripts?|monitoring|devops)\b/gi,
  },
  { cat: "integration", strong: /\b(integrat\w*|assembl\w*|combin\w*|merg\w*|stitch\w*|consolidat\w*|glue|wire (?:up|together)|bring together)\b/gi },
  {
    cat: "reasoning",
    strong: /\b(prov(?:e|es|ed|ing)|proofs?|deriv(?:e|es|ed|ation|ing)|root[- ]causes?|debug\w*|diagnos\w*|theorem|lemma|logic\w*|reason(?:ing)? about|figure out why|work out why|puzzle)\b/gi,
  },
  {
    cat: "architecture",
    strong: /\b(design doc|design\w*|architect\w*|plan(?:s|ned|ning)?|trade-?offs?|blueprint|data models?|roadmap|strateg\w*|interfaces?)\b/gi,
  },
  {
    cat: "code_edit",
    strong: /\b(refactor\w*|fix(?:es|ed|ing)?|renam\w*|migrat\w*|patch\w*|bug ?fix\w*|update (?:the )?(?:existing )?code|upgrad\w*|modif\w*|clean ?up|deprecat\w*|rewrit\w*)\b/gi,
  },
  {
    cat: "code_generation",
    strong: /\b(implement\w*|build(?:s|ing)?|develop\w*|write (?:the |a |some |an )?(?:code|function|class|module|script|endpoint|component|api|library|parser|service|app|application)|endpoints?|functions?|components?|class(?:es)?|algorithms?|programs?|cli|librar(?:y|ies)|sdk|backend|frontend|api)\b/gi,
    weak: /\b(creat(?:e|es|ed|ing)|code|coding|app|module|service|ui)\b/gi,
  },
  {
    cat: "writing",
    strong: /\b(draft\w*|blog|essay|readme|documentation|docs?|article|newsletter|press release|copywrit\w*|proposal|memo|speech|story|poem|whitepaper|tutorial|guide|document(?:s|ed|ing)?)\b/gi,
    weak: /\b(write|writes|writing|wrote|compos\w*|report|post|email|letter|content|text)\b/gi,
  },
];

interface CategoryMatch {
  category: Category;
  keywords: string[];
}

function detectCategory(text: string): CategoryMatch {
  let best: Category = "other";
  let bestScore = 0;
  let bestKw: string[] = [];
  for (const rule of RULES) {
    const strongHits = [...text.matchAll(rule.strong)].map((m) => m[0].toLowerCase());
    const weakHits = rule.weak ? [...text.matchAll(rule.weak)].map((m) => m[0].toLowerCase()) : [];
    const score = 3 * Math.min(strongHits.length, 2) + Math.min(weakHits.length, 3);
    if (score > bestScore) {
      bestScore = score;
      best = rule.cat;
      bestKw = [...new Set([...strongHits, ...weakHits])].slice(0, 4);
    }
  }
  return { category: best, keywords: bestKw };
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

type SignalVec = [number, number, number, number, number, number, number, number];
const SIGNAL_ORDER = ["reasoning", "ambiguity", "expertise", "context", "output", "horizon", "criticality", "verifiability"] as const;

// reasoning, ambiguity, expertise, context, output, horizon, criticality, verifiability
const CATEGORY_DEFAULTS: Record<Category, SignalVec> = {
  architecture: [4, 3, 3, 3, 3, 2, 3, 2],
  reasoning: [4, 2, 3, 2, 2, 2, 3, 3],
  code_generation: [3, 2, 2, 2, 3, 3, 3, 4],
  code_edit: [3, 2, 2, 3, 2, 3, 3, 4],
  testing: [2, 2, 2, 3, 3, 2, 2, 4],
  review: [3, 3, 3, 3, 2, 2, 3, 2],
  research: [3, 3, 3, 3, 3, 3, 2, 2],
  writing: [2, 3, 2, 2, 3, 1, 2, 2],
  extraction: [1, 1, 2, 2, 2, 1, 2, 4],
  transformation: [1, 1, 1, 2, 2, 1, 2, 4],
  classification: [1, 2, 1, 1, 1, 1, 2, 4],
  summarization: [2, 2, 2, 3, 2, 1, 2, 2],
  data_analysis: [3, 3, 3, 3, 2, 3, 3, 3],
  integration: [3, 2, 2, 4, 3, 2, 3, 3],
  ops: [2, 2, 3, 2, 2, 3, 3, 3],
  other: [2, 3, 2, 2, 2, 2, 2, 2],
};

interface Modifier {
  label: string;
  re: RegExp;
  delta: Partial<Signals>;
  /** Scale the delta by the number of distinct matches, up to this cap. */
  cap?: number;
}

const MODIFIERS: Modifier[] = [
  { label: "novelty", re: /\b(novel|cutting[- ]edge|state[- ]of[- ]the[- ]art|research[- ]grade|first[- ]of[- ]its[- ]kind)\b/gi, delta: { reasoning: 1, expertise: 1, ambiguity: 1 } },
  { label: "complexity", re: /\b(complex|intricate|sophisticated|non-?trivial|tricky|subtle)\b/gi, delta: { reasoning: 1 } },
  { label: "concurrency", re: /\b(distributed|concurren\w*|race conditions?|multi-?thread\w*|consensus|deadlock\w*|lock-?free)\b/gi, delta: { reasoning: 1, expertise: 1 } },
  { label: "security", re: /\b(security|secure|vulnerab\w*|exploit\w*|threat model\w*|pen-?test\w*|authenticat\w*|authori[sz]\w*|oauth|encrypt\w*)\b/gi, delta: { reasoning: 1, expertise: 1, criticality: 1 } },
  { label: "cryptography", re: /\b(cryptograph\w*|crypto\w*|zero-knowledge|homomorphic)\b/gi, delta: { reasoning: 1, expertise: 2 } },
  { label: "proof", re: /\b(proofs?|prov(?:e|es|ing)|theorem|lemma|formal(?:ly)? verif\w*)\b/gi, delta: { reasoning: 1, expertise: 1 } },
  { label: "optimisation", re: /\b(optimi[sz]\w*|scalab\w*|high[- ]throughput|low[- ]latency|performance[- ]critical)\b/gi, delta: { reasoning: 1, expertise: 1 } },
  { label: "strategy", re: /\b(strateg\w*|trade-?offs?)\b/gi, delta: { reasoning: 1, ambiguity: 1 } },
  { label: "ambiguity", re: /\b(ambiguous|ambiguity|open-ended|unclear|brainstorm\w*|not sure|unknown)\b/gi, delta: { ambiguity: 2 } },
  { label: "vagueness", re: /\b(tbd|somehow|etc|stuff|things|whatever)\b/gi, delta: { ambiguity: 1 } },
  { label: "regulated domain", re: /\b(medical|clinical|patient\w*|legal|law|compliance|regulat\w*|financial|finance|fintech|hipaa|popia|gdpr|pci|sox|pharmac\w*|drug|dosage|diagnos\w*|tax)\b/gi, delta: { expertise: 1, criticality: 1 } },
  { label: "high stakes", re: /\b(production|payments?|billing|safety|data migration|migration of data|migrating data|customer data|financial transactions?|live system)\b/gi, delta: { criticality: 1 } },
  { label: "irreversible", re: /\b(irreversible|cannot be undone|life-?critical|safety[- ]critical)\b/gi, delta: { criticality: 2 } },
  { label: "mechanical checks", re: /\b(tests?|schema|type-?check\w*|validat\w*|exact\w*|format\w*|lint\w*|assert\w*|json|passes|compil\w*|checksum|regex)\b/gi, delta: { verifiability: 1 }, cap: 2 },
  { label: "subjective quality", re: /\b(creative|tone|persuasive|compelling|engaging|elegant|polish\w*|beautiful|brand voice|storytelling|opinion)\b/gi, delta: { verifiability: -1, ambiguity: 1 } },
  { label: "argumentation", re: /\b(argument\w*|position paper|thesis|nuanced)\b/gi, delta: { reasoning: 1 } },
  { label: "whole-project scope", re: /\b(whole (?:code ?base|project|repo\w*|system)|entire (?:code ?base|project|repo\w*|system|app\w*|document|corpus)|across all|across the (?:code ?base|project|whole)|end-to-end|cross-cutting|all modules|every module|monorepo|full[- ]stack)\b/gi, delta: { context: 2 } },
  { label: "multi-file", re: /\b(multi-?file|multiple files|several files|across files|many files)\b/gi, delta: { context: 1, output: 1 } },
  { label: "large output", re: /\b(comprehensive|detailed|thorough|in-depth|publication[- ]grade|book-length|whitepaper)\b/gi, delta: { output: 1 } },
  { label: "long horizon", re: /\b(end-to-end|multi-?step|iterat\w*|autonomous\w*|agentic|step by step|several steps)\b/gi, delta: { horizon: 1 } },
  { label: "simplicity", re: /\b(simple|trivial|straightforward|boilerplate|basic|minor|one-?liner|typo)\b/gi, delta: { reasoning: -1 } },
];

function clamp(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

interface Scored {
  category: Category;
  signals: Signals;
  rationale: string;
}

function scoreItem(text: string, forced?: Category): Scored {
  const match = forced ? { category: forced, keywords: [] as string[] } : detectCategory(text);
  const v: number[] = [...CATEGORY_DEFAULTS[match.category]];
  const fired: string[] = [];
  for (const mod of MODIFIERS) {
    const hits = [...new Set([...text.matchAll(mod.re)].map((m) => m[0].toLowerCase()))];
    if (hits.length === 0) continue;
    const scale = Math.min(mod.cap ?? 1, hits.length);
    SIGNAL_ORDER.forEach((key, i) => {
      const d = mod.delta[key];
      if (d) v[i] = (v[i] ?? 1) + d * scale;
    });
    fired.push(`${mod.label} ("${hits[0]}")`);
  }
  if (text.length > 800) {
    v[3] = (v[3] ?? 1) + 1;
    fired.push("long item text (context)");
  }
  const signals = {} as Signals;
  SIGNAL_ORDER.forEach((key, i) => {
    signals[key] = clamp(v[i] ?? 1);
  });
  const kw = match.keywords.length ? ` from keywords ${match.keywords.map((k) => `"${k}"`).join(", ")}` : " by default";
  const adj = fired.length ? `signals adjusted for ${fired.join(", ")}` : "no keyword modifiers so category defaults apply";
  return { category: match.category, signals, rationale: `Category ${match.category}${kw}; ${adj}.` };
}

// ---------------------------------------------------------------------------
// Tokens, repetitions, acceptance criteria
// ---------------------------------------------------------------------------

const TOKEN_DEFAULTS: Record<Category, [number, number]> = {
  architecture: [1200, 2000],
  reasoning: [1200, 1200],
  code_generation: [1500, 1800],
  code_edit: [1800, 900],
  testing: [1500, 1500],
  review: [2500, 800],
  research: [2000, 1500],
  writing: [800, 1500],
  extraction: [1500, 400],
  transformation: [1500, 1200],
  classification: [400, 150],
  summarization: [3000, 500],
  data_analysis: [2000, 1000],
  integration: [1500, 1500],
  ops: [800, 600],
  other: [800, 800],
};

function estimateTokens(category: Category, text: string, signals: Signals): [number, number] {
  const [inBase, outBase] = TOKEN_DEFAULTS[category];
  let inF = 1 + Math.min(0.5, text.length / 4000);
  let outF = 1 + Math.min(0.3, text.length / 8000);
  if (signals.context >= 4) inF += 0.25;
  if (signals.output >= 4) outF += 0.2;
  return [Math.round((inBase * inF) / 10) * 10, Math.max(1, Math.round((outBase * outF) / 10) * 10)];
}

const COUNT_NOUNS =
  "files?|records?|items?|documents?|docs|pages?|rows?|entries|tickets?|emails?|articles?|images?|modules?|functions?|endpoints?|cases|samples|reviews|papers|reports|comments|messages|lectures|chapters|users?|customers?|transactions?|invoices?|screens?|components?|tables?|classes|issues|prs|logs";
const COUNT_RE = new RegExp(`\\b(\\d[\\d,]*)\\s+(?:[a-z-]+\\s+){0,2}?(?:${COUNT_NOUNS})\\b`, "i");
const REP_CUE = /\b(each|every|per|for all|across all|all \d|batch|bulk|process(?:ing)?|backlog)\b/i;

/** "each of the 3 ...", "every 12 ...", "all 40 ...". */
/** Units of time, size and measure: "24 hours", "every 5 minutes", "500 words" are not repetitions. */
const MEASURE_UNITS = "(?:hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|ms|percent|tokens?|kb|mb|gb|tb|px|lines?|characters?|chars?|words?|am|pm)\\b";
const EACH_OF_RE = new RegExp(`\\b(?:each|every|all|for each)\\s+(?:of\\s+)?(?:the\\s+|these\\s+|those\\s+|our\\s+|my\\s+)?(\\d[\\d,]*)\\b(?!\\s*(?:%|${MEASURE_UNITS}))`, "i");
/** A number followed (within two words) by any plural noun, used only when a repetition cue is present. */
const NUM_PLURAL_RE = new RegExp(`\\b(\\d[\\d,]*)\\s+(?!${MEASURE_UNITS})(?:[a-z'-]+\\s+){0,2}?[a-z-]+s'?(?:\\s|$|[.,;:)])`, "i");

function detectRepetitions(text: string): number {
  const each = EACH_OF_RE.exec(text);
  if (each) {
    const n = Number.parseInt((each[1] ?? "1").replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n >= 2) return Math.min(n, 100000);
  }
  const m = COUNT_RE.exec(text) ?? (REP_CUE.test(text) ? NUM_PLURAL_RE.exec(text) : null);
  if (!m) return 1;
  const n = Number.parseInt((m[1] ?? "1").replace(/,/g, ""), 10);
  if (!Number.isFinite(n) || n < 2) return 1;
  if (REP_CUE.test(text) || n >= 50) return Math.min(n, 100000);
  return 1;
}

const BATCH_RE = /\b(batch|overnight|backlog|bulk|nightly|offline processing)\b/i;

const GOAL_CRITERIA: Record<Category, [string, string]> = {
  architecture: ["The design names the main components, their interfaces and the key trade-offs", "Each decision is justified against the stated requirements"],
  reasoning: ["Reasoning is stepwise and every step follows from the previous one", "The conclusion is stated explicitly and checked against the original problem"],
  code_generation: ["The code compiles or runs without errors and matches the described behaviour", "Public functions have clear signatures and handle invalid input"],
  code_edit: ["The change is limited to what is described and existing behaviour is preserved", "Existing tests still pass after the change"],
  testing: ["Tests cover the happy path and at least two edge cases", "The tests run and pass against the implementation"],
  review: ["Each finding points to a specific location or passage", "Each finding has a severity and a suggested fix"],
  research: ["Claims are attributed to named sources", "Open uncertainty or disagreement between sources is stated"],
  writing: ["Every point mentioned in the brief is covered", "The text is consistent in tone and free of placeholder content"],
  extraction: ["The output is valid JSON containing the described fields", "No values are invented; missing fields are null"],
  transformation: ["The output is in the requested target format", "No information from the source is lost or altered"],
  classification: ["Every item receives exactly one label from the allowed set", "Ambiguous items are flagged rather than guessed"],
  summarization: ["The summary keeps the key points and adds no new claims", "The summary is substantially shorter than the source"],
  data_analysis: ["Methods and assumptions are stated", "Every number in the conclusions is traceable to the data"],
  integration: ["All upstream outputs are included and consistent with each other", "Conflicts or gaps between the parts are listed and resolved"],
  ops: ["The configuration or script runs cleanly from a fresh environment", "Steps are documented and safe to re-run"],
  other: ["The output addresses every point in the description", "The result is complete and ready to hand to the next step"],
};

const OUTPUT_FORMAT: Record<Category, string> = {
  architecture: "markdown design doc",
  reasoning: "markdown",
  code_generation: "source code",
  code_edit: "source code",
  testing: "test code",
  review: "markdown",
  research: "markdown",
  writing: "markdown",
  extraction: "json",
  transformation: "converted text",
  classification: "json",
  summarization: "markdown",
  data_analysis: "markdown report",
  integration: "markdown",
  ops: "script or config",
  other: "markdown",
};

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

const INDEPENDENT_RE = /\b(independent(?:ly)?|in parallel|parallel(?:ly)?|separately|standalone|no dependenc\w+)\b/i;
const START_CUE_RE = /^(?:then|next|after that|afterwards|finally)\b/i;
const CUE_RE =
  /\b(after (?:that|the previous|this)|once .{1,60}?(?:is|are|has been|have been) (?:done|complete[d]?|finished|ready)|based on the (?:previous|above|earlier|prior)|using the (?:previous|above|earlier|prior|output|results?)|the previous (?:step|item|task)|depends on)\b/i;
const STEP_REF_RE = /\b(?:step|item|task|section)\s+(\d+)\b/gi;

function keyPhrase(title: string): string[] {
  const words = contentTitleWords(title).filter((w) => w.length >= 3);
  const phrase = words.slice(-2);
  if (phrase.length === 1 && (phrase[0] ?? "").length < 5) return [];
  return phrase;
}

function mentions(hay: string, phrase: string[]): boolean {
  if (phrase.length === 0) return false;
  const body = phrase.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]+");
  return new RegExp(`\\b${body}(?:s|es)?\\b`, "i").test(hay);
}

function computeDeps(items: RawItem[]): number[][] {
  const phrases = items.map((it) => keyPhrase(it.title));
  return items.map((it, i) => {
    const deps = new Set<number>();
    const independent = INDEPENDENT_RE.test(it.text);
    if (it.kind === "num" && i > 0 && !independent) deps.add(i - 1);
    if (!independent || it.kind !== "num") {
      const hay = it.text.toLowerCase();
      for (let j = 0; j < i; j++) {
        if (!independent && mentions(hay, phrases[j] ?? [])) deps.add(j);
      }
      if (i > 0 && !independent && (CUE_RE.test(it.text) || START_CUE_RE.test(it.text))) {
        const anyNamed = [...deps].length > 0;
        if (!anyNamed) deps.add(i - 1);
      }
      for (const m of it.text.matchAll(STEP_REF_RE)) {
        const n = Number.parseInt(m[1] ?? "0", 10);
        const j = items.findIndex((o, idx) => idx < i && o.nums.includes(n));
        if (j >= 0) deps.add(j);
      }
    }
    return [...deps].sort((a, b) => a - b);
  });
}

// ---------------------------------------------------------------------------
// Merging (25 cap)
// ---------------------------------------------------------------------------

function mergeItems(a: RawItem, b: RawItem): RawItem {
  return {
    title: a.title,
    text: `${a.text}\n${b.text}`,
    kind: a.kind,
    nums: [...a.nums, ...b.nums],
  };
}

function capItems(items: RawItem[], target: number): RawItem[] {
  let list = items;
  while (list.length > target) {
    const categories = list.map((it) => detectCategory(it.text).category);
    let bestIdx = -1;
    let bestLen = Infinity;
    let sameCat = false;
    for (let i = 0; i + 1 < list.length; i++) {
      const same = categories[i] === categories[i + 1];
      const len = (list[i]?.text.length ?? 0) + (list[i + 1]?.text.length ?? 0);
      if ((same && !sameCat) || (same === sameCat && len < bestLen)) {
        bestIdx = i;
        bestLen = len;
        sameCat = same;
      }
    }
    const a = list[bestIdx];
    const b = list[bestIdx + 1];
    if (!a || !b) break;
    list = [...list.slice(0, bestIdx), mergeItems(a, b), ...list.slice(bestIdx + 2)];
  }
  return list;
}

// ---------------------------------------------------------------------------
// Document structure
// ---------------------------------------------------------------------------

interface Parsed {
  headingTitle?: string;
  preamble: string[];
  items: RawItem[];
}

function parseDocument(text: string): Parsed {
  const lines = tokenize(text);
  const headings = lines.filter((l) => l.kind === "heading");
  const firstHeading = headings[0];

  if (headings.length === 0) {
    const { preamble, items } = bodyItems(lines);
    return { preamble, items };
  }

  const headingTitle = firstHeading?.text;
  const before: Line[] = [];
  let idx = 0;
  while (idx < lines.length && lines[idx]?.kind !== "heading") before.push(lines[idx++] as Line);

  if (headings.length === 1) {
    const rest = lines.slice(idx + 1);
    const { preamble, items } = bodyItems([...before, ...rest]);
    return { headingTitle, preamble, items };
  }

  const firstLevel = firstHeading?.level ?? 1;
  const others = headings.slice(1);
  const otherMin = Math.min(...others.map((h) => h.level));
  const firstIsTitle = firstLevel < otherMin;
  const sectionLevel = firstIsTitle ? otherMin : Math.min(...headings.map((h) => h.level));

  interface Section { title: string; num: number | null; body: Line[] }
  const sections: Section[] = [];
  const preLines: Line[] = [...before];
  let cur: Section | null = null;
  let seenFirst = false;
  for (let i = idx; i < lines.length; i++) {
    const l = lines[i] as Line;
    if (l.kind === "heading") {
      if (!seenFirst && firstIsTitle) {
        seenFirst = true;
        continue;
      }
      seenFirst = true;
      if (l.level <= sectionLevel) {
        const m = /^(\d+)[.)]\s+(.*)$/.exec(l.text);
        cur = { title: m ? (m[2] ?? l.text) : l.text, num: m ? Number.parseInt(m[1] ?? "0", 10) : null, body: [] };
        sections.push(cur);
      } else if (cur) {
        cur.body.push({ ...l, kind: "text", text: `${l.text}:` });
      }
      continue;
    }
    if (cur) cur.body.push(l);
    else preLines.push(l);
  }

  const usable = sections.filter((s) => s.body.some((b) => b.kind !== "blank"));
  if (usable.length === 0) {
    const { preamble, items } = bodyItems(lines.filter((l) => l.kind !== "heading"));
    return { headingTitle, preamble, items };
  }
  if (usable.length === 1) {
    const only = usable[0] as Section;
    const { preamble, items } = bodyItems(only.body);
    if (items.length > 1 || preamble.length === 0) {
      return { headingTitle, preamble: [...preLines.map(lineText), ...preamble], items };
    }
  }
  const items: RawItem[] = usable.map((s) => {
    const body = s.body
      .filter((b) => b.kind !== "blank")
      .map((b) => b.text)
      .join("\n");
    return {
      title: deriveTitle(s.title),
      text: `${s.title}\n${body}`.trim(),
      kind: s.num !== null ? ("num" as ItemKind) : ("heading" as ItemKind),
      nums: s.num !== null ? [s.num] : [],
    };
  });
  return { headingTitle, preamble: preLines.filter((l) => l.kind !== "blank").map(lineText), items };
}

/** A preamble that opens with an instruction ("Build a ...", "Write a ...") states the goal. */
const IMPERATIVE_GOAL_RE =
  /^(?:please\s+)?(?:build|create|write|design|develop|implement|make|ship|launch|produce|prepare|draft|plan|migrate|set up|deliver|analy[sz]e|research|review|translate|convert|summari[sz]e|automate|refactor|redesign|rebuild|study|learn|teach|organi[sz]e)\b/i;
const GOAL_RE = /\b(goal|objective|aim|purpose|we (?:need|want|are)|i (?:need|want)|so that|in order to|deliver|launch|ship)\b/i;

function firstSentence(s: string): string {
  return (s.split(/(?<=[.!?])\s+/)[0] ?? s).trim();
}

function shortTitle(text: string): string {
  const flat = stripMd(text.split("\n").find((l) => l.trim()) ?? text).replace(/^#+\s*/, "");
  if (flat.length <= 60) return flat || "Untitled plan";
  const head = flat.slice(0, 60);
  const sp = head.lastIndexOf(" ");
  return (sp > 20 ? head.slice(0, sp) : head).trim();
}

const VAGUE_RE = /\b(etc|tbd|somehow)\b|\?/i;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function planHeuristically(text: string, options: HeuristicOptions = {}): Decomposition {
  const source = (text ?? "").trim();
  const parsed = parseDocument(source);
  let items = parsed.items;
  if (items.length === 0) {
    const fallback = stripMd(source) || "Complete the task";
    items = [{ title: deriveTitle(fallback), text: fallback, kind: "prose", nums: [] }];
  }

  const hasIntegration = (list: RawItem[]): boolean => list.some((it) => detectCategory(it.text).category === "integration");
  if (items.length > MAX_SUBSECTIONS - 1) {
    const target = hasIntegration(items) ? MAX_SUBSECTIONS : MAX_SUBSECTIONS - 1;
    items = capItems(items, target);
  }

  const deps = computeDeps(items);
  const names = new Set<string>();
  const subs = items.map((it, i) => {
    const id = `S${i + 1}`;
    const scored = scoreItem(it.text);
    const [inTok, outTok] = estimateTokens(scored.category, it.text, scored.signals);
    let name = kebabName(it.title, `output-${id.toLowerCase()}`);
    if (names.has(name)) name = `${name}-${id.toLowerCase()}`;
    names.add(name);
    const criteria = GOAL_CRITERIA[scored.category];
    const goalCrit = `Delivers the stated outcome: ${it.title.charAt(0).toLowerCase()}${it.title.slice(1)}`;
    return {
      id,
      title: it.title,
      description: it.text,
      category: scored.category,
      signals: scored.signals,
      rationale: scored.rationale,
      depends_on: (deps[i] ?? []).map((j) => `S${j + 1}`),
      inputs: [] as { artifact: string; from: string }[],
      outputs: [{ name, description: `Output of: ${it.title}`, format: OUTPUT_FORMAT[scored.category] }],
      acceptance_criteria: [goalCrit, criteria[0], criteria[1]],
      integration_notes: "",
      est_input_tokens: inTok,
      est_output_tokens: outTok,
      repetitions: detectRepetitions(it.text),
      latency_sensitive: !BATCH_RE.test(it.text),
    };
  });

  for (const s of subs) {
    s.inputs = s.depends_on.map((d) => {
      const dep = subs.find((o) => o.id === d);
      return { artifact: dep?.outputs[0]?.name ?? "output", from: d };
    });
  }

  const needsIntegration = subs.length >= 3 && !subs.some((s) => s.category === "integration");
  if (needsIntegration) {
    const depended = new Set(subs.flatMap((s) => s.depends_on));
    const sinks = subs.filter((s) => !depended.has(s.id));
    const sumOut = sinks.reduce((a, s) => a + s.est_output_tokens, 0);
    const id = `S${subs.length + 1}`;
    subs.push({
      id,
      title: "Integrate and verify the deliverables",
      description: `Integrate and verify the deliverables: combine the outputs of ${sinks.map((s) => `${s.id} (${s.title})`).join(", ")} into one consistent final deliverable, check consistency across the parts, and resolve any gaps or conflicts.`,
      category: "integration",
      signals: { reasoning: 3, ambiguity: 2, expertise: 2, context: 4, output: 3, horizon: 2, criticality: 3, verifiability: 3 },
      rationale: "Standard integration step appended by the heuristic planner because the plan has three or more subsections and none integrates the results.",
      depends_on: sinks.map((s) => s.id),
      inputs: sinks.map((s) => ({ artifact: s.outputs[0]?.name ?? "output", from: s.id })),
      outputs: [{ name: "integrated-deliverable", description: "The assembled and verified final deliverable", format: "markdown" }],
      acceptance_criteria: [
        "Delivers the stated outcome: integrate and verify the deliverables",
        GOAL_CRITERIA.integration[0],
        GOAL_CRITERIA.integration[1],
      ],
      integration_notes: "Final deliverable",
      est_input_tokens: 0,
      est_output_tokens: Math.max(600, Math.min(8000, Math.round((0.4 * sumOut) / 10) * 10)),
      repetitions: 1,
      latency_sensitive: true,
    });
  }

  for (const s of subs) {
    if (s.integration_notes) continue;
    const consumers = subs.filter((o) => o.depends_on.includes(s.id));
    s.integration_notes =
      consumers.length === 0
        ? "Final deliverable"
        : `Consumed by ${consumers.map((c) => `${c.id} (${c.title})`).join(", ")}.`;
  }

  const openQuestions: string[] = [];
  for (const [i, it] of items.entries()) {
    if (openQuestions.length >= 3) break;
    const words = it.text.trim().split(/\s+/).length;
    if (words < 6 || VAGUE_RE.test(it.text)) {
      openQuestions.push(`S${i + 1} ("${it.title}") is vague: what exactly should it produce, and how will it be judged?`);
    }
  }

  const preambleText = parsed.preamble.join("\n").trim();
  const title = options.title?.trim() || parsed.headingTitle || shortTitle(source);
  let goal = `Complete: ${title}`;
  if (preambleText) {
    const sentence = firstSentence(preambleText.replace(/\n+/g, " "));
    if (GOAL_RE.test(sentence) || IMPERATIVE_GOAL_RE.test(sentence)) goal = sentence.replace(/^(?:goal|objective|aim|purpose)\s*[:\-]\s*/i, "");
  } else if (parsed.headingTitle && parsed.headingTitle.split(/\s+/).length >= 3 && parsed.items.length > 0 && items[0]?.kind !== "prose") {
    goal = parsed.headingTitle;
  }

  return DecompositionSchema.parse({
    version: 1,
    title,
    goal,
    shared_context: preambleText,
    assumptions: [
      "Heuristic (offline) decomposition: signals are keyword-based estimates; review them or re-run with an API key for an LLM decomposition.",
    ],
    open_questions: openQuestions,
    subsections: subs,
    source: { planner: "heuristic" },
  });
}

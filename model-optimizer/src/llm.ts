/**
 * The one place that talks to the Claude API. Everything else depends on the
 * small LlmClient interface, so the planner and executor can be tested with a
 * scripted fake and never need network access in tests.
 *
 * Request shape, per the current API:
 *  - thinking is omitted: every current model runs adaptive thinking by default,
 *    and depth is controlled with output_config.effort;
 *  - responses are always streamed (long outputs, live feedback);
 *  - the stable system prefix carries cache_control when caching pays;
 *  - models that support it get the server-side refusal fallback
 *    (`fallbacks: "default"`, beta server-side-fallback-2026-07-01).
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { SERVER_FALLBACK_BETA } from "./catalog.ts";
import type { Effort, UsageTotals } from "./types.ts";

export interface SystemBlock {
  text: string;
  /** Put a cache breakpoint after this block. */
  cache?: boolean;
  ttl?: "5m" | "1h";
}

export interface LlmRequest {
  model: string;
  effort: Effort;
  maxTokens: number;
  system: SystemBlock[];
  user: string;
  /** Opt into the server-side refusal fallback (only for models that support it). */
  fallbacks?: boolean;
  /** Visible text deltas as they stream. */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface LlmResult {
  text: string;
  stopReason: string | null;
  /** The model that produced the response (differs from the request after a fallback). */
  servedModel: string;
  usage: UsageTotals;
  latencyS: number;
}

export interface StructuredRequest<T> extends LlmRequest {
  schema: z.ZodType<T>;
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResult>;
  /** Streams a response constrained to `schema` and returns it parsed and validated. */
  structured<T>(req: StructuredRequest<T>): Promise<LlmResult & { parsed: T }>;
}

/** Thrown when the API declines a request (stop_reason "refusal"). */
export class RefusalError extends Error {
  readonly category: string | null;
  constructor(category: string | null, explanation: string | null) {
    super(`The model declined the request${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}`);
    this.name = "RefusalError";
    this.category = category;
  }
}

// The SDK is loaded only when an API client is created, so routing, dispatch and
// logging work without it. Errors are therefore recognised by status and class
// name rather than with instanceof.
const statusOf = (e: unknown): number | undefined =>
  typeof e === "object" && e !== null && typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : undefined;
const nameOf = (e: unknown): string => (e instanceof Error ? e.constructor.name || e.name : "");

/** Is an API error worth retrying (rate limit, overload, server or network error)? */
export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return status === 429 || status >= 500;
  return /APIConnection(Timeout)?Error/.test(nameOf(error));
}

/** True when the failure means no usable credentials (missing, invalid or not permitted). */
export function isAuthError(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 401 || status === 403) return true;
  if (/^(AuthenticationError|PermissionDeniedError)$/.test(nameOf(error))) return true;
  return error instanceof Error && /could not resolve authentication method|api[_ ]?key/i.test(error.message);
}

/** True when the optional Anthropic SDK is not installed (e.g. the zero-install plugin bundle). */
export function isSdkMissing(error: unknown): boolean {
  return error instanceof Error && /Cannot find (package|module) '@anthropic-ai\/sdk/.test(error.message);
}

/** Human-readable description of an API failure, most specific first. */
export function describeError(error: unknown): string {
  if (error instanceof RefusalError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  const status = statusOf(error);
  if (status === 401 || /could not resolve authentication method/i.test(message)) {
    return "Authentication failed: set ANTHROPIC_API_KEY (or log in with `ant auth login`).";
  }
  if (status === 403) return `Permission denied: ${message}`;
  if (status === 404) return `Not found (check the model id): ${message}`;
  if (status === 400) return `Bad request: ${message}`;
  if (status === 429) return "Rate limited: the request was retried and still failed; lower --concurrency or try later.";
  if (/APIConnection(Timeout)?Error/.test(nameOf(error))) return `Could not reach the API: ${message}`;
  if (status !== undefined) return `API error ${status}: ${message}`;
  if (/Cannot find (package|module) '@anthropic-ai\/sdk/.test(message)) {
    return "API mode needs the Anthropic SDK: run `npm install` in the model-optimizer folder (the plugin's routing and dispatch work without it).";
  }
  return message;
}

export interface AnthropicClientOptions {
  /** Models that accept `fallbacks: "default"`. */
  fallbackModels?: ReadonlySet<string>;
  maxRetries?: number;
}

type OutputFormatFactory = <T>(schema: z.ZodType<T>) => unknown;

export class AnthropicClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly fallbackModels: ReadonlySet<string>;
  private readonly outputFormat: OutputFormatFactory;

  private constructor(client: Anthropic, outputFormat: OutputFormatFactory, options: AnthropicClientOptions) {
    this.client = client;
    this.outputFormat = outputFormat;
    this.fallbackModels = options.fallbackModels ?? new Set();
  }

  /** Loads the SDK on first use. Credentials resolve from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile. */
  static async create(options: AnthropicClientOptions = {}): Promise<AnthropicClient> {
    const sdk = await import("@anthropic-ai/sdk");
    const helpers = await import("@anthropic-ai/sdk/helpers/beta/zod");
    const client = new sdk.default({ maxRetries: options.maxRetries ?? 4 });
    return new AnthropicClient(client, helpers.betaZodOutputFormat as unknown as OutputFormatFactory, options);
  }

  private params(req: LlmRequest) {
    const useFallback = req.fallbacks === true && this.fallbackModels.has(req.model);
    return {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system.map((b) => ({
        type: "text" as const,
        text: b.text,
        ...(b.cache ? { cache_control: { type: "ephemeral" as const, ...(b.ttl === "1h" ? { ttl: "1h" as const } : {}) } } : {}),
      })),
      messages: [{ role: "user" as const, content: req.user }],
      ...(useFallback ? { betas: [SERVER_FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const started = performance.now();
    const stream = this.client.beta.messages.stream(
      { ...this.params(req), output_config: { effort: req.effort } },
      { signal: req.signal },
    );
    if (req.onText) {
      const onText = req.onText;
      stream.on("text", (delta) => onText(delta));
    }
    const message = await stream.finalMessage();
    return toResult(message, started);
  }

  async structured<T>(req: StructuredRequest<T>): Promise<LlmResult & { parsed: T }> {
    const started = performance.now();
    const stream = this.client.beta.messages.stream(
      { ...this.params(req), output_config: { effort: req.effort, format: this.outputFormat(req.schema) as ReturnType<typeof import("@anthropic-ai/sdk/helpers/beta/zod").betaZodOutputFormat<z.ZodType<T>>> } },
      { signal: req.signal },
    );
    if (req.onText) {
      const onText = req.onText;
      stream.on("text", (delta) => onText(delta));
    }
    const message = await stream.finalMessage();
    const result = toResult(message, started);
    if (message.parsed_output === null || message.parsed_output === undefined) {
      throw new Error(`Structured output could not be parsed (stop_reason: ${message.stop_reason ?? "unknown"})`);
    }
    return { ...result, parsed: message.parsed_output as T };
  }
}

function toResult(message: Anthropic.Beta.BetaMessage, started: number): LlmResult {
  if (message.stop_reason === "refusal") {
    const details = message.stop_details;
    throw new RefusalError(details?.category ?? null, details?.explanation ?? null);
  }
  let text = "";
  for (const block of message.content) if (block.type === "text") text += block.text;
  const u = message.usage;
  return {
    text,
    stopReason: message.stop_reason,
    servedModel: message.model,
    usage: {
      input: u.input_tokens,
      output: u.output_tokens,
      thinking: u.output_tokens_details?.thinking_tokens ?? 0,
      cache_write: u.cache_creation_input_tokens ?? 0,
      cache_read: u.cache_read_input_tokens ?? 0,
    },
    latencyS: (performance.now() - started) / 1000,
  };
}

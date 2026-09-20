// src/lib/databricks/llm.ts : Databricks Foundation Model APIs through the AI SDK (spec 11.5).
import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env, requireEnv } from "@/lib/env";

/**
 * Reasoning models served by Databricks (e.g. gpt-oss) return `content` as an array of typed
 * blocks — `{type:"reasoning",summary:[{text}]}` and `{type:"text",text}` — where the OpenAI wire
 * format has a plain string. Flatten to the final text and drop the reasoning, which is a summary
 * of the model's scratchpad and must never be shown or treated as an answer.
 * Non-reasoning models (e.g. Llama 4 Maverick) already send strings, so this is a no-op for them.
 */
export function flattenContent(content: unknown): string | null {
  if (content === null || content === undefined) return null;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter(
      (block): block is { type?: string; text?: string } =>
        typeof block === "object" && block !== null,
    )
    .filter((block) => block.type !== "reasoning")
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .join("");
  return text;
}

/** Rewrite one non-streaming chat completion in place. */
function normalizeCompletion(json: unknown): unknown {
  if (typeof json !== "object" || json === null) return json;
  const body = json as {
    choices?: { message?: { content?: unknown }; delta?: { content?: unknown } }[];
  };
  for (const choice of body.choices ?? []) {
    if (choice.message && "content" in choice.message) {
      choice.message.content = flattenContent(choice.message.content);
    }
    if (choice.delta && "content" in choice.delta) {
      // A streamed reasoning delta flattens to "", which the SDK treats as an empty text chunk.
      choice.delta.content = flattenContent(choice.delta.content);
    }
  }
  return body;
}

/** Rewrite the `data:` lines of an SSE stream as they arrive, leaving framing untouched. */
function normalizeStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const rewriteLine = (line: string): string => {
    if (!line.startsWith("data:")) return line;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") return line;
    try {
      return `data: ${JSON.stringify(normalizeCompletion(JSON.parse(payload)))}`;
    } catch {
      return line; // not JSON we understand; pass it through untouched
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the trailing partial line
          controller.enqueue(encoder.encode(lines.map(rewriteLine).join("\n") + "\n"));
        }
        if (buffer) controller.enqueue(encoder.encode(rewriteLine(buffer)));
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

/** fetch middleware that normalizes provider responses before the SDK parses them. */
const normalizingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.ok || !res.body) return res;

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return new Response(normalizeStream(res.body), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }
  if (contentType.includes("application/json")) {
    const json: unknown = await res.json();
    return new Response(JSON.stringify(normalizeCompletion(json)), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }
  return res;
};

let cached: ReturnType<typeof createOpenAICompatible> | undefined;

function provider() {
  if (!cached) {
    const cfg = requireEnv(["DATABRICKS_HOST", "DATABRICKS_TOKEN"], "Databricks model serving");
    cached = createOpenAICompatible({
      name: "databricks",
      baseURL: `${cfg.DATABRICKS_HOST}/serving-endpoints`, // OpenAI-compatible base
      apiKey: cfg.DATABRICKS_TOKEN,
      supportsStructuredOutputs: true,
      fetch: normalizingFetch,
    });
  }
  return cached;
}

/** The tool-calling chat model used by the agent, resume extraction, and Event Prep. */
export function chatModel() {
  const { DATABRICKS_LLM_ENDPOINT } = requireEnv(
    ["DATABRICKS_LLM_ENDPOINT"],
    "Databricks model serving",
  );
  return provider().chatModel(DATABRICKS_LLM_ENDPOINT);
}

export function embedModel() {
  const { DATABRICKS_EMBEDDING_ENDPOINT } = requireEnv(
    ["DATABRICKS_EMBEDDING_ENDPOINT"],
    "Databricks embeddings",
  );
  return provider().textEmbeddingModel(DATABRICKS_EMBEDDING_ENDPOINT);
}

/**
 * Provider options merged verbatim into the request body by @ai-sdk/openai-compatible (the key
 * matches the provider `name` above).
 *
 * `databricks-gpt-oss-120b` is a reasoning model and defaults to a high reasoning budget: measured
 * against this workspace, the same "assess this pivot" prompt takes 4-10 s and burns 1,600-4,300
 * characters of hidden reasoning at the default, against 2.1-2.2 s and under 100 at "low" -- for
 * an answer of the same length and quality. The agent runs three of these round trips per pivot
 * question, so this is the difference between a chat that answers and a chat you wait out.
 *
 * Every hard judgement (readiness, class year, ranking, fit) is arithmetic done in TypeScript, not
 * reasoned about by the model (spec 10.7), so what is being cut here is deliberation the answer
 * never depended on.
 */
export const LOW_REASONING = { databricks: { reasoning_effort: "low" } } as const;

export const llmConfigured = () => Boolean(env.DATABRICKS_LLM_ENDPOINT);
export const embeddingsConfigured = () => Boolean(env.DATABRICKS_EMBEDDING_ENDPOINT);

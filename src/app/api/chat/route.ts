// POST /api/chat : the streaming, tool-using agent (spec F5, F6, Section 10).
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { apiError, parseBody, requireUser } from "@/lib/api";
import { careerPaths } from "@/lib/catalog";
import { chatModel, llmConfigured } from "@/lib/databricks/llm";
import { env } from "@/lib/env";
import { applyOutputGuard, rateLimit, sanitizeUserMessage } from "@/lib/agent/guard";
import { systemPrompt } from "@/lib/agent/system-prompt";
import { buildTools, type ToolContext } from "@/lib/agent/tools";
import type { DashboardSpec } from "@/lib/agent/dashboard-spec";
import { ensureChatSession, getProfile, logAgentTurn, saveChatTurn } from "@/lib/db/queries";
import { withTiming } from "@/lib/timing";

export const runtime = "nodejs";
export const maxDuration = 60;

// The spec caps tool steps at 6; the loop needs one more step to write the answer, otherwise a
// turn that uses its whole budget on tools streams an empty message (observed on every pivot run).
const MAX_TOOL_STEPS = 6;
const MAX_STEPS = MAX_TOOL_STEPS + 2;

const BodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(60),
  sessionId: z.uuid().optional(),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!llmConfigured()) {
    return apiError("not_configured", "Set DATABRICKS_LLM_ENDPOINT to use the chat (spec 11.5).");
  }

  const limit = rateLimit(auth.user.userId);
  if (!limit.ok) {
    return apiError(
      "bad_request",
      `Too many questions in a short window. Try again in ${Math.ceil(limit.retryAfterMs / 60_000)} minutes.`,
    );
  }

  const body = await parseBody(req, BodySchema);
  if (!body.ok) return body.response;

  const messages = body.data.messages as UIMessage[];
  const question = sanitizeUserMessage(lastUserText(messages));
  if (!question) return apiError("bad_request", "Ask a question first.");

  const startedAt = Date.now();
  // Independent reads (Lakebase profile, Lakebase session, Databricks catalog) -- no reason to
  // await them one at a time before the model call can even start.
  const { result: setup, serverTiming: setupTiming } = await withTiming("/api/chat:setup", () =>
    Promise.all([
      getProfile(auth.user.userId),
      ensureChatSession(auth.user.userId, body.data.sessionId),
      careerPaths(),
    ]),
  );
  const [profile, sessionId, paths] = setup;
  if (!profile) return apiError("profile_required", "Finish onboarding before using the chat.");
  const pathNames = Object.fromEntries(paths.map((p) => [p.path_id, p.path_name]));
  console.log(JSON.stringify({ route: "/api/chat", event: "setup", serverTiming: setupTiming }));

  const modelMessages = await convertToModelMessages(messages);
  const ctx: ToolContext = { profile, seenIds: new Set(), renderedTabs: [] };
  let ttfbLogged = false;

  const result = streamText({
    model: chatModel(),
    system: systemPrompt(profile, pathNames),
    messages: modelMessages,
    tools: buildTools(ctx),
    stopWhen: stepCountIs(MAX_STEPS),
    temperature: 0.3,
    maxOutputTokens: 1500,
    onError: ({ error }) => console.error("[chat] stream error", error),
    // A streaming response's headers go out before generation finishes, so this can't carry a
    // Server-Timing header the way the JSON routes do -- structured logs are the measurement here.
    // Only a text-delta is a token the student actually sees; a tool-call/step-start chunk can
    // arrive almost instantly and would understate this if counted (spec 6.4: first token < 3s).
    onChunk: ({ chunk }) => {
      if (ttfbLogged || chunk.type !== "text-delta") return;
      ttfbLogged = true;
      console.log(
        JSON.stringify({ route: "/api/chat", event: "ttfb", ms: Date.now() - startedAt }),
      );
    },
    onFinish: async ({ text, steps }) => {
      const toolCalls = steps.flatMap((step) =>
        step.toolCalls.map((call) => ({ name: call.toolName, input: call.input })),
      );
      console.log(
        JSON.stringify({
          route: "/api/chat",
          event: "total",
          ms: Date.now() - startedAt,
          steps: steps.length,
          toolCalls: toolCalls.length,
        }),
      );
      // Spec 10.8: strip any [ID] that no tool returned this turn, then persist what the student saw.
      const guarded = applyOutputGuard(text, ctx.seenIds);
      if (guarded.invalidIds.length > 0) {
        console.warn(`[chat] output guard removed unknown ids`, guarded.invalidIds);
      }

      // Three sequential writes used to hold the function open for ~200 ms after the last token
      // had already reached the student. They do not depend on each other.
      try {
        await Promise.all([
          saveChatTurn({ sessionId, question, answer: guarded.text, toolCalls }),
          logAgentTurn({
            userId: auth.user.userId,
            sessionId,
            question,
            answer: guarded.text,
            toolCalls,
            latencyMs: Date.now() - startedAt,
            model: env.DATABRICKS_LLM_ENDPOINT ?? "unknown",
          }),
        ]);
      } catch (err) {
        console.error("[chat] could not persist the turn", err);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    // The client needs the session id and any tab the agent opened, to animate it in (F6).
    messageMetadata: ({ part }) =>
      part.type === "finish"
        ? { sessionId, tabs: ctx.renderedTabs.map(tabSummary), invalidIds: [] }
        : undefined,
  });
}

const tabSummary = (spec: DashboardSpec) => ({
  tab_id: spec.tab_id,
  title: spec.title,
  source_question: spec.source_question,
});

/** The AI SDK sends UI messages with parts; the transcript stores the plain text. */
function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    return message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join(" ");
  }
  return "";
}

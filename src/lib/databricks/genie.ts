// src/lib/databricks/genie.ts : Genie Conversation API client (spec 11.10, F11).
// Response field names have moved across Databricks releases; every field is read defensively and
// the raw JSON is logged once per call so a shape change is easy to diagnose from the server log.
import "server-only";
import { dbx } from "./sql";
import { requireEnv } from "@/lib/env";
import { timed } from "@/lib/timing";

const base = () => {
  const { DATABRICKS_GENIE_SPACE_ID } = requireEnv(
    ["DATABRICKS_GENIE_SPACE_ID"],
    "Genie (spec 11.10)",
  );
  return `/api/2.0/genie/spaces/${DATABRICKS_GENIE_SPACE_ID}`;
};

interface GenieMessage {
  id?: string;
  message_id?: string;
  status?: string;
  attachments?: {
    attachment_id?: string;
    text?: { content?: string };
    query?: { query?: string; description?: string };
  }[];
}
interface GenieStart {
  conversation_id?: string;
  conversation?: { id?: string };
  message_id?: string;
  message?: { id?: string };
  id?: string;
}
interface GenieQueryResult {
  statement_response?: {
    manifest?: { schema?: { columns?: { name: string }[] } };
    result?: { data_array?: unknown[][] };
  };
}

export interface GenieAnswer {
  conversationId: string;
  text: string;
  sql: string | null;
  columns: string[];
  rows: unknown[][];
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED", "ERROR"]);

/**
 * Start or continue a conversation, poll the message until it completes (~30s max), then fetch the
 * result table for any query attachment (spec 11.10).
 */
export async function askGenie(question: string, conversationId?: string): Promise<GenieAnswer> {
  const start = await timed("genie:start", () =>
    conversationId
      ? dbx<GenieStart>(`${base()}/conversations/${conversationId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content: question }),
        })
      : dbx<GenieStart>(`${base()}/start-conversation`, {
          method: "POST",
          body: JSON.stringify({ content: question }),
        }),
  );

  const convId = start.conversation_id ?? start.conversation?.id ?? conversationId;
  const msgId = start.message_id ?? start.message?.id ?? start.id;
  if (!convId || !msgId) {
    console.error("[genie] unexpected start-conversation response shape", start);
    throw new Error("Genie did not return a conversation to poll.");
  }

  const msg = await timed("genie:poll", async () => {
    let m: GenieMessage = {};
    for (let i = 0; i < 30; i++) {
      m = await dbx<GenieMessage>(`${base()}/conversations/${convId}/messages/${msgId}`);
      if (m.status && TERMINAL_STATUSES.has(m.status)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return m;
  });
  if (msg.status !== "COMPLETED") {
    console.error("[genie] message did not complete", msg);
  }

  const text = msg.attachments?.find((a) => a.text?.content)?.text?.content ?? "";
  const qa = msg.attachments?.find((a) => a.query);

  let columns: string[] = [];
  let rows: unknown[][] = [];
  if (qa?.attachment_id) {
    try {
      const result = await timed("genie:query-result", () =>
        dbx<GenieQueryResult>(
          `${base()}/conversations/${convId}/messages/${msgId}/attachments/${qa.attachment_id}/query-result`,
        ),
      );
      columns = (result.statement_response?.manifest?.schema?.columns ?? []).map((c) => c.name);
      rows = result.statement_response?.result?.data_array ?? [];
    } catch (err) {
      console.error("[genie] query-result fetch failed", err);
    }
  }

  return { conversationId: convId, text, sql: qa?.query?.query ?? null, columns, rows };
}

export const genieConfigured = () => {
  try {
    requireEnv(["DATABRICKS_GENIE_SPACE_ID"], "Genie");
    return true;
  } catch {
    return false;
  }
};

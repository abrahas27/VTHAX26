// src/components/admin/genie-box.tsx : "Ask the data" natural-language box (spec F11, 11.10).
"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SAMPLE_QUESTIONS = [
  "Which career paths have the most students per upcoming event?",
  "What are the top 5 missing skills for students targeting investment banking?",
  "How many students are pivoting into a path outside their major, by major?",
];

interface GenieAnswer {
  conversationId: string;
  text: string;
  sql: string | null;
  columns: string[];
  rows: unknown[][];
}

export function GenieBox() {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | ({ status: "ready" } & GenieAnswer)
  >({ status: "idle" });

  const ask = async (q: string) => {
    setQuestion(q);
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/admin/genie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, conversationId }),
      });
      const body = (await res.json()) as GenieAnswer & { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Genie could not answer that.");
      setConversationId(body.conversationId);
      setState({ status: "ready", ...body });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  };

  const busy = state.status === "loading";

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim() && !busy) void ask(question.trim());
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the data... (e.g. which paths are most underserved?)"
          aria-label="Ask the data"
        />
        <Button type="submit" disabled={busy || !question.trim()}>
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-3.5" aria-hidden="true" />
          )}
          Ask
        </Button>
      </form>

      {state.status === "idle" && (
        <div className="flex flex-wrap gap-2">
          {SAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void ask(q)}
              className="border-border hover:bg-surface-2 rounded-full border px-3 py-1 text-xs transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {state.status === "error" && <p className="text-danger text-sm">{state.message}</p>}

      {state.status === "ready" && (
        <div className="space-y-3">
          {state.text && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{state.text}</p>
          )}
          {state.columns.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    {state.columns.map((c) => (
                      <th key={c} className="pr-3 pb-2 font-normal">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.slice(0, 25).map((row, i) => (
                    <tr key={i} className="border-border border-t">
                      {row.map((cell, j) => (
                        <td key={j} className="py-2 pr-3">
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!state.text && state.columns.length === 0 && (
            <p className="text-muted-foreground text-sm">No answer came back. Try rephrasing.</p>
          )}
        </div>
      )}
    </div>
  );
}

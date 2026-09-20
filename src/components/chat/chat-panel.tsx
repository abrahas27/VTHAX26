"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Plus, RotateCcw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUGGESTED_PROMPTS } from "@/lib/agent/system-prompt";

/** Friendly labels for the status chips shown while tools run (spec F5). */
const TOOL_LABELS: Record<string, string> = {
  plan_for_path: "Pulling together everything for that path",
  get_skill_gap: "Checking your skill gaps",
  build_gap_roadmap: "Building your roadmap",
  find_events: "Finding events",
  companies_visiting: "Checking who is coming to VT",
  find_opportunities: "Looking for open roles",
  find_clubs: "Finding clubs",
  list_career_paths: "Matching your goal to a path",
  get_path_outlook: "Looking up pay and outlook",
  semantic_search: "Searching by meaning",
  render_dashboard: "Opening your goal tab",
};

export interface TabSummary {
  tab_id: string;
  title: string;
  source_question: string;
}

export function ChatPanel({
  onTabsCreated,
  onItemClick,
}: {
  onTabsCreated?: (tabs: TabSummary[]) => void;
  onItemClick?: (id: string) => void;
}) {
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll follows new tokens only while the student is already at the bottom. Scrolling up
  // to re-read an earlier answer should not be yanked back down on the next chunk.
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: () => ({ sessionId }) }),
    [sessionId],
  );

  const { messages, sendMessage, status, error, setMessages, stop, regenerate } = useChat({
    transport,
    onFinish: ({ message }) => {
      // Tabs are announced mid-stream (see below); the finish metadata is the backstop for a
      // tool whose output the transport did not surface as a part.
      const meta = message.metadata as { sessionId?: string; tabs?: TabSummary[] } | undefined;
      if (meta?.sessionId) setSessionId(meta.sessionId);
      const fresh = (meta?.tabs ?? []).filter((tab) => !announced.current.has(tab.tab_id));
      if (fresh.length > 0) {
        for (const tab of fresh) announced.current.add(tab.tab_id);
        onTabsCreated?.(fresh);
      }
    },
  });

  const busy = status === "submitted" || status === "streaming";

  // The goal tab is the hero moment of the demo, and it used to wait for the whole answer to
  // finish because the tab list only travelled in the finish metadata. The tool's own output
  // arrives mid-stream, so the tab can be born while the answer is still being written (F6).
  const announced = useRef(new Set<string>());
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const opened = (last.parts as UIPart[])
      .map(tabFromPart)
      .filter((tab): tab is TabSummary => tab !== null && !announced.current.has(tab.tab_id));
    if (opened.length === 0) return;
    for (const tab of opened) announced.current.add(tab.tab_id);
    onTabsCreated?.(opened);
  }, [messages, onTabsCreated]);

  // Cmd/Ctrl+K focuses the chat from anywhere (spec F5).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  useEffect(() => {
    if (!pinnedToBottom) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pinnedToBottom]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setPinnedToBottom(true);
    void sendMessage({ text });
  };

  const ask = (text: string) => {
    setPinnedToBottom(true);
    void sendMessage({ text });
  };

  return (
    <div className="card-elevated flex h-full min-h-[420px] flex-col">
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="text-accent size-4" aria-hidden="true" />
          HokiePath AI
        </span>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setMessages([]);
              setSessionId(undefined);
            }}
          >
            <Plus className="size-3" aria-hidden="true" />
            New chat
          </Button>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-4 overflow-y-auto p-4"
        aria-live="polite"
        aria-busy={busy}
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Ask about a goal and I will rebuild your dashboard around it.
            </p>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt)}
                className="border-border hover:bg-surface-2 focus-visible:ring-ring block min-h-11 w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => (
          <Message key={message.id} message={message} onItemClick={onItemClick} />
        ))}

        {status === "submitted" && (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Thinking...
          </p>
        )}
        {error && (
          <div className="border-danger/40 space-y-2 rounded-xl border px-3 py-2">
            {/* The transport surfaces raw server text; a student gets one sentence and a button. */}
            <p className="text-danger text-xs">
              That answer did not come through. The live data may still be waking up.
            </p>
            <Button variant="secondary" size="xs" onClick={() => void regenerate()}>
              <RotateCcw className="size-3" aria-hidden="true" />
              Try again
            </Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-border border-t p-3">
        <div className="bg-surface-2 focus-within:ring-ring flex items-end gap-2 rounded-xl px-3 py-2 focus-within:ring-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Ask about your career... (Ctrl+K)"
            aria-label="Ask about your career"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent text-sm outline-none"
          />
          {busy ? (
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => void stop()}
              aria-label="Stop"
            >
              <Square className="size-3" aria-hidden="true" />
            </Button>
          ) : (
            <Button size="icon-sm" onClick={submit} disabled={!input.trim()} aria-label="Send">
              <ArrowUp className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface UIPart {
  type: string;
  text?: string;
  state?: string;
  output?: unknown;
}

/** The tab a tool opened, as soon as that tool's output lands -- not at the end of the turn. */
function tabFromPart(part: UIPart): TabSummary | null {
  if (part.state !== "output-available") return null;
  if (part.type !== "tool-plan_for_path" && part.type !== "tool-render_dashboard") return null;
  const output = part.output as
    | { tab?: { tab_id?: string; title?: string } | null; tab_id?: string; title?: string }
    | undefined;
  const tab = output?.tab ?? output;
  if (!tab || typeof tab.tab_id !== "string" || typeof tab.title !== "string") return null;
  return { tab_id: tab.tab_id, title: tab.title, source_question: "" };
}

function Message({
  message,
  onItemClick,
}: {
  message: { role: string; parts: UIPart[] };
  onItemClick?: (id: string) => void;
}) {
  if (message.role === "user") {
    return (
      <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl px-3 py-2 text-sm">
        {message.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === "text" && part.text) {
          return (
            <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
              <WithItemChips text={part.text} onItemClick={onItemClick} />
            </p>
          );
        }
        if (part.type.startsWith("tool-")) {
          const name = part.type.slice("tool-".length);
          const done = part.state === "output-available";
          return <ToolStatusChip key={i} label={TOOL_LABELS[name] ?? name} done={done} />;
        }
        return null;
      })}
    </div>
  );
}

export function ToolStatusChip({ label, done }: { label: string; done: boolean }) {
  return (
    <span className="bg-surface-2 text-muted-foreground flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs">
      {done ? (
        <span className="bg-success size-1.5 rounded-full" aria-hidden="true" />
      ) : (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      )}
      {label}
      {done ? <span className="sr-only"> (done)</span> : null}
    </span>
  );
}

const ID_PATTERN = /\[([A-Z]{2}\d{3,4})\]/g;

/** Render [EV0037] as a clickable chip that opens the item drawer (spec F5). */
function WithItemChips({
  text,
  onItemClick,
}: {
  text: string;
  onItemClick?: (id: string) => void;
}) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(ID_PATTERN)) {
    const id = match[1] as string;
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    nodes.push(
      <button
        key={`${id}-${start}`}
        type="button"
        onClick={() => onItemClick?.(id)}
        className="bg-surface-2 text-accent hover:bg-surface focus-visible:ring-ring mx-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {id}
      </button>,
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes}</>;
}

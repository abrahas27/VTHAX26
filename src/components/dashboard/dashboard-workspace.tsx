"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TabSummary } from "@/components/chat/chat-panel";
import { dashboardKey, DashboardView, fetchDashboard } from "./dashboard-view";
import { GoalTabs } from "./goal-tabs";
import { type DrawerItem } from "./item-drawer";
import { SectionRenderer } from "./section-renderer";
import { apiFetch } from "@/lib/client/api";
import type { DashboardSpec } from "@/lib/agent/dashboard-spec";
import type { DashboardPayload } from "@/lib/types";

// The chat panel pulls in the AI SDK's streaming client and the item drawer pulls in the sheet
// primitives; neither is needed to paint the dashboard, so they load after it (spec 6.4).
const ChatPanel = dynamic(() => import("@/components/chat/chat-panel").then((m) => m.ChatPanel), {
  ssr: false,
  loading: () => <div className="card-elevated h-full min-h-[420px]" aria-hidden="true" />,
});
const ItemDrawer = dynamic(() => import("./item-drawer").then((m) => m.ItemDrawer), { ssr: false });
const SearchCommand = dynamic(() => import("./search-command").then((m) => m.SearchCommand), {
  ssr: false,
  loading: () => <div className="border-border h-9 rounded-lg border" aria-hidden="true" />,
});

const fetchTabs = async (): Promise<DashboardSpec[]> => {
  const body = await apiFetch<{ tabs?: DashboardSpec[] }>("/api/tabs");
  return body.tabs ?? [];
};

/**
 * The morphing dashboard (F6): For You plus any goal tabs the agent has created. Tabs are loaded
 * from Lakebase on mount, so they survive a reload, and a newly created tab animates in.
 */
export function DashboardWorkspace({ initialTab = "for-you" }: { initialTab?: string }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(initialTab);
  const [newTabId, setNewTabId] = useState<string | null>(null);
  const [selected, setSelected] = useState<DrawerItem | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const { data: tabs = [] } = useQuery({ queryKey: ["tabs"], queryFn: fetchTabs });
  const activeSpec = tabs.find((tab) => tab.tab_id === active);

  // Readiness, gaps and the roadmap are computed server-side, never taken from the spec. The key
  // matches DashboardView's, so a hover prefetch and the tab's own render share one cache entry.
  const { data: computed } = useQuery({
    queryKey: dashboardKey(active, 60, "core"),
    queryFn: () => fetchDashboard(active, 60, "core"),
    enabled: Boolean(activeSpec),
  });

  /** Warm a goal tab while the pointer is still travelling towards it (spec 5.2). */
  const prefetchTab = useCallback(
    (tabId: string) => {
      if (tabId === active) return;
      void queryClient.prefetchQuery({
        queryKey: dashboardKey(tabId, 60, "core"),
        queryFn: () => fetchDashboard(tabId, 60, "core"),
        staleTime: 60_000,
      });
    },
    [active, queryClient],
  );

  const onTabsCreated = useCallback(
    async (created: TabSummary[]) => {
      await queryClient.invalidateQueries({ queryKey: ["tabs"] });
      const first = created[0];
      if (!first) return;
      setActive(first.tab_id);
      setNewTabId(first.tab_id);
      void queryClient.invalidateQueries({ queryKey: ["dashboard", first.tab_id] });
    },
    [queryClient],
  );

  // The glow marks the tab as new for a moment, then settles (spec 5.7).
  useEffect(() => {
    if (!newTabId) return;
    const timer = setTimeout(() => setNewTabId(null), 1500);
    return () => clearTimeout(timer);
  }, [newTabId]);

  const closeTab = useMutation({
    mutationFn: (tabId: string) =>
      apiFetch(`/api/tabs?tab=${tabId}`, { method: "DELETE" }).then(() => undefined),
    // Closing a tab should feel like closing a tab: it goes now, and comes back only if the
    // server refuses (spec 5.4).
    onMutate: async (tabId: string) => {
      await queryClient.cancelQueries({ queryKey: ["tabs"] });
      const previous = queryClient.getQueryData<DashboardSpec[]>(["tabs"]);
      queryClient.setQueryData<DashboardSpec[]>(["tabs"], (old) =>
        (old ?? []).filter((tab) => tab.tab_id !== tabId),
      );
      if (active === tabId) setActive("for-you");
      return { previous, tabId };
    },
    onError: (_err, _tabId, context) => {
      if (context?.previous) queryClient.setQueryData(["tabs"], context.previous);
      toast.error("Could not close that tab", { description: "It is back where it was." });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tabs"] }),
  });

  /** A chip in the chat ([EV0037]) opens the same drawer the cards use. */
  const openById = async (id: string) => {
    const key = id.startsWith("EV")
      ? "events"
      : id.startsWith("CL")
        ? "clubs"
        : id.startsWith("OP")
          ? "opportunities"
          : null;
    if (!key) return;
    try {
      const body = await apiFetch<Record<string, Record<string, unknown>>>("/api/items/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: [id] }),
      });
      const item = body[key]?.[id];
      if (!item) {
        toast.error("That item is no longer in the catalog.");
        return;
      }
      if (key === "events") setSelected({ kind: "event", item: item as never });
      if (key === "clubs") setSelected({ kind: "club", item: item as never });
      if (key === "opportunities") setSelected({ kind: "opportunity", item: item as never });
    } catch {
      toast.error("Could not open that item", { description: "Try again in a moment." });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <SearchCommand onOpen={setSelected} />

        {tabs.length > 0 && (
          <GoalTabs
            tabs={tabs}
            active={active}
            newTabId={newTabId}
            onSelect={setActive}
            onHover={prefetchTab}
            onClose={(tabId) => closeTab.mutate(tabId)}
          />
        )}

        {activeSpec ? (
          <SectionRenderer spec={activeSpec} computed={computed} onOpen={setSelected} />
        ) : (
          <DashboardView tab="for-you" />
        )}
      </div>

      {/* Desktop: the chat sits beside the dashboard. Below xl it becomes a bottom sheet, so the
          cards get the full width on a phone and the chat is one thumb-reach away (spec 5.5). */}
      <div className="hidden xl:sticky xl:top-6 xl:block xl:h-[calc(100vh-3rem)]">
        <ChatPanel onTabsCreated={onTabsCreated} onItemClick={openById} />
      </div>

      <Button
        onClick={() => setChatOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-14 rounded-full px-5 shadow-lg xl:hidden"
        aria-label="Open HokiePath AI"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        Ask AI
      </Button>

      {chatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="HokiePath AI"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 xl:hidden"
          onClick={() => setChatOpen(false)}
        >
          <div
            className="bg-background h-[85svh] rounded-t-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end pb-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="h-[calc(100%-2.5rem)]">
              <ChatPanel onTabsCreated={onTabsCreated} onItemClick={openById} />
            </div>
          </div>
        </div>
      )}

      <ItemDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export type { DashboardPayload };

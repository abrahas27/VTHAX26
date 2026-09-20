"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { ChatPanel, type TabSummary } from "@/components/chat/chat-panel";
import { DashboardView } from "./dashboard-view";
import { GoalTabs } from "./goal-tabs";
import { ItemDrawer, type DrawerItem } from "./item-drawer";
import { SectionRenderer } from "./section-renderer";
import type { DashboardSpec } from "@/lib/agent/dashboard-spec";
import type { DashboardPayload } from "@/lib/types";

async function fetchTabs(): Promise<DashboardSpec[]> {
  const res = await fetch("/api/tabs");
  if (!res.ok) return [];
  const body = (await res.json()) as { tabs?: DashboardSpec[] };
  return body.tabs ?? [];
}

async function fetchDashboard(tab: string): Promise<DashboardPayload> {
  const res = await fetch(`/api/dashboard?tab=${tab}&days=60`);
  if (!res.ok) throw new Error("Could not load this tab.");
  return (await res.json()) as DashboardPayload;
}

/**
 * The morphing dashboard (F6): For You plus any goal tabs the agent has created. Tabs are loaded
 * from Lakebase on mount, so they survive a reload, and a newly created tab animates in.
 */
export function DashboardWorkspace({ initialTab = "for-you" }: { initialTab?: string }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(initialTab);
  const [newTabId, setNewTabId] = useState<string | null>(null);
  const [selected, setSelected] = useState<DrawerItem | null>(null);

  const { data: tabs = [] } = useQuery({ queryKey: ["tabs"], queryFn: fetchTabs });
  const activeSpec = tabs.find((tab) => tab.tab_id === active);

  // Readiness, gaps and the roadmap are computed server-side, never taken from the spec.
  const { data: computed } = useQuery({
    queryKey: ["dashboard", active],
    queryFn: () => fetchDashboard(active),
    enabled: Boolean(activeSpec),
  });

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

  const closeTab = async (tabId: string) => {
    await fetch(`/api/tabs?tab=${tabId}`, { method: "DELETE" });
    await queryClient.invalidateQueries({ queryKey: ["tabs"] });
    if (active === tabId) setActive("for-you");
  };

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
    const res = await fetch("/api/items/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: [id] }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as Record<string, Record<string, unknown>>;
    const item = body[key]?.[id];
    if (!item) return;
    if (key === "events") setSelected({ kind: "event", item: item as never });
    if (key === "clubs") setSelected({ kind: "club", item: item as never });
    if (key === "opportunities") setSelected({ kind: "opportunity", item: item as never });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        {tabs.length > 0 && (
          <GoalTabs
            tabs={tabs}
            active={active}
            newTabId={newTabId}
            onSelect={setActive}
            onClose={closeTab}
          />
        )}

        {activeSpec ? (
          <SectionRenderer spec={activeSpec} computed={computed} onOpen={setSelected} />
        ) : (
          <DashboardView tab="for-you" />
        )}
      </div>

      <div className="xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
        <ChatPanel onTabsCreated={onTabsCreated} onItemClick={openById} />
      </div>

      <ItemDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

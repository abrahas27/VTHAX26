"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/client/api";
import { useWaking } from "@/lib/client/waking";
import { CardListSkeleton, Empty, WakingNotice } from "./states";
import { roadmapItemsPerMonth } from "@/lib/scoring";
import type { Preferences } from "@/lib/types";

interface StoredItem {
  roadmap_item_id: string;
  item_type: string;
  item_id: string | null;
  name: string;
  when_text: string | null;
  closes_gaps: string[];
  completed: boolean;
}

interface RoadmapResponse {
  goal: { pathId: string; pathName: string };
  items: StoredItem[];
  hoursPerWeek: Preferences["hoursPerWeek"];
}

/** Month-grouped timeline with an Ongoing lane for clubs and a Next semester lane for courses (F7). */
export function RoadmapTimeline({ goal }: { goal?: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["roadmap", goal ?? "primary"];

  const { data, isPending, error, refetch } = useQuery({
    queryKey,
    queryFn: () => apiFetch<RoadmapResponse>(`/api/roadmap${goal ? `?goal=${goal}` : ""}`),
  });
  const waking = useWaking(isPending);

  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiFetch(`/api/roadmap/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      }).then(() => undefined),
    // Optimistic: ticking an item should feel instant (spec F7).
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RoadmapResponse>(queryKey);
      queryClient.setQueryData<RoadmapResponse>(queryKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((item) =>
                item.roadmap_item_id === id ? { ...item, completed } : item,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("That did not save", { description: "The tick has been put back." });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        {waking && <WakingNotice />}
        <Skeleton className="h-8 w-64" />
        <div className="card-elevated space-y-3 p-5">
          <Skeleton className="h-4 w-24" />
          <CardListSkeleton count={4} />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="card-elevated p-5">
        <Empty message={error.message} actionLabel="Try again" onAction={() => void refetch()} />
      </div>
    );
  }

  const lanes = groupIntoLanes(data.items, roadmapItemsPerMonth(data.hoursPerWeek));
  const done = data.items.filter((i) => i.completed).length;
  const eventIds = data.items
    .filter((i) => i.item_type === "event" && i.item_id)
    .map((i) => i.item_id as string);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl">Gap-to-Goal roadmap</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {data.goal.pathName} · {done} of {data.items.length} done
          </p>
        </div>
        {eventIds.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<a href={`/api/calendar?ids=${eventIds.join(",")}`} download />}
          >
            <CalendarPlus className="size-3.5" aria-hidden="true" />
            Add all to Google Calendar
          </Button>
        )}
      </header>

      {lanes.map(([lane, items]) => (
        <section key={lane} className="card-elevated p-5">
          <h2 className="mb-3 text-base">{lane}</h2>
          <ol className="space-y-3">
            {items.map((item) => (
              <li key={item.roadmap_item_id} className="flex items-start gap-3">
                <Checkbox
                  checked={item.completed}
                  onCheckedChange={(checked) =>
                    toggle.mutate({ id: item.roadmap_item_id, completed: checked === true })
                  }
                  aria-label={`Mark ${item.name} complete`}
                  className="mt-0.5 size-5"
                />
                <div className="min-w-0">
                  <p
                    className={
                      item.completed ? "text-muted-foreground text-sm line-through" : "text-sm"
                    }
                  >
                    {item.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {item.when_text ?? "Ongoing"}
                    {item.closes_gaps.length > 0 && ` · closes ${item.closes_gaps.join(", ")}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Clubs are ongoing, courses are next semester, everything else groups by its month. */
function groupIntoLanes(items: StoredItem[], perLane: number): [string, StoredItem[]][] {
  const lanes = new Map<string, StoredItem[]>();
  for (const item of items) {
    const lane =
      item.item_type === "club"
        ? "Ongoing"
        : item.item_type === "course"
          ? "Next semester"
          : monthOf(item.when_text);
    const list = lanes.get(lane) ?? [];
    if (list.length < perLane) list.push(item);
    lanes.set(lane, list);
  }
  return [...lanes.entries()];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthOf(whenText: string | null): string {
  const month = MONTHS.find((m) => whenText?.includes(m));
  return month ? `${month}` : "Soon";
}

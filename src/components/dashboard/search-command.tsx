"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Search, Users2, Briefcase } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatEventTime } from "@/lib/format";
import type { ClubItem, EventItem, OpportunityItem } from "@/lib/types";
import type { DrawerItem } from "./item-drawer";

interface SearchResponse {
  events: EventItem[];
  opportunities: OpportunityItem[];
  clubs: ClubItem[];
}

/**
 * Global search palette (spec F10). Bound to "/" rather than Cmd/Ctrl+K, which F5 already uses to
 * focus the chat panel (spec decisions.md, P4: two Cmd+K bindings would fight over the same key).
 */
export function SearchCommand({ onOpen }: { onOpen: (item: DrawerItem) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trimmed = query.trim();
  useEffect(() => {
    if (!trimmed) return;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? (res.json() as Promise<SearchResponse>) : null))
        .then(setResults)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  // Query cleared: show nothing rather than the last search's results.
  const visible = trimmed ? results : null;

  const select = (item: DrawerItem) => {
    setOpen(false);
    setQuery("");
    onOpen(item);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors"
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">Search events, clubs, opportunities...</span>
        <kbd className="bg-surface-2 rounded px-1.5 py-0.5 text-[10px]">/</kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search HokiePath"
        description="Search events, clubs, and opportunities by meaning, not just keywords."
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search events, clubs, opportunities... (e.g. learn valuation)"
        />
        <CommandList>
          {!loading && trimmed && <CommandEmpty>No results. Try a broader term.</CommandEmpty>}
          {visible && visible.events.length > 0 && (
            <CommandGroup heading="Events">
              {visible.events.map((event) => (
                <CommandItem key={event.id} onSelect={() => select({ kind: "event", item: event })}>
                  <CalendarDays className="size-4" aria-hidden="true" />
                  <span className="truncate">{event.title}</span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {formatEventTime(event.start)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {visible && visible.opportunities.length > 0 && (
            <CommandGroup heading="Opportunities">
              {visible.opportunities.map((opp) => (
                <CommandItem
                  key={opp.id}
                  onSelect={() => select({ kind: "opportunity", item: opp })}
                >
                  <Briefcase className="size-4" aria-hidden="true" />
                  <span className="truncate">{opp.title}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{opp.companyName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {visible && visible.clubs.length > 0 && (
            <CommandGroup heading="Clubs">
              {visible.clubs.map((club) => (
                <CommandItem key={club.id} onSelect={() => select({ kind: "club", item: club })}>
                  <Users2 className="size-4" aria-hidden="true" />
                  <span className="truncate">{club.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

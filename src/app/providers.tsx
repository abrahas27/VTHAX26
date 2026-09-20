"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Dashboard data is expensive (five or six warehouse queries) and changes only when
            // the student changes their profile, so a minute of reuse makes tab switches and
            // back-navigation instant. The server cache behind /api/dashboard uses the same
            // window, and both are cleared by the same writes.
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
            // A warehouse waking from cold answers in ~14 s; retrying sooner just queues another
            // slow query behind it.
            retryDelay: (attempt) => Math.min(2_000 * 2 ** attempt, 8_000),
          },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-right" closeButton />
    </QueryClientProvider>
  );
}

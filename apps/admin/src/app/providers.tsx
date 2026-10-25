"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ToastProvider } from "@wasitx/ui";
import { Shell } from "@/components/shell";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } }));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </QueryClientProvider>
  );
}

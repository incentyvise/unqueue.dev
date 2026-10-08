import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toaster";
import { ConfirmProvider } from "@/components/confirm-provider";
import { RoutePending } from "@/lib/route-pending";
import { sessionQueryOptions } from "@/lib/session-query";
import { routeTree } from "./routeTree.gen";
import "./app.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingMinMs: 0,
  // Keep the router's default pending delay. With `defaultPendingMs: 0`, an
  // auth redirect thrown from the root `beforeLoad` races the instantly-shown
  // pending UI and React receives `undefined` as the thrown value
  // ("Uncaught undefined" in MatchInnerImpl), leaving a blank page.
  defaultPendingComponent: RoutePending,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

void queryClient.prefetchQuery(sessionQueryOptions());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </QueryClientProvider>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);

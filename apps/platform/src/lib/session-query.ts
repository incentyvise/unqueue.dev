import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth";

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: ["session"],
    queryFn: () => authClient.getSession(),
    staleTime: 5 * 60 * 1000,
  });
}

export function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/verify-email" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/invite/")
  );
}

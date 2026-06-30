"use client";

import { ClubProvider } from "@/lib/club-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ClubProvider>{children}</ClubProvider>;
}

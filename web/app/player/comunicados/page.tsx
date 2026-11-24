import type { Metadata } from "next";
import { AnnouncementsPage } from "@/components/announcements/announcements-page";

export const metadata: Metadata = { title: "Comunicados" };

export default function PlayerComunicadosPage() {
  return <AnnouncementsPage />;
}

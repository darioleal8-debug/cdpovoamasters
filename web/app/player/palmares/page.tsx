import type { Metadata } from "next";
import { PalmaresView } from "@/components/palmares/palmares-view";

export const metadata: Metadata = { title: "Palmarés" };

export default function PlayerPalmaresPage() {
  return <PalmaresView allowAdmin={false} />;
}

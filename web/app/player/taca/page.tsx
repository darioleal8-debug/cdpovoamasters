import { CupPanel } from "@/components/competitions/cup-panel";

export const metadata = { title: "Taça da Liga INATEL" };

export default function PlayerTacaPage() {
  return (
    <div className="space-y-4">
      <CupPanel />
    </div>
  );
}

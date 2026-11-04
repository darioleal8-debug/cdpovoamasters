import type { CalledUpPlayer } from "@/types/callups";

// Lista compacta de convocados (chips com número + nome). Server-safe.
// O(s) jogador(es) do próprio utilizador ficam destacados a laranja.

function shortName(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function CallupsList({
  players,
  highlightIds = [],
}: {
  players: CalledUpPlayer[];
  highlightIds?: string[];
}) {
  if (players.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-barlow, sans-serif)", fontSize: "13px", color: "#8C837A", margin: 0 }}>
        Convocatória ainda não divulgada.
      </p>
    );
  }

  return (
    <ul style={{ display: "flex", flexWrap: "wrap", gap: "6px", listStyle: "none", margin: 0, padding: 0 }}>
      {players.map((p) => {
        const me = highlightIds.includes(p.player_id);
        return (
          <li
            key={p.player_id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "999px",
              padding: "4px 10px 4px 4px",
              background: me ? "#F97316" : "#F4EFE8",
              color: me ? "#fff" : "#1A1612",
              fontFamily: "var(--font-barlow, sans-serif)",
              fontSize: "13px",
              fontWeight: me ? 700 : 500,
              lineHeight: 1,
            }}
          >
            <span
              style={{
                minWidth: "22px",
                height: "22px",
                borderRadius: "999px",
                background: me ? "rgba(255,255,255,.25)" : "#1A1612",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-barlow-condensed, sans-serif)",
                fontWeight: 700,
                fontSize: "11px",
                padding: "0 4px",
              }}
            >
              {p.number ?? "–"}
            </span>
            {shortName(p.name)}
          </li>
        );
      })}
    </ul>
  );
}

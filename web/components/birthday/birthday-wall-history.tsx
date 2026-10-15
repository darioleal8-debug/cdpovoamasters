"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { useBirthdayMessages } from "@/hooks/use-birthday-messages";
import { getYearLisbon, isWithinBirthdayWindow } from "@/lib/birthday-utils";
import { BirthdayWall } from "./birthday-wall";

interface BirthdayWallHistoryProps {
  playerId:        string;
  playerName:      string;
  birthDate:       string;
  isAdmin?:        boolean;
  celebrantUserId: string;
}

export function BirthdayWallHistory({
  playerId,
  playerName,
  birthDate,
  isAdmin = false,
  celebrantUserId,
}: BirthdayWallHistoryProps) {
  const currentYear = getYearLisbon();
  const windowOpen  = isWithinBirthdayWindow(birthDate);

  // Past years to show (last 4 completed years, most recent first)
  const pastYears = Array.from({ length: 4 }, (_, i) => currentYear - 1 - i);

  return (
    <div className="space-y-6">
      {/* Current year — show full interactive wall if window is open */}
      {windowOpen ? (
        <div className="space-y-3">
          <SectionHeading year={currentYear} current />
          <BirthdayWall
            playerId={playerId}
            playerName={playerName}
            birthDate={birthDate}
            isAdmin={isAdmin}
            celebrantUserId={celebrantUserId}
          />
        </div>
      ) : (
        <PastYearSection
          playerId={playerId}
          year={currentYear}
          current
        />
      )}

      {/* Past years */}
      {pastYears.map((year) => (
        <PastYearSection
          key={year}
          playerId={playerId}
          year={year}
        />
      ))}
    </div>
  );
}

// ── Past year: collapsed by default, shows message count ─────────────────────

function PastYearSection({
  playerId,
  year,
  current = false,
}: {
  playerId: string;
  year:     number;
  current?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { messages, loading }   = useBirthdayMessages(playerId, year);

  // Don't render empty past years
  if (!loading && messages.length === 0 && !current) return null;

  const count = messages.filter((m) => !m.is_thank_you).length;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full group"
      >
        <SectionHeading year={year} current={current} count={loading ? null : count} />
        <div
          className="flex items-center gap-1.5 text-[12px] font-semibold px-3 h-8 rounded-xl transition-colors"
          style={{
            background: "var(--paper,#F6F7F9)",
            color:      "var(--muted-text,#5A6478)",
            border:     "1px solid var(--line,#E4E7EE)",
          }}
        >
          {expanded
            ? <><ChevronUp className="h-3.5 w-3.5" /> Fechar</>
            : <><ChevronDown className="h-3.5 w-3.5" /> Ver mensagens</>}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--paper,#F6F7F9)" }} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm py-2" style={{ color: "var(--muted-text,#5A6478)" }}>
              Sem mensagens guardadas para este ano.
            </p>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: msg.is_thank_you
                      ? "rgba(249,115,22,.06)"
                      : "var(--paper,#F6F7F9)",
                    border: `1px solid ${msg.is_thank_you ? "rgba(249,115,22,.2)" : "var(--line,#E4E7EE)"}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text,#0F1729)" }}>
                      {msg.author_name}
                    </span>
                    {msg.is_thank_you && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(249,115,22,.15)", color: "var(--action,#F97316)" }}
                      >
                        Obrigado ♥
                      </span>
                    )}
                  </div>
                  <p className="text-sm" style={{ color: "var(--text,#0F1729)" }}>
                    {msg.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({
  year,
  current = false,
  count = null,
}: {
  year:    number;
  current?: boolean;
  count?:  number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <MessageCircle
        className="h-4 w-4 shrink-0"
        style={{ color: current ? "var(--action,#F97316)" : "var(--muted-text,#5A6478)" }}
      />
      <span
        className="text-[13px] font-bold uppercase tracking-widest"
        style={{ color: current ? "var(--action,#F97316)" : "var(--muted-text,#5A6478)" }}
      >
        {current ? `Mural ${year}` : String(year)}
      </span>
      {count !== null && count > 0 && (
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "var(--paper,#F6F7F9)", color: "var(--muted-text,#5A6478)" }}
        >
          {count} {count === 1 ? "mensagem" : "mensagens"}
        </span>
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import { BirthdayWall } from "./birthday-wall";
import {
  selectBirthdayPhrase,
  getFirstName,
  calculateAgeLisbon,
  getYearLisbon,
  getTodayLabel,
} from "@/lib/birthday-utils";
import type { BirthdayPlayer } from "@/app/api/birthdays/today/route";

interface BirthdayCardProps {
  player:   BirthdayPlayer;
  isAdmin?: boolean;
}

export function BirthdayCard({ player, isAdmin = false }: BirthdayCardProps) {
  const firstName  = getFirstName(player.name);
  const age        = calculateAgeLisbon(player.birth_date);
  const year       = getYearLisbon();
  const phrase     = selectBirthdayPhrase(player.player_id, year, firstName);
  const todayLabel = getTodayLabel();

  const photoSrc = player.processed_photo_url ?? player.photo_url;
  const focalX   = player.photo_focal_x ?? 50;
  const focalY   = player.photo_focal_y ?? 20;

  return (
    <div className="space-y-5">
      {/* ── Card container ──────────────────────────────────── */}
      <div
        className="flex flex-col md:flex-row gap-8 rounded-[20px] p-6 md:p-8 items-center md:items-start"
        style={{
          background: "var(--card,#fff)",
          border:     "1px solid #E7E5E4",
          boxShadow:  "0 4px 32px rgba(0,0,0,.06)",
        }}
      >
        {/* ── Cromo ─────────────────────────────────────────── */}
        <div className="shrink-0 flex justify-center">
          <Cromo
            name={player.name}
            number={player.number}
            position={player.position}
            photoSrc={photoSrc}
            focalX={focalX}
            focalY={focalY}
            year={year}
          />
        </div>

        {/* ── Content ───────────────────────────────────────── */}
        <div className="flex flex-col justify-center gap-4 min-w-0 w-full">
          {/* Pill + date */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center font-condensed font-bold text-white uppercase px-3 h-7 rounded-full"
              style={{ background: "var(--action,#F97316)", fontSize: 11, letterSpacing: ".14em" }}
            >
              Hoje
            </span>
            <span
              className="text-[12px] font-bold uppercase tracking-widest"
              style={{ color: "var(--muted-text,#5A6478)" }}
            >
              {todayLabel}
            </span>
          </div>

          {/* Big title */}
          <h2
            className="font-condensed leading-[1.05] text-balance"
            style={{
              fontSize:   "clamp(28px,4.5vw,52px)",
              fontWeight: 800,
              color:      "var(--ink,#0A1220)",
            }}
          >
            O {player.name} faz {age} anos.{" "}
            <span style={{ color: "var(--action,#F97316)" }}>Parabéns, campeão!</span>
          </h2>

          {/* Motivational phrase */}
          <p
            className="font-condensed font-semibold italic"
            style={{
              fontSize: "clamp(15px,2vw,24px)",
              color:    "#C2410C",
            }}
          >
            &ldquo;{phrase}&rdquo;
          </p>
        </div>
      </div>

      {/* ── Birthday Wall ─────────────────────────────────────── */}
      <BirthdayWall
        playerId={player.player_id}
        playerName={player.name}
        birthDate={player.birth_date}
        isAdmin={isAdmin}
        celebrantUserId={player.user_id}
      />
    </div>
  );
}

// ── Cromo trading card ──────────────────────────────────────────────────────

interface CromoProps {
  name:      string;
  number:    number | null;
  position:  string | null;
  photoSrc:  string | null;
  focalX:    number;
  focalY:    number;
  year:      number;
}

function Cromo({ name, number, position, photoSrc, focalX, focalY, year }: CromoProps) {
  const W = 270;
  const H = 372;
  const FRAME = 10;

  return (
    <div
      style={{
        width:        W,
        height:       H,
        transform:    "rotate(-3deg)",
        borderRadius: 18,
        overflow:     "hidden",
        background:   "#1C1917",
        padding:      FRAME,
        boxShadow:    "0 16px 48px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.18)",
        flexShrink:   0,
      }}
      aria-hidden="true"
    >
      {/* Inner card */}
      <div
        className="relative w-full h-full overflow-hidden"
        style={{
          borderRadius: 10,
          background:   "var(--action,#F97316)",
        }}
      >
        {/* Player photo */}
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={`Foto de ${name}`}
            fill
            sizes="250px"
            className="object-cover"
            style={{ objectPosition: `${focalX}% ${focalY}%` }}
            priority
          />
        ) : (
          /* No photo: large number placeholder */
          <div className="absolute inset-0 flex items-end justify-center pb-10">
            <span
              className="font-condensed font-black text-white/30 select-none"
              style={{ fontSize: 120, lineHeight: 1 }}
            >
              {number ?? "?"}
            </span>
          </div>
        )}

        {/* Top gradient: year label */}
        <div
          className="absolute top-0 left-0 right-0 flex justify-between items-start px-3 pt-2.5"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,.6) 0%, transparent 100%)",
            paddingBottom: 20,
          }}
        >
          <span
            className="font-condensed font-bold text-white uppercase"
            style={{ fontSize: 10, letterSpacing: ".2em" }}
          >
            Aniversário
          </span>
          <span
            className="font-condensed font-bold text-white/80"
            style={{ fontSize: 10, letterSpacing: ".1em" }}
          >
            {year}
          </span>
        </div>

        {/* Bottom gradient: number + position */}
        <div
          className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 pb-3"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,.72) 0%, transparent 100%)",
            paddingTop: 32,
          }}
        >
          <span
            className="font-condensed font-black text-white leading-none"
            style={{ fontSize: 50 }}
          >
            {number ?? ""}
          </span>
          {position && (
            <span
              className="font-condensed font-semibold text-white/90 uppercase text-right"
              style={{ fontSize: 12, letterSpacing: ".08em", lineHeight: 1.2, maxWidth: 100 }}
            >
              {position}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

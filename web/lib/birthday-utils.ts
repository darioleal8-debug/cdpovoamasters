// ── Frases motivacionais ──────────────────────────────────────────────────────
// Pelo menos 12 frases em português de Portugal, dirigidas à equipa.
// A escolha é determinística: hash(player_id + year) → índice fixo.
// Todos os membros veem a mesma frase no mesmo dia.

const BIRTHDAY_PHRASES = [
  "Ninguém ganha sozinho. Hoje mostramos ao {nome} que tem uma equipa inteira ao lado.",
  "Um jogador cresce. Uma equipa cresce com ele. Parabéns, {nome}!",
  "Dentro e fora do campo, és parte do que nos faz fortes. Força, {nome}!",
  "Anos de jogo, anos de partilha. Hoje é a tua vez, {nome}.",
  "Cada ano é uma nova época. E tu só ficas melhor. Parabéns, {nome}!",
  "De camisola vestida ou à civil, o {nome} é sempre da nossa equipa.",
  "Hoje o balneário é todo teu, {nome}. Aproveita!",
  "Mais um ano de batalhas e conquistas. Que se repita, {nome}!",
  "A equipa não é nada sem cada um dos seus. Hoje celebramos o {nome}.",
  "Num dia em que o mundo começou melhor por teres nascido — parabéns, {nome}!",
  "O tempo passa, o jogo fica. Que continues a ditar o ritmo, {nome}.",
  "Hoje o campo é teu. E a equipa está do teu lado, como sempre. Parabéns, {nome}!",
  "Nasceste para jogar e para ganhar. Hoje celebramos isso. Parabéns, {nome}!",
  "Quando entras no balneário fazes toda a gente melhor. Obrigado e parabéns, {nome}!",
];

// ── Phrase selection ──────────────────────────────────────────────────────────

export function selectBirthdayPhrase(playerId: string, year: number, firstName: string): string {
  let hash = year;
  for (const ch of playerId.replace(/-/g, "")) {
    hash = ((hash * 31 + ch.charCodeAt(0)) >>> 0);
  }
  const template = BIRTHDAY_PHRASES[hash % BIRTHDAY_PHRASES.length];
  return template.replace(/{nome}/g, firstName);
}

// ── Lisbon date helpers ───────────────────────────────────────────────────────

/** Returns today's date in Lisbon timezone with time zeroed (midnight Lisbon). */
export function getTodayLisbon(): Date {
  const lisbonStr = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Lisbon" });
  // lisbonStr is "YYYY-MM-DD HH:MM:SS"; parse as local-time fake UTC
  return new Date(lisbonStr.slice(0, 10) + "T00:00:00");
}

export function getYearLisbon(): number {
  return getTodayLisbon().getFullYear();
}

// ── Birthday calculation ──────────────────────────────────────────────────────

/** True if `year` is a leap year. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the effective birthday date for `year`.
 * If birthDateStr is Feb 29 and `year` is not a leap year, returns Feb 28.
 * Input format: "YYYY-MM-DD"
 */
export function getBirthdayForYear(birthDateStr: string, year: number): Date {
  // Parse without timezone conversion: treat as local
  const parts = birthDateStr.split("-").map(Number);
  const month = parts[1] - 1; // 0-indexed
  const day   = parts[2];

  if (month === 1 && day === 29 && !isLeapYear(year)) {
    return new Date(year, 1, 28); // Feb 28 in non-leap years
  }
  return new Date(year, month, day);
}

/**
 * True if a player with `birthDateStr` has their birthday today in Lisbon.
 * Handles Feb 29 in non-leap years (celebrated on Feb 28).
 */
export function isBirthdayTodayLisbon(birthDateStr: string | null | undefined): boolean {
  if (!birthDateStr) return false;
  const today = getTodayLisbon();
  const bday  = getBirthdayForYear(birthDateStr, today.getFullYear());
  return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
}

/**
 * Calculates the player's age as of today in Lisbon.
 * Returns 0 for invalid dates.
 */
export function calculateAgeLisbon(birthDateStr: string | null | undefined): number {
  if (!birthDateStr) return 0;
  const today = getTodayLisbon();
  const parts = birthDateStr.split("-").map(Number);
  let age = today.getFullYear() - parts[0];
  // If birthday hasn't passed yet this year, subtract 1
  const bday = getBirthdayForYear(birthDateStr, today.getFullYear());
  if (today < bday) age--;
  return Math.max(0, age);
}

/**
 * True if today in Lisbon is within the writing window:
 * [birthday_this_year, birthday_this_year + 7 days].
 */
export function isWithinBirthdayWindow(birthDateStr: string | null | undefined): boolean {
  if (!birthDateStr) return false;
  const today = getTodayLisbon();
  const year  = today.getFullYear();
  const bday  = getBirthdayForYear(birthDateStr, year);
  const windowEnd = new Date(bday);
  windowEnd.setDate(windowEnd.getDate() + 7);
  return today >= bday && today <= windowEnd;
}

// ── Formatting ────────────────────────────────────────────────────────────────

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Returns "15 OUT" label for today in Lisbon. */
export function getTodayLabel(): string {
  const t = getTodayLisbon();
  return `${t.getDate()} ${PT_MONTHS[t.getMonth()].toUpperCase()}`;
}

/** Extracts the first name from a full name. */
export function getFirstName(fullName: string): string {
  return fullName.split(" ")[0];
}

/** Returns initials (max 2 chars) from a full name. */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Relative time label in Portuguese (e.g. "há 5 min"). */
export function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(isoDate).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

import type { RsvpReasonCode } from "@/types/database";

/** Estado guardado em game_availability.status */
export type GameAvailabilityStatus = "available" | "unavailable";

/** Linha devolvida pelas RPCs training_rsvp_roster / game_availability_roster */
export interface AvailabilityRosterRow {
  player_id:     string;
  name:          string;
  jersey_number: number | null;
  /** treinos: going | not_going · jogos: available | unavailable · null = sem resposta */
  status:        string | null;
  reason_code:   RsvpReasonCode | null;
  reason_text:   string | null;
  responded_at:  string | null;
}

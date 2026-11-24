/** Formas partilhadas (servidor e cliente) dos comunicados. */

export type AnnouncementTarget =
  | {
      kind: "game";
      id: string;
      title: string;
      opponent: string | null;
      competition: string | null;
      date: string;          // YYYY-MM-DD
      time: string | null;   // HH:MM
      ends_at: string;       // ISO
    }
  | {
      kind: "training";
      id: string;
      date: string;
      time: string | null;
      training_type: string | null;
      ends_at: string;
    };

export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  created_at: string;
  author: { id: string; name: string; role: string } | null;
  /** Jogo/treino a que o comunicado está afeto (null = comunicado solto). */
  target: AnnouncementTarget | null;
  /** O jogo/treino foi apagado: o comunicado fica no arquivo mas sem destaque. */
  target_removed: boolean;
  /** Em destaque no Dashboard neste momento (72h, ou até ao final do jogo/treino). */
  highlighted: boolean;
  /** Fim do destaque (ISO). */
  highlight_until: string;
  /** Ainda não visto por quem pede. */
  unread: boolean;
}

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 4000;

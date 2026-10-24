// Types for Laboratório de Jogadas

export type Pt = [number, number];

export type MoveType = 'cut' | 'dribble' | 'screen';

export interface Move {
  p: 1 | 2 | 3 | 4 | 5;
  to: Pt;
  via?: Pt;
  type: MoveType;
  s: number; // 0-1
  e: number; // 0-1, s < e
}

export interface Pass {
  f: number; // from player 1-5
  t: number; // to player 1-5
  s: number; // 0-1
  e: number; // 0-1
  ho?: boolean; // hand-off
}

export interface Step {
  title: string;
  text: string;
  moves?: Move[];
  passes?: Pass[];
  options?: number[]; // possible pass targets shown as faint dashed lines
}

export interface PlayOption {
  id: string;
  label: string;
  sub: string;
  steps: string[]; // ordered step ids
}

export interface Init {
  pos: Record<string, Pt>; // JSON keys are strings "1"-"5"
  ball: number;            // player number holding ball
}

export interface Play {
  id: string;
  club: string;
  name: string;
  eyebrow?: string | null;
  category: string;
  note?: string | null;
  init: Init;
  steps: Record<string, Step>;
  options: PlayOption[];
  status: 'draft' | 'published';
  ai_prompt?: string | null;
  ai_history: unknown[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
}

export interface PlayProgress {
  play_id: string;
  user_id: string;
  first_viewed_at: string;
  last_viewed_at: string;
  studied_at?: string | null;
}

export interface PlayWithProgress extends Play {
  progress?: PlayProgress | null;
  studied_count?: number;
  total_players?: number;
}

export type PlayCategory =
  | 'Ataque'
  | 'Defesa'
  | 'Reposição lateral'
  | 'Reposição de fundo'
  | 'Contra-ataque'
  | 'Zona'
  | 'Pressão';

export const PLAY_CATEGORIES: PlayCategory[] = [
  'Ataque',
  'Defesa',
  'Reposição lateral',
  'Reposição de fundo',
  'Contra-ataque',
  'Zona',
  'Pressão',
];

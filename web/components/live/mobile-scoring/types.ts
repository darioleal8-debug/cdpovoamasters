// Re-exporta o tipo de retorno de useLiveGame para os componentes mobile
// sem fazer import directo do hook (evita dependência circular em SSR)
import type { useLiveGame } from "@/hooks/use-live-game";

export type UseLiveGameReturn = ReturnType<typeof useLiveGame>;

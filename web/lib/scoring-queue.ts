/**
 * Fila offline para eventos de marcação ao vivo.
 *
 * Usa IndexedDB para persistir eventos que não puderam ser enviados.
 * Em cada mount e no evento "online" tenta enviar tudo o que está pendente.
 *
 * Idempotência: cada evento tem um client_id UUID único gerado no dispositivo.
 * O servidor usa ON CONFLICT (client_id) DO NOTHING, portanto re-envios são seguros.
 */

import type { PlayEventType } from "@/types/database";

export interface QueuedPlayEvent {
  client_id:           string;
  game_session_id:     string;
  season_id:           string;
  player_id:           string | null;
  secondary_player_id: string | null;
  event_type:          PlayEventType;
  period:              number;
  game_clock:          string;
  shot_x:              number | null;
  shot_y:              number | null;
  shot_zone:           string | null;
  is_home_team:        boolean;
  points_delta:        number;
  home_score_after:    number;
  away_score_after:    number;
  description:         string | null;
  // Metadados da fila
  queued_at:           number;        // Date.now()
  attempts:            number;        // nº de tentativas falhadas
  next_attempt_at:     number;        // timestamp para próxima tentativa
}

const DB_NAME    = "hoophub-scoring";
const STORE_NAME = "queue";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "client_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req   = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      }),
  );
}

export const ScoringQueue = {
  /** Adiciona um evento à fila (ou actualiza se já existir). */
  push(event: QueuedPlayEvent): Promise<void> {
    return withStore("readwrite", (s) => s.put(event)).then(() => undefined);
  },

  /** Devolve todos os eventos pendentes, ordenados por queued_at. */
  async pending(): Promise<QueuedPlayEvent[]> {
    const all = await withStore<QueuedPlayEvent[]>(
      "readonly",
      (s) => s.getAll() as IDBRequest<QueuedPlayEvent[]>,
    );
    return all.sort((a, b) => a.queued_at - b.queued_at);
  },

  /** Remove um evento da fila (após sucesso). */
  remove(clientId: string): Promise<void> {
    return withStore("readwrite", (s) => s.delete(clientId)).then(() => undefined);
  },

  /**
   * Tenta enviar todos os eventos pendentes para /api/play-events.
   * Usa exponential backoff: 2^attempts * 1000 ms (máx 60 000 ms).
   * Chama-se no mount do componente e ao receber o evento "online".
   */
  async flush(onSent?: (clientId: string) => void): Promise<void> {
    const now    = Date.now();
    const events = await ScoringQueue.pending();

    for (const ev of events) {
      if (ev.next_attempt_at > now) continue;

      try {
        const res = await fetch("/api/play-events", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(ev),
        });

        if (res.ok || res.status === 409) {
          // 409 = conflito de client_id → já foi registado → remover da fila
          await ScoringQueue.remove(ev.client_id);
          onSent?.(ev.client_id);
        } else {
          // Falha recuperável: agendar próxima tentativa
          const backoffMs = Math.min(Math.pow(2, ev.attempts) * 1000, 60_000);
          await ScoringQueue.push({
            ...ev,
            attempts:        ev.attempts + 1,
            next_attempt_at: now + backoffMs,
          });
        }
      } catch {
        // Sem rede: agendar próxima tentativa
        const backoffMs = Math.min(Math.pow(2, ev.attempts) * 1000, 60_000);
        await ScoringQueue.push({
          ...ev,
          attempts:        ev.attempts + 1,
          next_attempt_at: now + backoffMs,
        });
      }
    }
  },
};

/** Cria um QueuedPlayEvent pronto para a fila. */
export function makeQueuedEvent(
  base: Omit<QueuedPlayEvent, "queued_at" | "attempts" | "next_attempt_at">,
): QueuedPlayEvent {
  return {
    ...base,
    queued_at:       Date.now(),
    attempts:        0,
    next_attempt_at: 0,
  };
}

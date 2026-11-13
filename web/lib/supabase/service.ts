import "server-only";
import { createRawServiceClient } from "./service-raw";
import { scopeClient } from "./club-scope";

export { createRawServiceClient };

/**
 * Cliente service-role ISOLADO POR CLUBE: se o pedido tem sessão de um utilizador de um clube,
 * leituras/updates/deletes nas tabelas de clube só veem esse clube e os inserts levam o seu club_id.
 * Sem sessão (cron, páginas públicas) comporta-se como service role normal.
 * Ver docs/multi-clube.md.
 */
export function createServiceClient() {
  return scopeClient(createRawServiceClient());
}

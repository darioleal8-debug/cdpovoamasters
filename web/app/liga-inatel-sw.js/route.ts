// Service Worker da app "Liga INATEL" (scope /liga-inatel).
//
// Servido por rota (e não de /public) para incluir a versão do deploy: cada
// deploy muda o conteúdo do ficheiro → o browser instala a nova versão e
// apaga a cache antiga automaticamente.
//
// Regras de cache (dados da competição NUNCA vêm da cache):
//  • Páginas /liga-inatel/*  → sempre da rede; sem rede mostra uma página
//    "sem ligação" (nunca resultados/classificações antigos).
//  • /_next/static/*, /pwa/*  → cache-first (ficheiros imutáveis com hash).
//  • Tudo o resto (API, Supabase, RSC, imagens dinâmicas) → não é interceptado.
//
// Só existe este Service Worker no projeto; o HoopHub principal não regista nenhum.

import { buildLigaServiceWorker } from "@/lib/liga/pwa-sw";

export const dynamic = "force-static";

const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  String(Date.now());

export function GET() {
  return new Response(buildLigaServiceWorker(VERSION), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // O browser verifica sempre se há versão nova
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

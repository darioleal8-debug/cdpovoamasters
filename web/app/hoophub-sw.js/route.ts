// Service Worker do HoopHub (scope "/"): apenas notificações push (ver lib/push/hoophub-sw.ts).
// Servido por rota para o ficheiro mudar a cada deploy e o browser instalar a versão nova.

import { buildHoopHubServiceWorker } from "@/lib/push/hoophub-sw";

export const dynamic = "force-static";

const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  String(Date.now());

export function GET() {
  return new Response(buildHoopHubServiceWorker(VERSION), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}

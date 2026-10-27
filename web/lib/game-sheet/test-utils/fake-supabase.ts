/**
 * Cliente Supabase falso, mínimo, para testes de rotas. Cada pedido é resolvido por um
 * handler (tabela, operação, filtros, payload) → { data, error, count }.
 */
export type Op = "select" | "insert" | "update" | "delete";
export interface FakeQuery {
  table: string;
  op: Op;
  filters: Record<string, unknown>;
  payload?: unknown;
  head?: boolean;
}
export type FakeResult = { data?: unknown; error?: { message: string; code?: string } | null; count?: number };
export type Handler = (q: FakeQuery) => FakeResult;

export function fakeSupabase(opts: {
  user: { id: string } | null;
  handler: Handler;
  rpc?: (name: string, args: unknown) => FakeResult;
  storage?: { upload?: () => FakeResult; download?: () => FakeResult; remove?: (paths: string[]) => FakeResult };
}) {
  const calls: FakeQuery[] = [];
  function builder(table: string) {
    const q: FakeQuery = { table, op: "select", filters: {} };
    const resolve = () => {
      calls.push({ ...q });
      const r = opts.handler(q);
      return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
    };
    const b: Record<string, unknown> = {
      select: (_cols?: string, o?: { head?: boolean }) => { if (q.op === "select") q.head = o?.head; return b; },
      insert: (p: unknown) => { q.op = "insert"; q.payload = p; return b; },
      update: (p: unknown) => { q.op = "update"; q.payload = p; return b; },
      delete: () => { q.op = "delete"; return b; },
      eq: (k: string, v: unknown) => { q.filters[k] = v; return b; },
      neq: (k: string, v: unknown) => { q.filters[`!${k}`] = v; return b; },
      is: (k: string, v: unknown) => { q.filters[`is:${k}`] = v; return b; },
      gte: (k: string, v: unknown) => { q.filters[`>=${k}`] = v; return b; },
      lt: (k: string, v: unknown) => { q.filters[`<${k}`] = v; return b; },
      order: () => b,
      limit: () => b,
      single: async () => resolve(),
      maybeSingle: async () => resolve(),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, ko),
    };
    return b;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from: (t: string) => builder(t),
    rpc: async (name: string, args: unknown) => {
      const r = opts.rpc?.(name, args) ?? { data: null };
      return { data: r.data ?? null, error: r.error ?? null };
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null, ...(opts.storage?.upload?.() ?? {}) }),
        download: async () => ({ data: null, error: null, ...(opts.storage?.download?.() ?? {}) }),
        remove: async (paths: string[]) => ({ data: null, error: null, ...(opts.storage?.remove?.(paths) ?? {}) }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed.example/img" }, error: null }),
      }),
    },
  };
  return { client, calls };
}

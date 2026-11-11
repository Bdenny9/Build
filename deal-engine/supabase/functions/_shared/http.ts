export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Wraps a handler with CORS, POST-only, JSON body parsing and uniform errors. Never echoes secrets. */
export function handle(fn: (req: Request, body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
    let body: Record<string, unknown> = {};
    try { body = (await req.json()) ?? {}; } catch { return json({ error: 'Body must be JSON' }, 400); }
    try {
      return json(await fn(req, body));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Internal error' }, 500);
    }
  };
}

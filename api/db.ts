/**
 * Cloud database endpoint (Vercel serverless function).
 *
 * Stores the whole payroll database as one versioned snapshot in Redis (Upstash, available
 * from the Vercel Marketplace). Snapshots are sent in chunks because Vercel caps request and
 * response bodies at 4.5 MB, and employee documents / logos are stored inline as base64.
 *
 * Required environment variables on Vercel:
 *   SYNC_KEY                                   shared secret the app sends in `x-sync-key`
 *   KV_REST_API_URL + KV_REST_API_TOKEN        (injected by the Upstash Redis integration)
 *     or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *
 * Protocol:
 *   GET  ?op=meta                              -> { version, chunks } | { version: null }
 *   GET  ?op=chunk&i=N                         -> chunk N (text) of the current version
 *   POST ?op=chunk&upload=ID&i=N   (text body) -> stages a chunk for 30 minutes
 *   POST ?op=commit&upload=ID&chunks=N&base=V[&force=1]
 *        -> publishes staged chunks as the new version; 409 if the cloud version is not V
 */
import { timingSafeEqual } from 'crypto';

const META_KEY = 'payroll:meta';
const STAGE_TTL_SECONDS = 1800;

interface Meta {
  version: string;
  uploadId: string;
  chunks: number;
}

type RedisCmd = (string | number)[];

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const isVercel = !!process.env.VERCEL;

// Local `npm run dev` without Redis keeps data in memory so the app can be tried end to end.
const memoryStore = new Map<string, string>();

async function redis(cmd: RedisCmd): Promise<any> {
  if (!redisUrl || !redisToken) {
    const [op, key, value] = cmd as string[];
    switch (String(op).toUpperCase()) {
      case 'GET':
        return memoryStore.get(key) ?? null;
      case 'SET':
        memoryStore.set(key, value);
        return 'OK';
      case 'DEL':
        for (const k of cmd.slice(1)) memoryStore.delete(String(k));
        return 1;
      case 'EXISTS':
        return memoryStore.has(key) ? 1 : 0;
      case 'PERSIST':
      case 'EXPIRE':
        return 1;
    }
    throw new Error(`Unsupported in-memory command ${op}`);
  }
  const res = await fetch(redisUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const json: any = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Redis HTTP ${res.status}`);
  return json.result;
}

const chunkKey = (uploadId: string, i: number) => `payroll:chunk:${uploadId}:${i}`;
const validId = (id: string) => /^[A-Za-z0-9_-]{6,64}$/.test(id);

function send(res: any, status: number, body: unknown, contentType = 'application/json') {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req: any): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (req.body && Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  return Buffer.concat(parts).toString('utf8');
}

function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '/', 'http://localhost');
  const q = url.searchParams;
  const op = q.get('op') || 'meta';

  try {
    if (isVercel && (!redisUrl || !redisToken)) {
      return send(res, 503, {
        error: 'not_configured',
        message: 'Cloud storage is not set up. Add the Upstash Redis integration to this Vercel project.',
      });
    }

    const expectedKey = process.env.SYNC_KEY || '';
    if (isVercel && !expectedKey) {
      return send(res, 503, {
        error: 'not_configured',
        message: 'Set the SYNC_KEY environment variable in Vercel, then redeploy.',
      });
    }
    if (expectedKey) {
      const provided = String(req.headers['x-sync-key'] || '');
      if (!keyMatches(provided, expectedKey)) {
        return send(res, 401, { error: 'unauthorized', message: 'Wrong or missing sync key.' });
      }
    }

    const metaRaw = await redis(['GET', META_KEY]);
    const meta: Meta | null = metaRaw ? JSON.parse(metaRaw) : null;

    if (req.method === 'GET' && op === 'meta') {
      return send(res, 200, meta ? { version: meta.version, chunks: meta.chunks } : { version: null });
    }

    if (req.method === 'GET' && op === 'chunk') {
      const i = Number(q.get('i'));
      if (!meta || !Number.isInteger(i) || i < 0 || i >= meta.chunks) {
        return send(res, 404, { error: 'not_found' });
      }
      const data = await redis(['GET', chunkKey(meta.uploadId, i)]);
      if (data === null) return send(res, 404, { error: 'not_found' });
      return send(res, 200, data, 'text/plain; charset=utf-8');
    }

    if (req.method === 'POST' && op === 'chunk') {
      const uploadId = q.get('upload') || '';
      const i = Number(q.get('i'));
      if (!validId(uploadId) || !Number.isInteger(i) || i < 0 || i > 500) {
        return send(res, 400, { error: 'bad_request' });
      }
      const body = await readBody(req);
      await redis(['SET', chunkKey(uploadId, i), body, 'EX', STAGE_TTL_SECONDS]);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && op === 'commit') {
      const uploadId = q.get('upload') || '';
      const chunks = Number(q.get('chunks'));
      const base = q.get('base') || '';
      const force = q.get('force') === '1';
      if (!validId(uploadId) || !Number.isInteger(chunks) || chunks < 1 || chunks > 500) {
        return send(res, 400, { error: 'bad_request' });
      }

      // Another device saved since this client last synced: refuse instead of overwriting.
      if (!force && meta && meta.version !== base) {
        return send(res, 409, { error: 'conflict', version: meta.version });
      }

      for (let i = 0; i < chunks; i++) {
        const exists = await redis(['EXISTS', chunkKey(uploadId, i)]);
        if (!exists) {
          return send(res, 400, { error: 'missing_chunk', message: `Chunk ${i} was not uploaded.` });
        }
        await redis(['PERSIST', chunkKey(uploadId, i)]);
      }

      const version = `${Date.now()}-${uploadId}`;
      const next: Meta = { version, uploadId, chunks };
      await redis(['SET', META_KEY, JSON.stringify(next)]);

      if (meta && meta.uploadId !== uploadId) {
        const oldKeys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(meta.uploadId, i));
        await redis(['DEL', ...oldKeys]);
      }
      return send(res, 200, { version });
    }

    return send(res, 405, { error: 'method_not_allowed' });
  } catch (error: any) {
    console.error('api/db error:', error);
    return send(res, 500, { error: 'server_error', message: error?.message || 'Server error' });
  }
}

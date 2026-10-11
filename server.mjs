#!/usr/bin/env node
// Use your own AI agent as the assistant on Even Realities G2 glasses.
// The Even app POSTs each spoken request to a URL you configure, in OpenAI
// chat-completions format. This server answers it with whatever backend you pick.
//
//   TOKEN=secret BACKEND=echo node server.mjs
import { createServer as createHttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PATH = '/v1/chat/completions';
const SYSTEM_PROMPT =
  'You are answering on smart glasses with a tiny display. Reply in plain text, ' +
  'no markdown, no lists, under 300 characters.';

/** The app sends only the latest utterance, but take the last user message to be safe. */
export function lastUserText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content.trim();
    if (Array.isArray(m.content)) {
      return m.content.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join(' ').trim();
    }
  }
  return '';
}

/** The lens drops unsupported glyphs and stops rendering after roughly 400 to 500 characters. */
export function fitToLens(text, maxChars = 350) {
  let t = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxChars) return t;
  t = t.slice(0, maxChars);
  const end = Math.max(t.lastIndexOf('. '), t.lastIndexOf('? '), t.lastIndexOf('! '));
  return end > maxChars * 0.5 ? t.slice(0, end + 1) : t.replace(/\s+\S*$/, '') + '...';
}

function tokenOk(header, token) {
  const given = Buffer.from((header ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function createServer({
  token,
  backend,
  maxChars = 350,
  replyTimeoutMs = 25000,
  dedupeWindowMs = 6000,
  log = () => {},
}) {
  if (!token) throw new Error('token is required');
  // The Even app fires every request twice about 5 ms apart. Share one answer.
  const recent = new Map(); // text -> { at, promise }

  // A slow agent gets a holding reply now; when it finishes, asking the same thing again returns it.
  const finished = new Map(); // text -> answer that arrived after the holding reply

  function answer(text) {
    if (finished.has(text)) {
      const done = finished.get(text);
      finished.delete(text);
      return Promise.resolve(done);
    }
    const hit = recent.get(text);
    if (hit && Date.now() - hit.at < dedupeWindowMs) {
      log(`dedupe "${text}"`);
      return hit.promise;
    }
    let timedOut = false;
    const work = Promise.resolve(backend(text, { systemPrompt: SYSTEM_PROMPT }))
      .then((r) => fitToLens(r, maxChars))
      .catch((e) => {
        log(`backend error: ${e.message}`);
        return 'Sorry, my agent hit an error.';
      })
      .then((r) => {
        if (timedOut) finished.set(text, r);
        return r;
      });
    let timer;
    const slow = new Promise((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve('Still working on it. Ask me again in a moment.');
      }, replyTimeoutMs);
    });
    const promise = Promise.race([work, slow]).finally(() => clearTimeout(timer));
    recent.set(text, { at: Date.now(), promise });
    for (const [k, v] of recent) if (Date.now() - v.at > dedupeWindowMs * 4) recent.delete(k);
    return promise;
  }

  return createHttpServer(async (req, res) => {
    const send = (code, obj) => {
      const payload = JSON.stringify(obj);
      res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    };
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
    if (req.method !== 'POST' || req.url !== PATH) return send(404, { error: 'not found' });
    if (!tokenOk(req.headers.authorization, token)) return send(401, { error: 'bad token' });

    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return send(400, { error: 'invalid JSON' }); }
    const text = lastUserText(body);
    if (!text) return send(400, { error: 'no user message' });

    log(`request "${text}"`);
    const content = await answer(text);
    return send(200, {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? 'openclaw',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  });
}

async function main() {
  const { TOKEN, PORT = '3458', BIND = '127.0.0.1', BACKEND = 'echo', MAX_CHARS = '350' } = process.env;
  if (!TOKEN) {
    console.error('Set TOKEN to the same value you type into the Even app as the API key.');
    process.exit(1);
  }
  const backend = (await import(`./backends/${BACKEND}.mjs`)).default;
  const server = createServer({
    token: TOKEN,
    backend,
    maxChars: Number(MAX_CHARS),
    log: (m) => console.log(new Date().toISOString(), m),
  });
  server.listen(Number(PORT), BIND, () =>
    console.log(`Listening on http://${BIND}:${PORT}${PATH} (backend: ${BACKEND})`),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

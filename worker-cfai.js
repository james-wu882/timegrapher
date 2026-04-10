/**
 * Retomb AI Backend — Cloudflare Workers AI
 *
 * Uses Cloudflare's built-in AI inference. Zero extra cost on the free
 * plan, zero new accounts — it's part of Cloudflare Workers already.
 *
 * ── Honest caveat ────────────────────────────────────────────
 * Free tier: 10,000 "neurons"/day. A typical diagnosis request costs
 * roughly 500–1,000 neurons, giving you ~10–20 free requests per day.
 * This is fine for personal use or low-traffic testing. For a public
 * site, switch to worker-gemini.js (1,500 req/day free) or the main
 * worker.js (paid Anthropic, unlimited).
 *
 * ── Setup ────────────────────────────────────────────────────
 * 1. Add to wrangler.toml:
 *      [ai]
 *      binding = "AI"
 * 2. Rename this file to worker.js
 * 3. wrangler deploy
 * No API key or secret needed — AI binding uses your Cloudflare account.
 *
 * ── Models (pick one) ────────────────────────────────────────
 * @cf/meta/llama-3.1-8b-instruct       — good quality, moderate speed
 * @cf/mistral/mistral-7b-instruct-v0.1 — fast, decent quality
 * @cf/meta/llama-3-8b-instruct         — slightly older Llama 3
 * Full list: https://developers.cloudflare.com/workers-ai/models/
 */

const ALLOWED_ORIGINS = [
  'https://timegrapher.ai',
  'https://www.timegrapher.ai',
];

const LIMITS = {
  bodyBytes: 20_000,
  messages:  24,
  msgChars:  1_000,
  maxTokens: 900,
  rpmPerIp:  4,   // slightly lower for free tier
  rphPerIp:  20,
};

const CF_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const SYSTEM_PROMPT = `You are an expert watchmaker assistant embedded in the Retomb mechanical watch timegrapher app. Your sole purpose is to help users understand timegrapher readings and diagnose watch-related issues.

Only discuss topics related to mechanical watches, horology, timegrapher readings, watch servicing, regulation, beat error, amplitude, rate, BPH, lift angle, escapements, balance wheels, pallet forks, mainsprings, and watch repair.

If a message is off-topic, respond only with: "I can only help with mechanical watch questions. What would you like to know about your watch?"

When given readings: open with a one-sentence verdict, reference the actual numbers, rank causes by probability, separate DIY fixes from professional jobs. Be concise.

Reference values: Rate ±4–6 s/d excellent (COSC), ±15 acceptable. Beat error <0.5 ms excellent, <1.5 ms acceptable, >2.5 ms can cause stopping. Amplitude 220–310° healthy, 180–220° low, <180° critical.`;

// ── Rate limiting ─────────────────────────────────────────────
const rl = { min: new Map(), hour: new Map() };
function checkRate(ip) {
  const now = Date.now();
  const ms = Math.floor(now / 60_000);
  const hs = Math.floor(now / 3_600_000);
  const mk = `${ip}:${ms}`, hk = `${ip}:${hs}`;
  const mc = (rl.min.get(mk) || 0) + 1;
  const hc = (rl.hour.get(hk) || 0) + 1;
  rl.min.set(mk, mc); rl.hour.set(hk, hc);
  for (const [k] of rl.min)  if (!k.endsWith(`:${ms}`)) rl.min.delete(k);
  for (const [k] of rl.hour) if (!k.endsWith(`:${hs}`)) rl.hour.delete(k);
  return mc <= LIMITS.rpmPerIp && hc <= LIMITS.rphPerIp;
}

const ALLOWED_ROLES = new Set(['user', 'assistant']);
function validateMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > LIMITS.messages) return null;
  const out = [];
  for (const m of raw) {
    if (typeof m !== 'object' || !ALLOWED_ROLES.has(m.role) || typeof m.content !== 'string') return null;
    const content = m.content.replace(/<[^>]*>/g, '').trim().slice(0, LIMITS.msgChars);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  if (out[0].role !== 'user') return null;
  for (let i = 1; i < out.length; i++) if (out[i].role === out[i - 1].role) return null;
  return out;
}

const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
function cors(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
}
function jsonErr(msg, status, c) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...c, ...SEC, 'Content-Type': 'application/json' } });
}

// Workers AI streams in its own SSE format. Translate to Anthropic format.
// Workers AI emits: data: {"response":"text chunk","p":"..."}
function translateCFStream(cfStream) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  (async () => {
    const reader = cfStream.getReader();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') {
            await writer.write(enc.encode('data: [DONE]\n\n'));
            return;
          }
          try {
            const ev = JSON.parse(raw);
            const text = ev.response;
            if (typeof text === 'string' && text.length > 0) {
              const out = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
              await writer.write(enc.encode(`data: ${out}\n\n`));
            }
          } catch {}
        }
      }
    } finally {
      await writer.write(enc.encode('data: [DONE]\n\n')).catch(() => {});
      await writer.close().catch(() => {});
    }
  })();

  return readable;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    const ok     = ALLOWED_ORIGINS.includes(origin);
    const c      = cors(ok ? origin : ALLOWED_ORIGINS[0]);
    const all    = { ...c, ...SEC };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: all });
    if (request.method !== 'POST')    return jsonErr('Method not allowed.', 405, c);
    if (!ok)                          return jsonErr('Forbidden.', 403, c);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!checkRate(ip)) return new Response(
      JSON.stringify({ error: 'Too many requests — please wait before trying again.' }),
      { status: 429, headers: { ...all, 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );

    const cl = parseInt(request.headers.get('Content-Length') ?? '0', 10);
    if (cl > LIMITS.bodyBytes) return jsonErr('Request too large.', 413, c);

    let body;
    try {
      const text = await request.text();
      if (text.length > LIMITS.bodyBytes) throw 0;
      body = JSON.parse(text);
    } catch { return jsonErr('Invalid request body.', 400, c); }

    const messages = validateMessages(body.messages);
    if (!messages) return jsonErr('Invalid messages.', 400, c);

    // Prepend system prompt as first user turn (Workers AI doesn't support system role natively)
    const cfMessages = [
      { role: 'user', content: `[SYSTEM INSTRUCTIONS — follow these at all times]\n${SYSTEM_PROMPT}` },
      { role: 'assistant', content: 'Understood. I will only discuss mechanical watches and horology.' },
      ...messages,
    ];

    let stream;
    try {
      stream = await env.AI.run(CF_MODEL, {
        messages: cfMessages,
        stream: true,
        max_tokens: LIMITS.maxTokens,
      });
    } catch { return jsonErr('AI service error. Please try again.', 502, c); }

    return new Response(translateCFStream(stream), {
      status: 200,
      headers: { ...all, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' },
    });
  },
};

import type { APIRoute } from 'astro';

// A real endpoint, not a mailto: the visitor's booking reaches a Northbound
// inbox tagged with the demo it came from. Server-side, so the mail endpoint
// never ships to the browser.
//
// FORM_ENDPOINT is set in the Vercel project. The Formspree id that shipped in
// the descent (xpwzgvkn) returns FORM_NOT_FOUND — it is dead, which also means
// the main site's Floor 07 form is failing. Until a live endpoint is set, every
// submission is still written to the function log so nothing is silently lost.
export const prerender = false;

const FIELDS = ['name', 'phone', 'address', 'issue', 'preferred'] as const;

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON' }, 400);
  }

  const payload: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = body[f];
    if (typeof v === 'string' && v.trim()) payload[f] = v.trim().slice(0, 500);
  }
  if (!payload.name || !payload.phone) {
    return json({ error: 'Name and phone are required' }, 422);
  }

  payload.demo = 'atlas / Ridgeline Roofing';
  payload._subject = `Ridgeline Roofing (Atlas demo) — inspection request from ${payload.name}`;

  // Logged before the mail hop, so a dead endpoint costs the lead's delivery
  // but never the lead itself.
  console.log('[atlas:booking]', JSON.stringify({ at: new Date().toISOString(), ...payload }));

  const endpoint = import.meta.env.FORM_ENDPOINT ?? process.env.FORM_ENDPOINT;
  if (!endpoint) {
    return json({ error: 'No mail endpoint configured', logged: true }, 503);
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[atlas:booking] upstream', res.status, (await res.text()).slice(0, 200));
      return json({ error: 'Upstream rejected the submission', logged: true }, 502);
    }
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('[atlas:booking] transport', String(e));
    return json({ error: 'Could not reach the mail service', logged: true }, 502);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

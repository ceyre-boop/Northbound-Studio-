import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import content from '../../content/content.json';

// A real Checkout Session, created server-side. The client never sees a secret
// key and never sets a price — line prices are re-derived here from the
// catalogue, so a tampered cart cannot buy a $20 bag for $2.
export const prerender = false;

const KEY = () => import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;

type Line = { sku: string; variant: string; qty: number };

/** Authoritative price for a sku + variant, in cents. Never trust the client. */
function priceFor(sku: string, variant: string): { name: string; price: number } | null {
  const p = content.products.find((x) => x.sku === sku);
  if (!p) return null;
  let price = p.price;
  if (variant.includes('2lb') && 'sizeUpcharge' in p) price = (p as any).sizeUpcharge;
  if (variant.includes('$50') && 'valueUpcharge' in p) price = (p as any).valueUpcharge;
  return { name: p.name, price };
}

export const POST: APIRoute = async ({ request, url }) => {
  const secret = KEY();
  if (!secret) {
    // Honest failure beats a fake success: the drawer surfaces this verbatim.
    return json({ error: 'Checkout is not configured yet — Stripe test keys are pending.' }, 503);
  }
  if (!secret.startsWith('sk_test_')) {
    // A live key must never reach a demo store that invites strangers to pay.
    return json({ error: 'Refusing to run: STRIPE_SECRET_KEY is not a test key.' }, 500);
  }

  let body: { lines?: Line[]; fulfilment?: string };
  try { body = await request.json(); } catch { return json({ error: 'Expected JSON' }, 400); }

  const wanted = Array.isArray(body.lines) ? body.lines : [];
  if (!wanted.length) return json({ error: 'Your cart is empty' }, 422);

  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const l of wanted) {
    const resolved = priceFor(String(l.sku), String(l.variant ?? ''));
    if (!resolved) return json({ error: `Unknown product: ${l.sku}` }, 422);
    const qty = Math.max(1, Math.min(20, Number(l.qty) || 1));
    items.push({
      quantity: qty,
      price_data: {
        currency: 'usd',
        unit_amount: resolved.price,
        product_data: {
          name: resolved.name,
          description: String(l.variant ?? '').slice(0, 120) || undefined,
        },
      },
    });
  }

  const ship = body.fulfilment === 'ship';
  const origin = new URL(request.url).origin;
  const base = import.meta.env.BASE_URL;

  try {
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: items,
      success_url: `${origin}${base}/order?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${base}/shop`,
      // Pickup and shipping are genuinely different orders, so they get
      // genuinely different Stripe options rather than a cosmetic toggle.
      shipping_address_collection: ship ? { allowed_countries: ['US'] } : undefined,
      shipping_options: ship
        ? [{ shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 650, currency: 'usd' },
              display_name: 'USPS Priority — ships Friday',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 2 },
                maximum: { unit: 'business_day', value: 5 },
              },
            } }]
        : [{ shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 0, currency: 'usd' },
              display_name: 'Pick up at 123 Example St — ready this afternoon',
            } }],
      metadata: { demo: 'vector / Marrow Coffee', fulfilment: ship ? 'ship' : 'pickup' },
    });
    return json({ url: session.url }, 200);
  } catch (e) {
    console.error('[vector:checkout]', String(e));
    return json({ error: 'Stripe rejected the session. Nothing was charged.' }, 502);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

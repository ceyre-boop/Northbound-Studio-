import type { APIRoute } from 'astro';
import Stripe from 'stripe';

// The proof that there is a backend rather than a form-to-email. Stripe posts
// here on completed checkouts; the signature is verified before anything is
// trusted, and the result is logged where the shop owner can be shown it.
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
  const whSecret = import.meta.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get('stripe-signature');

  if (!secret || !whSecret) return new Response('Webhook not configured', { status: 503 });
  if (!sig) return new Response('Missing stripe-signature', { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = new Stripe(secret).webhooks.constructEvent(raw, sig, whSecret);
  } catch (e) {
    // An unverified payload is not an order. Never log it as one.
    console.warn('[vector:webhook] bad signature', String(e));
    return new Response('Signature verification failed', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    console.log('[vector:order]', JSON.stringify({
      at: new Date().toISOString(),
      session: s.id,
      total: s.amount_total,
      currency: s.currency,
      email: s.customer_details?.email ?? null,
      fulfilment: s.metadata?.fulfilment ?? null,
      livemode: s.livemode,
    }));
  }

  return new Response(JSON.stringify({ received: true, type: event.type }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

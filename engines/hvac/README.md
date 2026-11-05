# The booking engine — read me first

This is a booking-and-deposit flow for a heating and cooling company. A
customer says what's wrong, where, how soon and when, leaves a name and a
number, sees the price, and pays the deposit on Stripe's page. You get an
email the moment it's paid; they get a confirmation. Jobs with nothing to
pay up front (an estimate, say) come through as a request instead, and you
confirm by phone.

It is one HTML page, one config file and two small server functions. No
framework, no database, no monthly plugin. It runs on Vercel's free tier.

`NORTHBOUND.txt` in this folder says which commit it was built from.

## The one file to edit

`engine.config.json`. Business name, phone, hours, service area, the accent
colour, every service with its price, the after-hours fee, the property
types, the time windows. Prices are in cents (`8900` is $89.00). Each
service has:

| field | meaning |
|---|---|
| `due` | what the customer pays now, in cents. `0` means no payment: the booking becomes a request and you confirm by phone. |
| `total` | the whole price, if it is known. `0` means quoted on site. When `total` is more than `due`, the balance is shown as due when the job is done. |
| `label` | what the charge is called on Stripe and in the emails. |
| `note` | one honest line under the price. |

This file is served to the browser, so nothing private goes in it. The
inbox that receives bookings is an environment variable (below), not a
line in the config.

## Thirty minutes to live

1. **Put this folder in a Git repository** of its own and import it at
   vercel.com. The free tier is enough. Deploy once; it works as a
   request-only booking page immediately.
2. **Set the environment variables** in the Vercel project (Settings,
   Environment Variables), then redeploy:

   | variable | what |
   |---|---|
   | `NOTIFY_TO` | the inbox that gets every booking |
   | `RESEND_API_KEY` | from resend.com (free tier). Sends the emails. |
   | `FROM` | optional. A sender on a domain you have verified in Resend, like `Summit Heating <bookings@yourdomain.com>`. Without it the default sender only delivers to the Resend account owner, which is fine for testing and wrong for customers. |
   | `STRIPE_SECRET_KEY` | from stripe.com. Start with the test key (`sk_test_…`); switch to the live key when you are ready to take money. Without it, every booking is a request. |
   | `STRIPE_WEBHOOK_SECRET` | see step 3 |

3. **Tell Stripe where to report payments.** In the Stripe dashboard,
   Developers, Webhooks: add an endpoint at `https://your-site/api/webhook`
   for the event `checkout.session.completed`. Copy its signing secret into
   `STRIPE_WEBHOOK_SECRET` and redeploy.
4. **Test it once with the test key.** Book a visit on your site, pay with
   Stripe's test card `4242 4242 4242 4242`, and check that both emails
   arrive. Then swap in the live key.
5. **Put it on your site.** Link to it ("Book a visit") from your homepage,
   or point a subdomain like `book.yourdomain.com` at the Vercel project.

## What this is not

It is not a scheduling calendar. It takes the customer's preferred day and
window, and you confirm the slot by phone, which is how most trades actually
run. It does not store bookings anywhere but your inbox and your Stripe
dashboard; nothing to back up, nothing to leak.

## Help

A question about setup: hello@northbound-dev.com. Changing the engine for
you is a commission, not support; northbound-dev.com says what those cost.

License: LICENSE.md. One business, yours to keep and change, not yours to
resell.

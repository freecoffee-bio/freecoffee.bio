# FreeCoffee.bio

[![Support me on FreeCoffee](https://tip.freecoffee.bio/api/buttons/github.svg?creator=site)](https://tip.freecoffee.bio/)

> An open-source creator support page and digital storefront for Cloudflare Workers.

FreeCoffee.bio lets independent creators publish a profile, accept direct support, sell digital products, and manage their storefront from one admin area. Payments are configured for each creator and settle to the creator's own payment account; the platform records payment and order state but is not designed to act as a merchant of record.

> [!IMPORTANT]
> This project is provided for lawful use only. You are responsible for complying with the laws, tax obligations, and payment-provider rules that apply to your business. In particular, verify your payment, cryptocurrency, privacy, refund, and consumer-protection obligations before going live.

## Features

- **Creator pages:** customizable profile, social links, support copy, goals, gallery, posts, and page theme.
- **Direct support and digital products:** supporter checkout, product catalog, orders, and protected digital-file downloads.
- **Payments:** creator-configured Stripe and PayPal flows, plus Base mainnet native USDC payment tracking.
- **Creator-owned funds:** payment credentials and connected accounts are configured per creator; FreeCoffee.bio does not hold customer funds.
- **Account security:** email/password authentication, email verification, two-factor authentication, a one-time root-admin bootstrap, and a configurable admin path.
- **Operations UI:** manage creator settings, products, content, payment accounts, orders, notifications, email delivery, and media from the admin area.
- **D1-managed configuration:** payment, email, site, and S3-compatible storage settings are stored in Cloudflare D1 and managed through the admin UI. Sensitive values are not returned after saving.
- **Reliable notifications:** payment confirmation queues email deliveries in D1; Cloudflare Cron processes retries and delivery logs outside payment webhooks.
- **Media storage:** S3-compatible media storage for creator assets and a Cloudflare binding for digital product files.
- **Cloudflare-native deployment:** Astro server-side rendering on Workers, D1, KV, Email Workers, and Cron Triggers.

## Stack

- **Application:** Astro 7, React 19, TypeScript, Tailwind CSS, and shadcn/ui
- **Runtime:** Cloudflare Workers with the Astro Cloudflare adapter
- **Database:** Cloudflare D1, Drizzle ORM, and Drizzle Kit
- **Authentication:** Better Auth with two-factor authentication
- **Storage:** Cloudflare binding for product files and S3-compatible storage for media
- **Background work:** Cloudflare Cron Triggers and a D1-backed notification outbox

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/freecoffee-bio/freecoffee.bio)

Before deploying, create or bind the Cloudflare resources used by the Worker and update `wrangler.jsonc` with their production identifiers:

| Resource | Binding | Purpose |
| --- | --- | --- |
| D1 database | `DB` | Application data, configuration, orders, and notification outbox |
| KV namespace | `FREECOFFEE_KV` | Application key-value storage |
| Email Workers | `EMAIL` | Cloudflare email binding |
| Cron Trigger | N/A | Processes scheduled tasks and notification delivery |

Set the following deployment values:

| Name | Type | Description |
| --- | --- | --- |
| `ADMIN_PATH` | Worker variable | A non-obvious lowercase letter/number path segment for the admin area, such as `admin3q9527ko8`. |
| `BETTER_AUTH_SECRET` | Worker secret | A strong session-signing secret. Generate one with `openssl rand -base64 32`. |

Do **not** configure payment provider credentials, SMTP credentials, email-provider API keys, or S3-compatible storage credentials as Worker variables or secrets. Configure these in the admin UI after deployment; they are stored in D1 and are intentionally not shown again after saving.

### Manual deployment

```sh
npm install
npm run build
npm run db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler deploy
```

Set `ADMIN_PATH` through your Worker configuration or Wrangler configuration before the deploy. The `npm run deploy` script runs the remote D1 migration and deploys the Worker in one step after the bindings and secret are configured.

### First-time setup

1. Open `https://your-domain/install`.
2. Create the root administrator. This initialization flow can only be used once.
3. Sign in at `https://your-domain/<ADMIN_PATH>/login`.
4. In the admin area, configure the public site URL, creator profile, payment providers, email delivery, product files, and optional S3-compatible media storage.
5. Configure Stripe/PayPal webhooks with the endpoints shown by the relevant payment configuration. Keep the public site URL accurate so provider callback URLs are generated correctly.


## Updating an instance

A deployment created from this repository can use the included **Update Main** GitHub Actions workflow to synchronize with the upstream `main` branch.

> [!IMPORTANT]
> GitHub does not automatically copy workflows when a repository is created through one-click deployment. Create `.github/workflows/update-main.yml` in your instance repository and copy the [upstream workflow](https://github.com/freecoffee-bio/freecoffee.bio/blob/main/.github/workflows/update-main.yml) into it before using this feature.

To run an update:

1. Open your repository's **Actions** tab.
2. Select **Update Main**.
3. Choose **Run workflow** and confirm the target branch.
4. Cloudflare's Git integration can deploy the resulting commit automatically.

The workflow preserves your instance's `wrangler.jsonc` so resource bindings and deployment settings are not overwritten. Other local changes can be overwritten by an upstream update; keep custom work in a branch or backup before synchronizing.

## Troubleshooting

- **Cannot reach the admin area:** Use `/<ADMIN_PATH>/login`, and verify that the deployed `ADMIN_PATH` matches the configured path segment.
- **No administrator after deployment:** Visit `/install` to bootstrap the first root administrator. The route is unavailable after initialization.
- **Payments do not complete:** Confirm the public site URL in admin settings, payment-provider credentials, webhook configuration, and the creator payment account status. Browser redirects never mark a payment as paid; provider webhooks and chain confirmation are the source of truth.
- **Email is not sent:** Check **Notifications -> Delivery logs** first. `pending` deliveries wait for Cron; `retry` and `failed` include a delivery error. Do not send transactional mail directly from payment webhooks.
- **Media upload fails:** Verify the S3-compatible endpoint, bucket, credentials, and path-style option in the admin media settings. Saved secret values are not returned to the UI.
- **Digital downloads fail:** Verify the Worker binding used for product files and the product file metadata in the admin area.

## Project documentation

See the public [Development Guide](./docs/development.md) for local setup, database migrations, and project commands.

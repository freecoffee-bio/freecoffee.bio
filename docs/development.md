# Development Guide

This guide covers local development, database migrations, and project commands for FreeCoffee.bio.

## Requirements

- Node.js 22.12 or newer
- A Cloudflare account and Wrangler authentication only when working with remote resources

## Local development

Install dependencies, create your local environment file, apply the initial D1 schema, then start Astro in background mode:

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npx astro dev --background
```

The local site is served at `http://localhost:4321`.

Manage the background development server with:

```sh
npx astro dev status
npx astro dev logs
npx astro dev stop
```

Local-only values belong in the untracked `.dev.vars` file:

```dotenv
ADMIN_PATH=admin
BETTER_AUTH_SECRET=replace-with-a-strong-local-secret
```

Do not place payment-provider credentials, SMTP credentials, email-provider API keys, or S3-compatible storage credentials in `.dev.vars`. Configure them through the admin UI, where they are stored in D1.

### Resetting local state

Use a fresh Wrangler state directory to verify that the current migration can create the local database from scratch:

```sh
rm -rf .wrangler/state
npm run db:migrate:local
```

> [!WARNING]
> Deleting `.wrangler/state` permanently removes all local D1 and Miniflare data.

## Database migrations

During MVP development, the repository maintains one complete initial migration:

```text
migrations/0000_init.sql
```

When `src/db/schema.ts` changes, regenerate the complete initial schema instead of adding incremental compatibility migrations:

```sh
rm -rf .wrangler/state migrations
mkdir -p migrations/meta
printf '{\n  "version": "7",\n  "dialect": "sqlite",\n  "entries": []\n}\n' > migrations/meta/_journal.json
npm run db:generate
```

Drizzle assigns a random suffix to the generated `0000_*.sql` file. Rename it to `migrations/0000_init.sql`, then update the single `tag` in `migrations/meta/_journal.json` to `0000_init`. Keep the matching generated snapshot in `migrations/meta/`.

Validate the result before applying it remotely:

```sh
npm run db:migrate:local
```

This workflow intentionally does not preserve local development database data.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Astro development server. |
| `npm run build` | Build the Worker application. |
| `npm run preview` | Preview the production build locally. |
| `npm test` | Run the Node test suite. |
| `npm run db:generate` | Generate a Drizzle migration from `src/db/schema.ts`. |
| `npm run db:migrate:local` | Apply migrations to local D1. |
| `npm run db:migrate:remote` | Apply migrations to the configured remote D1 database. |
| `npm run generate-types` | Regenerate Cloudflare binding types. |
| `npm run deploy` | Apply remote D1 migrations and deploy the Worker. |

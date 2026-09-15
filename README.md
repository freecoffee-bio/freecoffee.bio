# FreeCoffee.bio

A creator support platform built with Astro and Cloudflare Workers. It supports creator pages, content publishing, digital products, and payment-based support.

## One-click deployment

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/freecoffee-bio/freecoffee.bio)

## Manual deployment

```sh
npm install
npm run build
npm run deploy
```

Configure your Cloudflare resources in `wrangler.jsonc` before manual deployment. Product and media files use the S3-compatible storage configured in the admin panel.

## Local development

```sh
npm install
npm run db:migrate:local
npm run dev
```

The development server runs at `http://localhost:4321`.

## Updating from CFFK

The one-click deployment creates an independent repository under your GitHub account. You can use GitHub Actions to sync the latest version from this repository.

> [!IMPORTANT]
> Due to GitHub security restrictions, repositories created by the one-click deployment do not automatically include GitHub Actions workflows. Create `.github/workflows/update-main.yml` in your repository, then copy the [update workflow](https://github.com/freecoffee-bio/freecoffee.bio/blob/main/.github/workflows/update-main.yml) from the upstream project and commit it.

After adding the workflow:

1. Open your GitHub repository and go to **Actions**.
2. Select the **Update Main** workflow.
3. Click **Run workflow**, select the target branch, and start the workflow.
4. The workflow fetches the `main` branch from `freecoffee-bio/freecoffee.bio` and pushes the update to your repository. Cloudflare's Git integration then detects the commit and deploys the new version automatically.

The workflow preserves your repository's current `wrangler.jsonc` to avoid overwriting D1 bindings and deployment settings. Apart from that file, upstream synchronization overwrites local changes that have not been merged. If you have customized the source code, back it up first or use a branch and pull request to review the update.

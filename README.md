# Northbound Studio

Agency landing page built as a static HTML/CSS/JS site.

## Core site sections

- Hero
- Why Us
- Packages
- Portfolio
- Reviews
- Application Form
- Domain + DNS Help
- Final CTA

## Repo + branch workflow

1. Push stable work to `main`.
2. Create and use `design-preview` for animation/layout experiments before merging to `main`.

## Build system decision

- This repository is pure HTML/CSS/JS, so no build step is required.
- If migrating to React, Vite, Next.js, Astro, or SvelteKit later, add the framework build command in the Pages workflow before deploy.

## GitHub Pages deployment

1. Go to **Settings → Pages**.
2. Set source to **GitHub Actions**.
3. The included workflow deploys on pushes to `main`.
4. Approve the first deployment run when prompted.

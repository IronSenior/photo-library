// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import keystatic from '@keystatic/astro';

import cloudflare from '@astrojs/cloudflare';

// The public base URL of the R2 bucket (or custom domain in front of it) that
// serves original photos, e.g. https://<bucket>.<account-id>.r2.dev
// Set it in `.env` as PUBLIC_R2_BASE_URL. Used so Astro's <Image /> component
// is allowed to fetch + optimize those remote originals at build time.
const r2Domains = [];
if (process.env.PUBLIC_R2_BASE_URL) {
  try {
    r2Domains.push(new URL(process.env.PUBLIC_R2_BASE_URL).hostname);
  } catch {
    // Ignore invalid URL, fall back to no remote domains (local assets only).
  }
}

// Keystatic's Admin UI (`/keystatic`) needs on-demand server rendering, which
// requires a server adapter. Content editing only ever happens locally via
// `npm run dev` (storage: local, git-based), so the integration is only
// loaded for the `astro dev` CLI command — it's entirely absent from
// production builds, keeping the deploy fully static/adapter-free.
const isDev = process.argv.includes('dev');

// https://astro.build/config
export default defineConfig({
  output: 'static',

  // Falls back to the default Cloudflare Pages URL so canonical links,
  // OG tags and the sitemap always have an absolute base — override with
  // PUBLIC_SITE_URL once a custom domain is attached.
  site: process.env.PUBLIC_SITE_URL || 'https://photopage.pages.dev',

  image: {
    domains: r2Domains,
    // Generates a real `srcset`/`sizes` on every <Image /> automatically
    // (deliverable: verifiable responsive images), without per-component
    // `widths`/`densities` props.
    layout: 'constrained',
    responsiveStyles: true,
  },

  integrations: [react(), sitemap(), ...(isDev ? [keystatic()] : [])],
  adapter: cloudflare()
});
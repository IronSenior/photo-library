# syntax=docker/dockerfile:1
#
# Builds the Astro site as static files and serves them with nginx.
# The site has no backend runtime (see project-definition.md §2), so the
# only thing that runs in the final image is a static file server — this
# is an alternative to Cloudflare Pages for self-hosting the same output.

# ---- Build stage --------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Public, non-secret build-time config baked into the static output.
# See .env.example — R2 credentials are never needed here, only the public
# base URL used by <Image /> to optimize remote originals, and the
# canonical site URL used for the sitemap/OG tags.
ARG PUBLIC_R2_BASE_URL=""
ARG PUBLIC_SITE_URL="https://photopage.pages.dev"
ENV PUBLIC_R2_BASE_URL=${PUBLIC_R2_BASE_URL} \
    PUBLIC_SITE_URL=${PUBLIC_SITE_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage -------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

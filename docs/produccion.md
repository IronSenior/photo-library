# Puesta en producción, paso a paso

Guía completa para pasar este repositorio de "funciona en mi máquina" a un
sitio público en producción, cubriendo Cloudflare R2 (imágenes), Cloudflare
Pages (hosting) y el flujo de publicación del día a día. Para una alternativa
autoalojada con Docker, ve directamente a la [sección 7](#7-alternativa-autoalojada-con-docker).

Antes de empezar necesitas:
- Una cuenta de Cloudflare (el plan gratuito es suficiente para todo lo de
  esta guía).
- El repositorio subido a un proveedor git soportado por Cloudflare Pages
  (GitHub o GitLab). Si todavía no lo has subido, ver [paso 1](#1-sube-el-repositorio-a-github-o-gitlab).

## 1. Sube el repositorio a GitHub o GitLab

Cloudflare Pages despliega conectándose directamente a un repositorio, no
aceptando un `git push` propio. Si el repo solo existe en local (como en este
proyecto, ver `git log`), créalo primero en GitHub/GitLab y empújalo:

```bash
# GitHub CLI (o crea el repo vacío desde la web y usa la URL que te dé)
gh repo create tu-usuario/photopage --private --source=. --remote=origin
git push -u origin main
```

Si prefieres no usar la CLI de GitHub: crea un repositorio vacío en la web
(sin README/licencia, para no chocar con el historial existente), luego:

```bash
git remote add origin git@github.com:tu-usuario/photopage.git
git push -u origin main
```

## 2. Crea el bucket de R2 para las fotos originales

1. En el [dashboard de Cloudflare](https://dash.cloudflare.com/), ve a **R2
   object storage** → **Create bucket**.
2. Ponle un nombre (por ejemplo `photopage-originals`) y déjalo en la
   ubicación automática ("Location: Automatic").
3. Activa el acceso público al bucket. Tienes dos opciones — **usa la que
   corresponda a tu caso**:
   - **Dominio propio delante del bucket (recomendado para producción)**:
     bucket → **Settings** → **Custom Domains** → **Add**, indica un
     subdominio que ya esté en tu cuenta de Cloudflare (ej.
     `media.tu-dominio.com`) y confirma. Tarda unos minutos en pasar de
     *Initializing* a *Active*.
   - **URL pública de desarrollo (`*.r2.dev`)**: bucket → **Settings** →
     **Public Development URL** → **Enable** (tendrás que escribir `allow`
     para confirmar). Cloudflare documenta explícitamente que esta URL está
     **limitada en tasa de peticiones y pensada para desarrollo, no para
     producción** — válida para empezar/mientras no tengas dominio propio,
     pero si el sitio recibe tráfico real conviene migrar a un dominio
     propio delante del bucket más adelante (mismo bucket, sin tocar código:
     solo cambia `PUBLIC_R2_BASE_URL`).
4. Copia la URL pública resultante (`https://pub-xxxx.r2.dev` o
   `https://media.tu-dominio.com`) — la necesitarás en el paso 4 como
   `PUBLIC_R2_BASE_URL`.

## 3. Crea un token de API de R2 (solo para subir fotos, no lo usa el build)

Este token es para tus herramientas de subida (`rclone`, `aws s3`, etc.) en tu
máquina o CI de gestión de fotos — **el build de Astro/Cloudflare Pages nunca
lo necesita**, así que no se configura en Pages.

1. Dashboard → **R2 object storage** → **Manage API Tokens** (en *Account
   details*).
2. **Create Account API token** (o *User API token* si prefieres que dependa
   de tu usuario personal).
3. Permisos: **Object Read & Write**, y limita el alcance al bucket creado en
   el paso 2 en vez de "todos los buckets".
4. Al crearlo, Cloudflare te muestra **Access Key ID** y **Secret Access
   Key** una sola vez — cópialos ya, no se pueden volver a ver.
5. Guárdalos en tu gestor de contraseñas o en un `.env` local (nunca en git):
   ```bash
   cp .env.example .env
   ```
   y rellena `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME`. El *endpoint* S3-compatible del bucket es
   `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` (tu ID de cuenta está
   en el dashboard, barra lateral derecha de cualquier página del dominio).

## 4. Crea el proyecto en Cloudflare Pages

1. Dashboard → **Workers & Pages** → **Create** → pestaña **Pages** →
   **Connect to Git**.

   > **Importante**: usa la pestaña **Pages**, no "Import a repository"
   > desde Workers. Ese segundo flujo crea un *Worker* gestionado con
   > Wrangler (pide un campo separado **"Deploy command"**, normalmente
   > `npx wrangler deploy`) pensado para proyectos con `wrangler.toml`. Este
   > repo no tiene Worker ni configuración de Wrangler — es un sitio 100%
   > estático, así que solo necesita el flujo clásico de Pages: build
   > command + directorio de salida, sin deploy command aparte (el
   > despliegue es automático en cuanto el build termina).
2. Autoriza el acceso y elige el repositorio subido en el paso 1.
3. Configuración de build (Cloudflare detecta el preset "Astro"; verifica
   que quede así):
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. **Environment variables** (mismo formulario, antes de desplegar o luego
   en *Settings → Environment variables*) — solo las variables `PUBLIC_*`,
   nunca las credenciales de R2 del paso 3:
   | Variable | Valor |
   | --- | --- |
   | `PUBLIC_R2_BASE_URL` | la URL pública del bucket del paso 2 |
   | `PUBLIC_SITE_URL` | déjala vacía por ahora; en el primer deploy Cloudflare te asigna un dominio `*.pages.dev` — vuelve aquí y ponlo (ej. `https://photopage.pages.dev`) para que el sitemap/OG usen la URL real, luego re-despliega |
5. El repo ya fija la versión de Node.js necesaria con el archivo
   [.node-version](.node-version) (`22`) — Astro 7 requiere Node `^20.19` o
   `>=22.12`, y el build de Cloudflare Pages lo detecta automáticamente sin
   configuración adicional en el dashboard.
6. **Save and Deploy**. Sigue el log de build en el dashboard; debe terminar
   con `[build] Complete!` igual que en local con `npm run build`.

## 5. Verifica el primer despliegue

Con el dominio `*.pages.dev` que te asignó Cloudflare:

- `/` carga con el hero y la cuadrícula de fotos destacadas.
- `/viajes` muestra el mapa Leaflet con clustering (requiere JS del cliente,
  comprueba con la consola del navegador que no haya errores).
- Vista de código fuente de cualquier ficha (`/fauna/especie/...`) contiene
  `srcset=` en las etiquetas `<img>` — confirma que las imágenes responsive
  se generaron correctamente.
- `/robots.txt` y `/sitemap-index.xml` responden 200.
- `/keystatic` **no debe existir** en producción (404 esperado) — el CMS
  solo vive en `npm run dev` en local, por diseño (ver
  [README.md](README.md#desarrollo-local)).

## 6. Dominio propio (opcional)

Si más adelante añades un dominio propio, en el proyecto de Pages: **Custom
domains** → **Set up a custom domain** → sigue el asistente (crea el
registro DNS automáticamente si el dominio ya está en la misma cuenta de
Cloudflare). Cloudflare emite el certificado TLS automáticamente. Después:

1. Actualiza `PUBLIC_SITE_URL` en las variables de entorno del proyecto al
   nuevo dominio.
2. Vuelve a desplegar (Deployments → ⋯ → Retry deployment, o simplemente haz
   push de un commit) para que el sitemap/canonical/OG usen la URL nueva.

## 7. Alternativa autoalojada con Docker

Si no quieres usar Cloudflare Pages (por ejemplo, para alojarlo en tu propio
VPS), el repo incluye un `Dockerfile`/`docker-compose.yml` que compila el
mismo sitio estático y lo sirve con nginx — ver la sección
["Despliegue con Docker" del README](README.md#despliegue-con-docker-alternativa-a-cloudflare-pages)
para los comandos. Puntos a tener en cuenta que no aplican con Pages:

- **HTTPS no viene incluido**: el contenedor nginx solo sirve HTTP en el
  puerto 80. En un VPS real, pon un proxy inverso delante (Caddy, Traefik, o
  el propio Cloudflare en modo proxy/naranja con "Full" SSL) para servir TLS.
- **`PUBLIC_R2_BASE_URL`/`PUBLIC_SITE_URL` son *build args*, no variables de
  runtime**: si cambian, hay que reconstruir la imagen
  (`docker compose up --build`), no solo reiniciar el contenedor.
- Sigue sin haber backend/base de datos dentro del contenedor — el flujo de
  publicación de fotos (paso 8) es idéntico: edita en local con Keystatic,
  haz commit/push, y despliega (aquí, reconstruyendo y desplegando la imagen
  tú mismo, en vez de que Cloudflare lo haga automáticamente).

## 8. Flujo de publicación del día a día

Una vez desplegado, añadir fotos nuevas **no requiere repetir nada de esta
guía** — es el flujo normal descrito en
[README.md → "Cómo añadir una foto nueva"](README.md#cómo-añadir-una-foto-nueva-flujo-de-publicación):
subir el original a R2, editar en Keystatic en local (`npm run dev`), hacer
commit/push, y Cloudflare Pages despliega automáticamente en cada push (o,
si usas Docker, reconstruyes/despliegas la imagen manualmente).

## 9. Checklist rápido de producción

- [ ] Repo en GitHub/GitLab, conectado a un proyecto de Cloudflare Pages.
- [ ] Bucket R2 creado con acceso público (dominio propio o `r2.dev`).
- [ ] Token de API de R2 creado y guardado fuera del repo (solo para subir
      fotos, no configurado en Pages).
- [ ] `PUBLIC_R2_BASE_URL` y `PUBLIC_SITE_URL` configuradas en Pages
      (Settings → Environment variables).
- [ ] Primer deploy completado sin errores (`[build] Complete!`).
- [ ] `srcset`, mapa de `/viajes`, `robots.txt`, `sitemap-index.xml`
      verificados en el dominio público.
- [ ] `/keystatic` devuelve 404 en producción (esperado).
- [ ] (Opcional) Dominio propio conectado y `PUBLIC_SITE_URL` actualizado.

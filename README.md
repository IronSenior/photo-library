# Objetivo Salvaje — Portfolio fotográfico

Portfolio fotográfico de fauna, viajes y eventos, con taxonomía jerárquica propia
(Clase → Orden → Familia → Especie, País → Lugar → Viaje, Eventos), construido con
[Astro](https://astro.build) + [Keystatic](https://keystatic.com) como CMS headless
basado en git. Sin backend runtime ni base de datos: todo el contenido vive como
JSON versionado en el repo.

## Stack

- **Astro** (salida 100% estática, `output: 'static'`).
- **Keystatic** (`storage: local`) como interfaz de edición de contenido — solo se
  usa en local durante `npm run dev`; no forma parte del build de producción.
- **Cloudflare R2** para las fotos originales (sin coste de egress).
- **Cloudflare Pages** para el hosting.
- **Leaflet + OpenStreetMap** (con `leaflet.markercluster`) para el mapa de `/viajes`.

## Requisitos

- Node.js `^20.19` o `>=22.12`.

## Desarrollo local

```bash
npm install
npm run dev
```

- El sitio se sirve en `http://localhost:4321`.
- La interfaz de edición de contenido (Keystatic) está disponible en
  `http://localhost:4321/keystatic` **solo durante `npm run dev`** — no existe en
  el build de producción (`npm run build`), porque requeriría un servidor con
  adaptador y el sitio se despliega como archivos estáticos.

## Cómo añadir una foto nueva (flujo de publicación)

1. **Sube la foto original a Cloudflare R2** (bucket configurado como origen
   público/no-egress). Puedes usar `rclone`, el cliente `aws s3` apuntando al
   endpoint de R2, o el panel de Cloudflare. Copia la URL pública resultante
   (por ejemplo `https://<tu-bucket>.r2.dev/fauna/mi-foto.jpg`, o tu dominio
   personalizado si tienes uno delante del bucket).
2. **Arranca el sitio en local**: `npm run dev`.
3. **Abre `http://localhost:4321/keystatic`** y entra en la colección que
   corresponda:
   - *Fauna · Fotos* — elige o crea primero la especie en *Fauna · Especies* si
     es una especie nueva (clase, orden, familia, nombre científico...).
   - *Viajes · Fotos* — elige o crea primero el viaje/lugar en *Viajes*.
   - *Eventos · Fotos* — elige o crea primero el evento en *Eventos*.
4. **Crea la entrada de foto**: pega la URL pública de R2 en el campo `imagen`,
   completa título, fecha, ubicación, coordenadas (opcional, usadas por el mapa
   en viajes), ancho/alto (dimensiones reales del original, usadas para el
   `srcset` cuando la imagen es remota), equipo (cámara/objetivo, si no se puede
   extraer del EXIF automáticamente) y tags libres.
5. **Guarda desde Keystatic**: crea el archivo JSON correspondiente directamente
   en tu copia local del repositorio (`src/content/...`).
6. **Revisa el `git diff`, haz commit y push** como con cualquier otro cambio de
   código:
   ```bash
   git add src/content
   git commit -m "Añade foto: mi-foto"
   git push
   ```
7. **Cloudflare Pages despliega automáticamente** en cada push a la rama de
   producción — no hace falta ejecutar ningún build manualmente.

No es necesario abrir un editor de código para rellenar los campos: Keystatic
genera el JSON correcto. Sí se necesita un cliente git (o la propia terminal)
para subir el cambio al repositorio, ya que no hay backend ni base de datos que
persista el contenido por su cuenta.

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores. Ninguna de estas variables
contiene secretos que deban usarse en el build de producción del sitio en sí:

| Variable | Uso | Dónde se obtiene |
| --- | --- | --- |
| `PUBLIC_R2_BASE_URL` | URL pública base del bucket de R2 (o dominio propio delante de él). Se usa para autorizar ese dominio en `astro.config.mjs` (`image.domains`) y así permitir que `<Image />` optimice los originales remotos. | Cloudflare dashboard → R2 → tu bucket → *Public access* (URL `r2.dev` o dominio personalizado). |
| `PUBLIC_SITE_URL` | URL absoluta del sitio, usada para el sitemap, `canonical` y metadatos Open Graph. Por defecto `https://photopage.pages.dev`. | Se actualiza cuando cambie el subdominio de Cloudflare Pages o se añada un dominio propio. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Credenciales **solo para herramientas de subida** (`rclone`, `aws s3`, etc.) al gestionar los originales. **No las usa el build de Astro** ni deben añadirse como variables del proyecto en Cloudflare Pages. | Cloudflare dashboard → R2 → *Manage R2 API Tokens* → crear token con permisos de escritura sobre el bucket. |

## Despliegue en Cloudflare Pages

1. Conecta el repositorio en el dashboard de Cloudflare Pages.
2. Configuración de build:
   - **Comando de build**: `npm run build`
   - **Directorio de salida**: `dist`
3. Variables de entorno del proyecto (Settings → Environment variables), solo
   las necesarias en build/runtime del sitio estático:
   - `PUBLIC_R2_BASE_URL`
   - `PUBLIC_SITE_URL` (opcional; usa el dominio de Pages por defecto si se omite)
4. **No añadas** `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` como
   variables del proyecto en Pages: son credenciales de subida de archivos, no
   se usan durante el build del sitio y no deben exponerse ahí.
5. Cada push a la rama de producción dispara un build y despliegue automáticos.

## Despliegue con Docker (alternativa a Cloudflare Pages)

El sitio es 100% estático, así que la imagen Docker solo compila el sitio en
un stage de Node y lo sirve con nginx en el stage final — no hay backend
runtime ni base de datos dentro del contenedor.

```bash
cp .env.example .env   # rellena PUBLIC_R2_BASE_URL / PUBLIC_SITE_URL si aplica
docker compose up --build -d
```

El sitio queda disponible en `http://localhost:8080`. `PUBLIC_R2_BASE_URL` y
`PUBLIC_SITE_URL` se pasan como *build args* (ver [docker-compose.yml](docker-compose.yml))
porque Astro los incrusta en el HTML/imágenes generados en build time, no en
runtime — no hace falta reiniciar el contenedor para cambiarlos, hace falta
reconstruir la imagen (`docker compose up --build`).

Para construir y ejecutar sin `docker compose`:

```bash
docker build -t photopage \
  --build-arg PUBLIC_R2_BASE_URL=https://tu-bucket.r2.dev \
  --build-arg PUBLIC_SITE_URL=https://tu-dominio.com \
  .
docker run --rm -p 8080:80 photopage
```

Igual que en Cloudflare Pages, las credenciales de R2
(`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) no se usan aquí:
solo son necesarias en tu máquina/CI para subir fotos al bucket.

## Estructura de contenido

```
src/content/
  species/        # Especies (Clase/Orden/Familia) — src/content.config.ts
  fauna-photos/    # Fotos de fauna, referencian una especie
  travels/         # Viajes/lugares (País/Lugar)
  travel-photos/   # Fotos de viajes, referencian un viaje
  events/          # Eventos (concierto/conferencia/otro)
  event-photos/    # Fotos de eventos, referencian un evento
```

El esquema completo de cada colección está en [src/content.config.ts](src/content.config.ts)
(consumido por Astro) y en [keystatic.config.ts](keystatic.config.ts) (consumido
por la interfaz de edición) — deben mantenerse alineados si se añaden campos.

## Scripts

- `npm run dev` — servidor de desarrollo + Keystatic.
- `npm run build` — build estático de producción (`dist/`).
- `npm run preview` — sirve el build de producción en local.
- `npm run check` — comprobación de tipos de Astro.

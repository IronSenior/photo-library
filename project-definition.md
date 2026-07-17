# Especificación técnica — Portfolio fotográfico público con taxonomía jerárquica

## 1. Objetivo

Sitio web público, tipo portfolio artístico, para publicar y organizar fotografía de fauna, viajes y eventos, con una jerarquía de categorías propia (no tags planos). Debe ser visualmente cuidado (no plantilla de galería genérica) pero fácil de mantener: añadir fotos y metadatos no debe requerir tocar código.

## 2. Stack

- **Framework**: Astro (SSG). Optimización de imágenes integrada (`astro:assets`), rendimiento alto por defecto, control total del markup/CSS.
- **Contenido y taxonomía**: Content Collections de Astro + **Keystatic** como CMS headless basado en git (UI de edición local o desplegada, sin backend propio ni base de datos).
- **Imágenes originales**: **Cloudflare R2**, decisión definitiva. Tier gratuito de 10 GB de almacenamiento y, sobre todo, **sin coste de egress** (a diferencia de S3, donde servir tráfico de imágenes públicas sí se paga) — es la opción más barata disponible para este caso de uso. Si el volumen de fotos supera los 10 GB gratuitos, el coste de almacenamiento adicional en R2 es de los más bajos del mercado (~0,015 $/GB/mes) y sigue sin cobrar salida. Variantes responsive generadas en build time con `sharp`/`astro:assets`, así que el original en R2 no se sirve nunca directamente.
- **Hosting**: **Cloudflare Pages**, tier gratuito (builds y ancho de banda ilimitados para este volumen de tráfico). Al usar también R2 para las imágenes, todo el proyecto queda dentro del mismo proveedor, lo que simplifica la configuración de CORS/acceso entre el sitio y el bucket.
- **Dominio**: se usará el subdominio gratuito que ofrece Cloudflare Pages (`*.pages.dev`) mientras no haya dominio propio. La implementación no debe acoplarse a ningún dominio concreto — nada de URLs absolutas hardcodeadas — para poder añadir un dominio propio más adelante sin tocar código.
- **Sin backend runtime, sin base de datos**. Todo el contenido vive como archivos (Markdown/MDX + frontmatter, o colecciones JSON) versionados en git. Esto simplifica drásticamente el mantenimiento y el coste (0€/mes en el rango de tráfico esperado).

No usar CMS SaaS cerrados (Squarespace, Format.com) ni plataformas de galería (Piwigo, Chevereto, Lychee): no permiten modelar la jerarquía tal cual se necesita y limitan el diseño.

## 3. Modelo de contenido (taxonomía)

Tres colecciones de nivel superior, cada una con su propia jerarquía. Diseñar como **content collections anidadas por referencia**, no por carpetas rígidas, para poder reclasificar sin mover archivos físicamente.

### 3.1 Fauna

Jerarquía: `Clase → Orden → Familia (opcional) → Especie`

Cada **especie** es una entidad de taxonomía (`src/content/species/*.json` o `.md`):
```yaml
id: aguila-imperial-iberica
nombre_comun: "Águila imperial ibérica"
nombre_cientifico: "Aquila adalberti"
clase: aves
orden: accipitriformes
familia: accipitridae
estado_conservacion: "En peligro" # opcional, IUCN
descripcion: "..."
```

Cada **foto** referencia una especie por `id`, no repite la jerarquía:
```yaml
id: foto-0142
especie: aguila-imperial-iberica
fecha: 2025-03-12
ubicacion: "Doñana, Huelva"
lat: 37.0
lng: -6.5
imagen: /fauna/aguila-imperial-iberica/0142.jpg
titulo: "..."
equipo: "opcional: cámara/objetivo"
destacada: true # para portada/hero
```

La página de una especie agrupa automáticamente todas las fotos que la referencian; la página de una clase/orden agrupa todas las especies hijas. Esto evita reclasificar fotos manualmente si cambias de opinión sobre el árbol taxonómico: solo tocas la especie.

### 3.2 Viajes

Jerarquía: `País → Región/Lugar → (Viaje/fecha opcional)`

```yaml
id: donana-2025
pais: espana
lugar: "Doñana"
fecha_inicio: 2025-03-10
fecha_fin: 2025-03-14
descripcion: "..."
```

Fotos referencian `viaje_id` igual que en fauna. Un lugar puede tener varias visitas/viajes en el tiempo — no forzar una única entrada por lugar.

### 3.3 Eventos

Estructura plana o con subtipo (`tipo: concierto | conferencia | otro`), sin jerarquía profunda salvo que lo necesites:
```yaml
id: barcelona-software-crafters-2025
nombre: "Barcelona Software Crafters"
tipo: conferencia
fecha: 2025-05-20
lugar: "Barcelona"
```

### 3.4 Reglas transversales
- Toda foto tiene: id, imagen(es), fecha, ubicación (opcional pero recomendable para fauna/viajes), título/pie, y exactamente una categoría raíz (fauna | viaje | evento).
- Una foto puede llevar tags libres adicionales (ej. "blanco y negro", "vuelo") para filtros secundarios, sin que sustituyan la jerarquía.
- Los metadatos EXIF (cámara, objetivo, exposición) se extraen automáticamente en build si están disponibles; el campo manual `equipo` es solo fallback.

## 4. Estructura de páginas / rutas

```
/                          → home portfolio: selección curada, hero, últimas fotos destacadas
/fauna                     → árbol de clases/órdenes, entrada visual
/fauna/[clase]             → ej. /fauna/aves
/fauna/[clase]/[orden]     → ej. /fauna/aves/rapaces
/fauna/especie/[id]        → ficha de especie + galería de fotos de esa especie
/viajes                    → mapa interactivo (ver sección 5.1) + lista de países/lugares
/viajes/[pais]
/viajes/[pais]/[lugar]
/eventos
/eventos/[id]
/foto/[id]                 → vista individual ampliada (lightbox/página propia, útil para compartir enlace directo)
/sobre-mi                  → bio, equipo, canales (Outdoor.Pepe, SoyPepe.Lab)
```

Cada nivel de jerarquía debe ser navegable con breadcrumbs (ej. Fauna > Aves > Rapaces > Águila imperial ibérica).

## 5. Requisitos de UI/UX

- Diseño propio, no plantilla de galería genérica de cuadrícula uniforme — permitir layouts con jerarquía visual (foto destacada grande + secundarias), coherente con estética de portfolio de naturaleza/documental.
- Modo oscuro por defecto o disponible (habitual en portfolios fotográficos, resalta el color de las fotos).
- Lightbox para ampliar fotos sin salir de la página, con navegación anterior/siguiente dentro de la misma categoría.
- Filtro/buscador simple por especie, lugar o tag, además de la navegación jerárquica.
- Totalmente responsive, prioridad a mobile (probable origen de gran parte del tráfico si compartes en redes).

### 5.1 Mapa interactivo (`/viajes`)

Requisito explícito, no opcional. Un pin por lugar (usando el campo `lat`/`lng` de la foto o del viaje), agrupado por clúster cuando hay varios lugares cercanos. Al hacer clic en un pin, abre una preview con la foto destacada del lugar y enlace a `/viajes/[pais]/[lugar]`.

Implementación recomendada para mantener coste cero:
- **Leaflet** (librería JS, gratuita, sin API key) + **tiles de OpenStreetMap** (gratis, sin límite de uso razonable para tráfico personal) — evitar Google Maps o Mapbox, que tienen tiers de pago que se pueden disparar con tráfico o requieren API key facturable.
- Plugin `leaflet.markercluster` para agrupar pines cuando hay muchos lugares cercanos (ej. varios puntos dentro de Doñana).
- El mapa se hidrata en cliente (isla de Astro, `client:visible` o `client:idle`) ya que Leaflet necesita DOM/browser; el resto de la página sigue siendo estática.
- Fauna también puede aprovechar el mismo componente de mapa si más adelante quieres un mapa de avistamientos, pero eso queda fuera de v1 salvo que se decida lo contrario.
- Tiempos de carga: lazy loading de imágenes, `srcset`/`sizes` responsive, formato WebP/AVIF con fallback.
- Metadatos Open Graph por foto/página para que se vea bien al compartir en redes (título, imagen, descripción).

## 6. Rendimiento y SEO

- Astro genera HTML estático: SEO por defecto muy bueno, pero definir explícitamente:
  - `<title>` y meta description por página (especie, lugar, evento).
  - Sitemap.xml y robots.txt automáticos (integración oficial de Astro).
  - Datos estructurados schema.org tipo `ImageObject`/`Photograph` opcional, mejora indexación en Google Imágenes.
- Imágenes servidas en tamaños múltiples según viewport; nunca la original de la cámara directamente.

## 7. Flujo de publicación (cómo añades fotos en el día a día)

1. Subir la foto original a R2 (o carpeta local sincronizada, según decisión final de almacenamiento).
2. Entrar en la UI de Keystatic (local `npm run dev` o desplegada con auth), crear/editar la entrada de foto: elegir especie/lugar/evento existente o crear uno nuevo si es la primera vez.
3. Commit automático de Keystatic al repo git (o revisión manual antes de merge, según prefieras control).
4. Deploy automático en cada push (CI de Cloudflare Pages/Vercel).

No se requiere abrir un editor de código para publicar una foto nueva del día a día.

## 8. Fuera de alcance (v1)

- Comentarios de visitantes, sistema de likes.
- Venta de impresiones / e-commerce (dejar la puerta abierta para v2 si interesa).
- Multi-idioma (valorar si quieres ES/EN dado que tienes audiencia bilingüe, pero no es v1 salvo que se indique).
- Login de usuarios / áreas privadas — el sitio es 100% público.

## 9. Entregables esperados de la implementación

1. Repositorio Astro funcionando en local con Keystatic configurado y las 3 colecciones (fauna, viajes, eventos) + colección de especies como entidad separada referenciada.
2. Al menos una página de cada nivel de jerarquía implementada y navegable con datos de ejemplo (seed data).
3. Pipeline de imágenes responsive funcionando (verificable inspeccionando el HTML generado: `srcset` presente).
4. Documentación breve (README) de cómo añadir una foto nueva paso a paso, para que el flujo del punto 7 quede claro sin depender de memoria.
5. Configuración de deploy lista en Cloudflare Pages, con las variables de entorno de acceso a R2 documentadas en el README (nombres de variable, dónde se generan las credenciales, sin exponer secretos en el repo).
6. Mapa interactivo funcional en `/viajes` con al menos 2-3 lugares de ejemplo, clustering incluido, y preview al hacer clic en un pin.

## 10. Decisiones ya cerradas (no reabrir sin motivo)

- Almacenamiento: Cloudflare R2 (tier gratuito + sin egress).
- Hosting: Cloudflare Pages, subdominio `.pages.dev`, sin dominio propio de momento.
- Sin multi-idioma en v1.
- Mapa interactivo obligatorio en v1: Leaflet + OpenStreetMap (sin Google Maps/Mapbox, para evitar costes).
// Build-time content collections — see project-definition.md §3 for the
// taxonomy this mirrors, and keystatic.config.ts for the Admin UI that
// authors these same files (paths below MUST stay in sync with the `path`
// option of each Keystatic collection).
import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Fields shared by every "foto" entry (fauna, viajes, eventos).
const photoSchema = z.object({
  titulo: z.string(),
  fecha: z.coerce.date(),
  ubicacion: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  imagen: z.string(),
  // Only used when `imagen` is a remote URL (R2), since Astro can't infer
  // dimensions of a remote asset without them. Ignored for local demo assets.
  ancho: z.number().optional(),
  alto: z.number().optional(),
  equipo: z.string().optional(),
  destacada: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
});

const species = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/species' }),
  schema: z.object({
    nombre_comun: z.string(),
    nombre_cientifico: z.string(),
    clase: z.string(),
    orden: z.string(),
    familia: z.string().optional(),
    estado_conservacion: z.string().optional(),
    descripcion: z.string().optional(),
  }),
});

const faunaPhotos = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/fauna-photos' }),
  schema: photoSchema.extend({
    especie: reference('species'),
  }),
});

const travels = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/travels' }),
  schema: z.object({
    pais: z.string(),
    lugar: z.string(),
    fecha_inicio: z.coerce.date().optional(),
    fecha_fin: z.coerce.date().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    descripcion: z.string().optional(),
  }),
});

const travelPhotos = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/travel-photos' }),
  schema: photoSchema.extend({
    viaje: reference('travels'),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/events' }),
  schema: z.object({
    nombre: z.string(),
    tipo: z.enum(['concierto', 'conferencia', 'otro']).default('otro'),
    fecha: z.coerce.date(),
    lugar: z.string().optional(),
    descripcion: z.string().optional(),
  }),
});

const eventPhotos = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/event-photos' }),
  schema: photoSchema.extend({
    evento: reference('events'),
  }),
});

export const collections = {
  species,
  faunaPhotos,
  travels,
  travelPhotos,
  events,
  eventPhotos,
};

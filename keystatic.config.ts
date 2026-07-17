// Keystatic Admin UI config — local git-based CMS, dev-only (no backend/adapter
// needed; this file only affects `astro dev`, the static build for Cloudflare
// Pages does not include /keystatic).
//
// Paths here MUST match the `base` directories used by the loaders in
// `src/content.config.ts` so that photos/entries created through the Admin UI
// are picked up by Astro's content collections.
import { config, fields, collection } from '@keystatic/core';

const estadoConservacionOptions = [
  { label: 'Sin evaluar', value: 'sin-evaluar' },
  { label: 'Preocupación menor', value: 'preocupacion-menor' },
  { label: 'Casi amenazada', value: 'casi-amenazada' },
  { label: 'Vulnerable', value: 'vulnerable' },
  { label: 'En peligro', value: 'en-peligro' },
  { label: 'En peligro crítico', value: 'en-peligro-critico' },
];

const tipoEventoOptions = [
  { label: 'Concierto', value: 'concierto' },
  { label: 'Conferencia', value: 'conferencia' },
  { label: 'Otro', value: 'otro' },
];

// Fields shared by every "foto" entry (fauna, viajes, eventos), per the
// transversal rules in project-definition.md §3.4.
function photoFields() {
  return {
    titulo: fields.slug({ name: { label: 'Título' } }),
    fecha: fields.date({ label: 'Fecha' }),
    ubicacion: fields.text({
      label: 'Ubicación',
      description: 'Texto libre, ej. "Doñana, Huelva"',
    }),
    lat: fields.number({ label: 'Latitud', description: 'Opcional, para el mapa de /viajes' }),
    lng: fields.number({ label: 'Longitud', description: 'Opcional, para el mapa de /viajes' }),
    imagen: fields.text({
      label: 'URL de la imagen',
      description:
        'URL pública del bucket R2 en producción (https://...), o ruta relativa dentro de src/assets/photos para fotos de ejemplo (ej. fauna/aguila-0142.jpg).',
      validation: { isRequired: true },
    }),
    ancho: fields.number({
      label: 'Ancho original (px)',
      description: 'Solo necesario cuando "Imagen" es una URL remota (no se puede inferir en build).',
    }),
    alto: fields.number({
      label: 'Alto original (px)',
      description: 'Solo necesario cuando "Imagen" es una URL remota (no se puede inferir en build).',
    }),
    equipo: fields.text({
      label: 'Equipo (cámara/objetivo)',
      description: 'Fallback manual si la foto no tiene metadatos EXIF legibles',
    }),
    destacada: fields.checkbox({ label: 'Destacada (portada / hero)' }),
    tags: fields.array(
      fields.text({ label: 'Tag' }),
      { label: 'Tags', description: 'Filtros secundarios libres (ej. "blanco y negro", "vuelo")', itemLabel: (props) => props.value || 'Tag' }
    ),
  };
}

export default config({
  storage: { kind: 'local' },
  collections: {
    species: collection({
      label: 'Fauna · Especies',
      slugField: 'nombre_comun',
      path: 'src/content/species/*',
      format: { data: 'json' },
      columns: ['nombre_cientifico', 'clase'],
      schema: {
        nombre_comun: fields.slug({ name: { label: 'Nombre común' } }),
        nombre_cientifico: fields.text({ label: 'Nombre científico' }),
        clase: fields.text({ label: 'Clase', description: 'Ej. Aves, Mamíferos, Reptiles…' }),
        orden: fields.text({ label: 'Orden', description: 'Ej. Accipitriformes' }),
        familia: fields.text({ label: 'Familia (opcional)' }),
        estado_conservacion: fields.select({
          label: 'Estado de conservación (IUCN)',
          options: estadoConservacionOptions,
          defaultValue: 'sin-evaluar',
        }),
        descripcion: fields.text({ label: 'Descripción', multiline: true }),
      },
    }),
    faunaPhotos: collection({
      label: 'Fauna · Fotos',
      slugField: 'titulo',
      path: 'src/content/fauna-photos/*',
      format: { data: 'json' },
      columns: ['especie', 'fecha'],
      schema: {
        especie: fields.relationship({ label: 'Especie', collection: 'species' }),
        ...photoFields(),
      },
    }),
    travels: collection({
      label: 'Viajes',
      slugField: 'lugar',
      path: 'src/content/travels/*',
      format: { data: 'json' },
      columns: ['pais', 'fecha_inicio'],
      schema: {
        pais: fields.text({ label: 'País', description: 'Ej. España, Marruecos…' }),
        lugar: fields.slug({ name: { label: 'Lugar' } }),
        fecha_inicio: fields.date({ label: 'Fecha de inicio' }),
        fecha_fin: fields.date({ label: 'Fecha de fin' }),
        lat: fields.number({ label: 'Latitud', description: 'Pin del lugar en el mapa de /viajes' }),
        lng: fields.number({ label: 'Longitud', description: 'Pin del lugar en el mapa de /viajes' }),
        descripcion: fields.text({ label: 'Descripción', multiline: true }),
      },
    }),
    travelPhotos: collection({
      label: 'Viajes · Fotos',
      slugField: 'titulo',
      path: 'src/content/travel-photos/*',
      format: { data: 'json' },
      columns: ['viaje', 'fecha'],
      schema: {
        viaje: fields.relationship({ label: 'Viaje', collection: 'travels' }),
        ...photoFields(),
      },
    }),
    events: collection({
      label: 'Eventos',
      slugField: 'nombre',
      path: 'src/content/events/*',
      format: { data: 'json' },
      columns: ['tipo', 'fecha'],
      schema: {
        nombre: fields.slug({ name: { label: 'Nombre del evento' } }),
        tipo: fields.select({ label: 'Tipo', options: tipoEventoOptions, defaultValue: 'otro' }),
        fecha: fields.date({ label: 'Fecha' }),
        lugar: fields.text({ label: 'Lugar' }),
        descripcion: fields.text({ label: 'Descripción', multiline: true }),
      },
    }),
    eventPhotos: collection({
      label: 'Eventos · Fotos',
      slugField: 'titulo',
      path: 'src/content/event-photos/*',
      format: { data: 'json' },
      columns: ['evento', 'fecha'],
      schema: {
        evento: fields.relationship({ label: 'Evento', collection: 'events' }),
        ...photoFields(),
      },
    }),
  },
});

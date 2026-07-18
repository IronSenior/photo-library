// Bulk photo import: turns a folder of local images into ready-to-commit
// content entries (src/content/<coleccion>-photos/*.json), auto-filling lo
// que se puede inferir (EXIF, dimensiones) y opcionalmente subiendo los
// originales a R2 — en vez de rellenar el formulario de Keystatic foto a
// foto. Ver "Añadir fotos en lote" en README.md para el flujo completo.
//
// Uso:
//   node scripts/bulk-import-photos.mjs scan <fauna|viajes|eventos> <carpeta> \
//     --ref=<slug-especie/viaje/evento> [--ubicacion="..."] [--lat=N] [--lng=N] [--force]
//   node scripts/bulk-import-photos.mjs apply <fauna|viajes|eventos> <carpeta> \
//     [--no-upload] [--force]
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import exifr from 'exifr';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV_FILENAME = '_import.csv';
const CSV_HEADERS = ['archivo', 'titulo', 'fecha', 'ubicacion', 'lat', 'lng', 'referencia', 'equipo', 'destacada', 'tags'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

// Debe reflejar la misma taxonomía que keystatic.config.ts / content.config.ts.
const COLLECTIONS = {
  fauna: { contentDir: 'src/content/fauna-photos', refField: 'especie', refDir: 'src/content/species', r2Prefix: 'fauna' },
  viajes: { contentDir: 'src/content/travel-photos', refField: 'viaje', refDir: 'src/content/travels', r2Prefix: 'viajes' },
  eventos: { contentDir: 'src/content/event-photos', refField: 'evento', refDir: 'src/content/events', r2Prefix: 'eventos' },
};

async function main() {
  const argv = process.argv.slice(2);
  const subcommand = argv[0];
  const { positional, flags } = parseArgs(argv.slice(1));
  const [coleccionKey, carpetaArg] = positional;

  if (!subcommand || !coleccionKey || !carpetaArg) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  await loadEnvFile(ROOT);
  const collection = COLLECTIONS[coleccionKey];
  if (!collection) {
    console.error(`Colección desconocida "${coleccionKey}". Usa una de: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  if (subcommand === 'scan') {
    await scanCommand(coleccionKey, collection, carpetaArg, flags);
  } else if (subcommand === 'apply') {
    await applyCommand(collection, carpetaArg, flags);
  } else {
    console.error(`Subcomando desconocido "${subcommand}".`);
    printUsage();
    process.exitCode = 1;
  }
}

function printUsage() {
  console.error(`
Uso:
  node scripts/bulk-import-photos.mjs scan <fauna|viajes|eventos> <carpeta> --ref=<slug> [--ubicacion="..."] [--lat=N] [--lng=N] [--force]
  node scripts/bulk-import-photos.mjs apply <fauna|viajes|eventos> <carpeta> [--no-upload] [--force]

Ver "Añadir fotos en lote" en README.md para el flujo completo.
`);
}

async function scanCommand(coleccionKey, collection, carpetaArg, flags) {
  const carpeta = path.resolve(carpetaArg);
  const ref = typeof flags.ref === 'string' ? flags.ref : undefined;
  if (!ref) {
    console.error('Falta --ref=<slug>, indicando la especie/viaje/evento al que pertenecen estas fotos.');
    await printAvailableRefs(collection);
    process.exitCode = 1;
    return;
  }

  const refPath = path.join(ROOT, collection.refDir, `${ref}.json`);
  if (!(await fileExists(refPath))) {
    console.error(`No existe "${ref}" en ${collection.refDir}/.`);
    await printAvailableRefs(collection);
    process.exitCode = 1;
    return;
  }

  const csvPath = path.join(carpeta, CSV_FILENAME);
  if (!flags.force && (await fileExists(csvPath))) {
    console.error(`Ya existe ${csvPath}. Usa --force para sobrescribirlo (perderás lo que hayas editado).`);
    process.exitCode = 1;
    return;
  }

  const files = await listImageFiles(carpeta);
  if (files.length === 0) {
    console.error(`No se encontraron imágenes (${[...IMAGE_EXTENSIONS].join(', ')}) en ${carpeta}`);
    process.exitCode = 1;
    return;
  }

  const rows = [];
  for (const file of files) {
    const meta = await readImageMetadata(path.join(carpeta, file));
    rows.push({
      archivo: file,
      titulo: '',
      fecha: meta.fecha ?? '',
      ubicacion: typeof flags.ubicacion === 'string' ? flags.ubicacion : '',
      lat: typeof flags.lat === 'string' ? flags.lat : '',
      lng: typeof flags.lng === 'string' ? flags.lng : '',
      referencia: ref,
      equipo: meta.equipo ?? '',
      destacada: '',
      tags: '',
    });
  }

  await writeFile(csvPath, toCsv(rows, CSV_HEADERS), 'utf8');

  console.log(`Escaneadas ${rows.length} foto(s) → ${csvPath}`);
  console.log('Abre el CSV (Numbers/Excel/Sheets), completa "titulo" (obligatorio) y ajusta lo que necesites.');
  console.log('Luego ejecuta:');
  console.log(`  node scripts/bulk-import-photos.mjs apply ${coleccionKey} ${carpetaArg}`);
}

async function applyCommand(collection, carpetaArg, flags) {
  const carpeta = path.resolve(carpetaArg);
  const csvPath = path.join(carpeta, CSV_FILENAME);
  if (!(await fileExists(csvPath))) {
    console.error(`No existe ${csvPath}. Ejecuta primero "scan".`);
    process.exitCode = 1;
    return;
  }

  const rows = parseCsv(await readFile(csvPath, 'utf8'));
  if (rows.length === 0) {
    console.error(`${csvPath} no tiene filas de fotos.`);
    process.exitCode = 1;
    return;
  }

  const { errors, prepared } = await validateRows(rows, carpeta, collection, flags);
  if (errors.length) {
    console.error(`Se encontraron ${errors.length} error(es) en ${csvPath}. No se ha subido ni escrito nada:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const baseUrl = (process.env.PUBLIC_R2_BASE_URL ?? '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.error('Falta PUBLIC_R2_BASE_URL en .env (necesaria para construir la URL pública de cada foto).');
    process.exitCode = 1;
    return;
  }

  let r2;
  if (!flags['no-upload']) {
    try {
      r2 = await createR2Client();
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
  }

  for (const item of prepared) {
    const ext = path.extname(item.archivo).toLowerCase();
    const key = `${collection.r2Prefix}/${item.slug}${ext}`;

    if (r2) {
      await uploadToR2(r2, key, item.filePath, CONTENT_TYPES[ext] ?? 'application/octet-stream');
      console.log(`Subida a R2: ${key}`);
    }

    const { width, height } = await sharp(item.filePath).metadata();
    const json = {
      [collection.refField]: item.referencia,
      titulo: item.titulo,
      fecha: item.fecha,
      ...(item.ubicacion ? { ubicacion: item.ubicacion } : {}),
      ...(item.lat !== undefined ? { lat: item.lat } : {}),
      ...(item.lng !== undefined ? { lng: item.lng } : {}),
      imagen: `${baseUrl}/${key}`,
      ancho: width,
      alto: height,
      ...(item.equipo ? { equipo: item.equipo } : {}),
      destacada: item.destacada,
      tags: item.tags,
    };

    await writeFile(item.contentPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
    console.log(`Creado: ${collection.contentDir}/${item.slug}.json`);
  }

  console.log(`\n${prepared.length} foto(s) importada(s). Revisa el diff y haz commit:`);
  console.log(`  git add ${collection.contentDir}`);
  console.log(`  git commit -m "Añade ${prepared.length} fotos"`);
  console.log('  git push');
}

async function validateRows(rows, carpeta, collection, flags) {
  const errors = [];
  const prepared = [];
  const seenSlugs = new Map();

  for (const [index, row] of rows.entries()) {
    const line = index + 2; // +1 cabecera, +1 base 1
    const archivo = (row.archivo ?? '').trim();
    const label = archivo || `línea ${line}`;

    if (!archivo) {
      errors.push(`Línea ${line}: falta "archivo".`);
      continue;
    }
    const filePath = path.join(carpeta, archivo);
    if (!(await fileExists(filePath))) {
      errors.push(`${label}: el archivo no existe en ${carpeta}.`);
      continue;
    }

    const titulo = (row.titulo ?? '').trim();
    if (!titulo) {
      errors.push(`${label}: falta "titulo".`);
      continue;
    }

    const fecha = (row.fecha ?? '').trim();
    if (!fecha || Number.isNaN(new Date(fecha).getTime())) {
      errors.push(`${label}: "fecha" vacía o inválida (usa AAAA-MM-DD).`);
      continue;
    }

    const referencia = (row.referencia ?? '').trim();
    if (!referencia) {
      errors.push(`${label}: falta "referencia".`);
      continue;
    }
    if (!(await fileExists(path.join(ROOT, collection.refDir, `${referencia}.json`)))) {
      errors.push(`${label}: no existe "${referencia}" en ${collection.refDir}/.`);
      continue;
    }

    const ubicacion = (row.ubicacion ?? '').trim();
    const equipo = (row.equipo ?? '').trim();

    let lat;
    const latRaw = (row.lat ?? '').trim();
    if (latRaw) {
      lat = Number(latRaw);
      if (Number.isNaN(lat)) {
        errors.push(`${label}: "lat" no es un número.`);
        continue;
      }
    }

    let lng;
    const lngRaw = (row.lng ?? '').trim();
    if (lngRaw) {
      lng = Number(lngRaw);
      if (Number.isNaN(lng)) {
        errors.push(`${label}: "lng" no es un número.`);
        continue;
      }
    }

    const destacadaRaw = (row.destacada ?? '').trim().toLowerCase();
    let destacada = false;
    if (destacadaRaw === 'true') destacada = true;
    else if (destacadaRaw !== '' && destacadaRaw !== 'false') {
      errors.push(`${label}: "destacada" debe ser true, false o vacío.`);
      continue;
    }

    const tags = (row.tags ?? '').trim()
      ? row.tags.trim().split(';').map((t) => t.trim()).filter(Boolean)
      : [];

    const slug = slugify(titulo);
    if (!slug) {
      errors.push(`${label}: "titulo" no genera un nombre de archivo válido.`);
      continue;
    }
    if (seenSlugs.has(slug)) {
      errors.push(`${label}: título duplicado con la línea ${seenSlugs.get(slug)} (mismo slug "${slug}").`);
      continue;
    }
    seenSlugs.set(slug, line);

    const contentPath = path.join(ROOT, collection.contentDir, `${slug}.json`);
    if (!flags.force && (await fileExists(contentPath))) {
      errors.push(`${label}: ya existe ${collection.contentDir}/${slug}.json (usa --force para sobrescribir).`);
      continue;
    }

    prepared.push({ archivo, filePath, titulo, fecha, ubicacion, lat, lng, referencia, equipo, destacada, tags, slug, contentPath });
  }

  return { errors, prepared };
}

async function readImageMetadata(filePath) {
  let fecha;
  let equipo;
  try {
    const exif = await exifr.parse(filePath, ['DateTimeOriginal', 'Make', 'Model', 'LensModel']);
    if (exif) {
      if (exif.DateTimeOriginal instanceof Date && !Number.isNaN(exif.DateTimeOriginal.getTime())) {
        fecha = formatDate(exif.DateTimeOriginal);
      }
      const camara = [exif.Make, exif.Model].filter(Boolean).join(' ');
      const partes = [camara, exif.LensModel].filter(Boolean);
      if (partes.length) equipo = partes.join(' + ');
    }
  } catch {
    // Sin EXIF legible: se deja vacío, se rellena a mano en el CSV si aplica.
  }
  return { fecha, equipo };
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function listImageFiles(carpeta) {
  const entries = await readdir(carpeta, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
}

async function printAvailableRefs(collection) {
  try {
    const entries = await readdir(path.join(ROOT, collection.refDir));
    const slugs = entries.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    if (slugs.length) {
      console.error(`Disponibles en ${collection.refDir}/: ${slugs.join(', ')}`);
    } else {
      console.error(`No hay ninguno creado todavía en ${collection.refDir}/ — créalo primero en Keystatic (npm run dev → /keystatic).`);
    }
  } catch {
    console.error(`No se pudo leer ${collection.refDir}/.`);
  }
}

// Mismo criterio que src/utils/slugify.ts y que `fields.slug` de Keystatic,
// duplicado aquí porque este script corre fuera del pipeline de Astro/TS.
function slugify(input) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, '\n');
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushField();
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  const [header, ...dataRows] = nonEmptyRows;
  if (!header) return [];
  return dataRows.map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])));
}

async function loadEnvFile(root) {
  try {
    const text = await readFile(path.join(root, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function createR2Client() {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno en .env para subir a R2: ${missing.join(', ')}`);
  }
  const { S3Client } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return { client, bucket: process.env.R2_BUCKET_NAME };
}

async function uploadToR2({ client, bucket }, key, filePath, contentType) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const body = await readFile(filePath);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      flags[key] = rest.length ? rest.join('=') : true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

main();

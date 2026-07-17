import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Astro's asset pipeline intercepts every image import under `src/`
// (including from node_modules) and returns `ImageMetadata` ({src, width,
// height}) rather than a plain URL string — grab `.src` for Leaflet.
const iconUrl = (markerIcon as unknown as { src: string }).src;
const iconRetinaUrl = (markerIcon2x as unknown as { src: string }).src;
const shadowUrl = (markerShadow as unknown as { src: string }).src;

// Vite rewrites the default Leaflet marker icon URLs relative to the CSS
// file, which breaks under bundling. Point them at the bundled assets
// instead — the standard fix for Leaflet + Vite/Rollup.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

export interface MapPin {
  lat: number;
  lng: number;
  titulo: string;
  href: string;
  thumbnail?: string;
}

interface Props {
  pins: MapPin[];
}

function escapeHtml(input: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return input.replace(/[&<>"']/g, (c) => map[c]);
}

export default function TravelMap({ pins }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || pins.length === 0) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const clusterGroup = L.markerClusterGroup();
    const bounds: L.LatLngTuple[] = [];

    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng]);
      marker.bindPopup(
        `<div class="map-popup">` +
          (pin.thumbnail
            ? `<img src="${pin.thumbnail}" alt="" width="160" style="border-radius:6px;margin-bottom:6px;" />`
            : '') +
          `<h4>${escapeHtml(pin.titulo)}</h4>` +
          `<a href="${pin.href}">Ver galería →</a>` +
          `</div>`
      );
      clusterGroup.addLayer(marker);
      bounds.push([pin.lat, pin.lng]);
    }

    map.addLayer(clusterGroup);

    if (bounds.length === 1) {
      map.setView(bounds[0], 9);
    } else {
      map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [pins]);

  if (pins.length === 0) {
    return <p>Todavía no hay lugares con coordenadas para mostrar en el mapa.</p>;
  }

  return <div ref={containerRef} className="map-container" />;
}

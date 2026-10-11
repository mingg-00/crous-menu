import 'maplibre-gl/dist/maplibre-gl.css';

import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ReactionCounts } from '../lib/api';
import { t } from '../lib/i18n';
import { REACTIONS } from '../lib/reactions';
import { color, radius, shadow } from '../lib/theme';
import type { RestaurantMapProps } from './RestaurantMap';

// MapLibre runs a module worker that bundlers can't resolve under Metro; serve the library's own worker file from
// public/ (copied there on `npm install`, see package.json postinstall, so it always matches the library version).
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

// Free vector tiles, no API key (openfreemap.org); attribution is added by the style.
const STYLE = 'https://tiles.openfreemap.org/styles/positron';

// Floating emojis are CSS so they cost nothing per frame; they stop for users who ask for reduced motion (WCAG 2.3.3).
const CSS = `
/* Reset the button look piece by piece, never with "all: unset": that also removes MapLibre's
   .maplibregl-marker { position: absolute }, and the pins then stack in normal flow, each pushed down by the
   heights of the pins before it instead of sitting on its coordinates. */
.ru-marker { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ru-marker:focus-visible { outline: 3px solid ${color.ink}; outline-offset: 2px; border-radius: 8px; }
.ru-bubbles { display: flex; gap: 2px; height: 30px; align-items: flex-end; }
.ru-bubble { font-size: 20px; line-height: 1; animation: ru-float 2.6s ease-in-out infinite; filter: drop-shadow(0 1px 1px rgba(0,0,0,.25)); }
.ru-bubble b { font: 700 11px/1 system-ui, sans-serif; color: ${color.ink}; background: #fff; border-radius: 999px; padding: 1px 4px; margin-left: -4px; }
.ru-pin { width: 14px; height: 14px; border-radius: 50%; background: ${color.brand}; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.ru-label { font: 600 12px/1.2 system-ui, sans-serif; color: ${color.ink}; background: rgba(255,255,255,.92); padding: 2px 6px; border-radius: 6px; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ru-you { width: 14px; height: 14px; border-radius: 50%; background: #1C6DD0; border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(28,109,208,.2); }
@keyframes ru-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@media (prefers-reduced-motion: reduce) { .ru-bubble { animation: none; } }
`;

function ensureCss() {
  if (document.getElementById('ru-map-css')) return;
  const style = document.createElement('style');
  style.id = 'ru-map-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Top three reactions (most frequent first) as floating emojis above the pin, each with its count. */
function markerElement(name: string, counts: ReactionCounts | undefined) {
  const top = REACTIONS.filter(({ kind }) => counts?.[kind])
    .sort((a, b) => (counts![b.kind] ?? 0) - (counts![a.kind] ?? 0))
    .slice(0, 3);
  const el = document.createElement('button');
  el.className = 'ru-marker';
  el.type = 'button';
  el.setAttribute('aria-label', [name, ...top.map(({ kind }) => `${t.reactionLabels[kind]} ${counts![kind]}`)].join(', '));
  const bubbles = document.createElement('span');
  bubbles.className = 'ru-bubbles';
  bubbles.setAttribute('aria-hidden', 'true');
  top.forEach(({ kind, emoji }, i) => {
    const b = document.createElement('span');
    b.className = 'ru-bubble';
    b.style.animationDelay = `${i * 0.45}s`;
    b.innerHTML = `${emoji}<b></b>`;
    b.querySelector('b')!.textContent = String(counts![kind]);
    bubbles.appendChild(b);
  });
  const pin = document.createElement('span');
  pin.className = 'ru-pin';
  const label = document.createElement('span');
  label.className = 'ru-label';
  label.textContent = name; // textContent, never innerHTML: names come from an external API
  el.append(bubbles, pin, label);
  return el;
}

export function RestaurantMap({ center, showUser, restaurants, summary, onSelect }: RestaurantMapProps) {
  const container = useRef<View>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const you = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    ensureCss();
    map.current = new maplibregl.Map({
      container: container.current as unknown as HTMLElement, // a View renders a div on the web
      style: STYLE,
      center: [center.longitude, center.latitude],
      zoom: 14,
      cooperativeGestures: true, // page scroll stays page scroll; ctrl/⌘ + scroll or two fingers to move the map
      attributionControl: { compact: true },
    });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    return () => map.current?.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- create once; center changes are eased below

  useEffect(() => {
    map.current?.easeTo({ center: [center.longitude, center.latitude] });
    you.current?.remove();
    you.current = null;
    if (showUser && map.current) {
      const el = document.createElement('span');
      el.className = 'ru-you';
      el.setAttribute('aria-label', t.youAreHere);
      you.current = new maplibregl.Marker({ element: el }).setLngLat([center.longitude, center.latitude]).addTo(map.current);
    }
  }, [center.latitude, center.longitude, showUser]);

  useEffect(() => {
    markers.current.forEach((m) => m.remove());
    markers.current = restaurants.map((r) => {
      const el = markerElement(r.nom, summary[r.code]?.counts);
      el.addEventListener('click', () => onSelect(r));
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.longitude, r.latitude]).addTo(map.current!);
    });
  }, [restaurants, summary, onSelect]);

  return <View ref={container} style={styles.map} role="region" aria-label={t.mapLabel} />;
}

const styles = StyleSheet.create({
  map: { height: 320, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.line, ...shadow },
});

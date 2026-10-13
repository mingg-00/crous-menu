import 'maplibre-gl/dist/maplibre-gl.css';

import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { Rating } from '../lib/api';
import { t } from '../lib/i18n';
import { ratingLabel, ratingText } from '../lib/rating';
import { color, radius, shadow } from '../lib/theme';
import type { RestaurantMapProps } from './RestaurantMap';

// MapLibre runs a module worker that bundlers can't resolve under Metro; serve the library's own worker file from
// public/ (copied there on `npm install`, see package.json postinstall, so it always matches the library version).
maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

// Free vector tiles, no API key (openfreemap.org); attribution is added by the style.
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const NEAREST_IN_VIEW = 5;
const LABELED_ON_PHONES = 3;

const CSS = `
/* Reset the button look piece by piece, never with "all: unset": that also removes MapLibre's
   .maplibregl-marker { position: absolute }, and the pins then stack in normal flow, each pushed down by the
   heights of the pins before it instead of sitting on its coordinates. */
.ru-marker { background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ru-marker:focus-visible { outline: 3px solid ${color.ink}; outline-offset: 2px; border-radius: 8px; }
.ru-rating { font: 700 12px/1 system-ui, sans-serif; color: ${color.ink}; background: #fff; border-radius: 999px; padding: 3px 7px; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.ru-rating::first-letter { color: ${color.star}; }
.ru-pin { width: 14px; height: 14px; border-radius: 50%; background: ${color.brand}; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
.ru-pin-closed { background: ${color.ink3}; }
.ru-label { font: 600 12px/1.2 system-ui, sans-serif; color: ${color.ink}; background: rgba(255,255,255,.92); padding: 2px 6px; border-radius: 6px; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Phones: only the nearest places keep their name on the map, the rest overlap; the list below names them all. */
@media (max-width: 599px) { .ru-label-minor { display: none; } }
.ru-you { width: 14px; height: 14px; border-radius: 50%; background: #1C6DD0; border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(28,109,208,.2); }
`;

function ensureCss() {
  if (document.getElementById('ru-map-css')) return;
  const style = document.createElement('style');
  style.id = 'ru-map-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Pin with the restaurant's name, and its star rating above it once someone has reviewed. */
function markerElement(name: string, rating: Rating, minorLabel: boolean, closed: boolean) {
  const el = document.createElement('button');
  el.className = 'ru-marker';
  el.type = 'button';
  el.setAttribute('aria-label', [name, closed && t.closed, rating && ratingLabel(rating)].filter(Boolean).join(', '));
  if (rating) {
    const badge = document.createElement('span');
    badge.className = 'ru-rating';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = ratingText(rating);
    el.append(badge);
  }
  const pin = document.createElement('span');
  pin.className = closed ? 'ru-pin ru-pin-closed' : 'ru-pin';
  const label = document.createElement('span');
  label.className = minorLabel ? 'ru-label ru-label-minor' : 'ru-label';
  label.textContent = name; // textContent, never innerHTML: names come from an external API
  el.append(pin, label);
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
    // The compact credits start expanded and cover the pins on small maps: start folded into the (i) button.
    map.current.once('load', () =>
      map.current?.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'),
    );
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
    // Fit the view to the nearest few places and the center, so a first visit shows them without dragging.
    if (restaurants.length && map.current) {
      const bounds = new maplibregl.LngLatBounds([center.longitude, center.latitude], [center.longitude, center.latitude]);
      restaurants.slice(0, NEAREST_IN_VIEW).forEach((r) => bounds.extend([r.longitude, r.latitude]));
      map.current.fitBounds(bounds, { padding: { top: 60, bottom: 40, left: 40, right: 40 }, maxZoom: 15, duration: 0 });
    }
  }, [restaurants, center.latitude, center.longitude]);

  useEffect(() => {
    markers.current.forEach((m) => m.remove());
    markers.current = restaurants.map((r, i) => {
      const el = markerElement(r.nom, summary[r.code]?.rating ?? null, i >= LABELED_ON_PHONES, r.closed);
      el.addEventListener('click', () => onSelect(r));
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.longitude, r.latitude]).addTo(map.current!);
    });
  }, [restaurants, summary, onSelect]);

  // Phones: a shorter map so the list starts within the first screen.
  const { width } = useWindowDimensions();
  return <View ref={container} style={[styles.map, { height: width < 600 ? 220 : 320 }]} role="region" aria-label={t.mapLabel} />;
}

const styles = StyleSheet.create({
  map: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.line, ...shadow },
});

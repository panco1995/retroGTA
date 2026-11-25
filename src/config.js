import map from '../data/saint-marks.json';

export const MAP = map;

export const ROAD_W = map.metrics.roadW;
export const WALK = map.metrics.walk;
export const SETBACK = ROAD_W / 2 + WALK;
export const HOUSE_DEPTH = map.metrics.houseDepth;
export const FLOOR_H = map.metrics.floorH;
export const WALK_TOP = map.metrics.walkTop;
export const ROAD_TOP = map.metrics.roadTop;

export const ROADS_X = map.roads.x;
export const ROADS_Z = map.roads.z;

export const BRICKS = map.bricks.map((hex) => Number.parseInt(hex.slice(1), 16));

export function hash(a, b) {
  let n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n >>> 0) % 10000) / 10000;
}

export function shade(hex, factor) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const s = (v) => Math.max(0, Math.min(255, (v * factor) | 0));
  return (s(r) << 16) | (s(g) << 8) | s(b);
}

export function colorOf(value) {
  if (typeof value === 'number') return value;
  return Number.parseInt(String(value).replace('#', ''), 16);
}

export function deg(value) {
  return value * Math.PI / 180;
}

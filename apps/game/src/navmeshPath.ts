import { NavMesh } from "navmesh";
import {
  nearestComponentAt,
  rectsForComponent,
  type NavmeshQuery,
  type WorldRect
} from "./navmesh";

export type Point = {
  x: number;
  y: number;
};

const meshCache = new WeakMap<NavmeshQuery, Map<number, NavMesh>>();

export function findMeshPath(mesh: NavmeshQuery, from: Point, to: Point): Point[] | undefined {
  const fromComponent = nearestComponentAt(mesh, from, 2);
  const toComponent = nearestComponentAt(mesh, to, 2);
  if (!fromComponent || !toComponent || fromComponent.componentId !== toComponent.componentId) {
    return undefined;
  }

  const rects = rectsForComponent(mesh, fromComponent.componentId);
  const snappedFrom = snapPointToRects(from, rects, mesh.cellSize * 2);
  const snappedTo = snapPointToRects(to, rects, mesh.cellSize * 2);
  if (!snappedFrom || !snappedTo) {
    return undefined;
  }

  const nav = navMeshForComponent(mesh, fromComponent.componentId, rects);
  const path = nav.findPath(snappedFrom, snappedTo);
  return path?.map((point) => ({ x: point.x, y: point.y })) ?? undefined;
}

function navMeshForComponent(mesh: NavmeshQuery, componentId: number, rects: WorldRect[]): NavMesh {
  let byComponent = meshCache.get(mesh);
  if (!byComponent) {
    byComponent = new Map();
    meshCache.set(mesh, byComponent);
  }

  const cached = byComponent.get(componentId);
  if (cached) {
    return cached;
  }

  const nav = new NavMesh(rects.map(rectToPolygon));
  byComponent.set(componentId, nav);
  return nav;
}

function rectToPolygon(rect: WorldRect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h }
  ];
}

function snapPointToRects(point: Point, rects: WorldRect[], maxDistance: number): Point | undefined {
  let best: { point: Point; distance: number } | undefined;
  for (const rect of rects) {
    const snapped = {
      x: clamp(point.x, rect.x, rect.x + rect.w),
      y: clamp(point.y, rect.y, rect.y + rect.h)
    };
    const distance = Math.hypot(point.x - snapped.x, point.y - snapped.y);
    if (!best || distance < best.distance) {
      best = { point: snapped, distance };
    }
  }
  return best && best.distance <= maxDistance ? best.point : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

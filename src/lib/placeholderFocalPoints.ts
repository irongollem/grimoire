import { supabase } from '@/lib/supabase';

type FocalPoint = { x: number; y: number };
type FocalPointMap = Record<string, FocalPoint>;

// Module-level singleton — shared across all FocalImage instances.
let _cache: FocalPointMap = {};
let _initPromise: Promise<void> | null = null;

/** Fetches admin-configured focal points from DB once, then caches in memory. */
export function initPlaceholderFocalPoints(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = Promise.resolve(
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'placeholder_focal_points')
      .maybeSingle(),
  ).then(({ data }) => {
    if (data?.value) _cache = data.value as FocalPointMap;
  }).catch(() => {}); // fail silently — fall back to smartcrop
  return _initPromise;
}

export function getPlaceholderFocalPoint(entityType: string): FocalPoint | null {
  return _cache[entityType] ?? null;
}

/** Called by the admin composable to keep the in-memory cache fresh without a re-fetch. */
export function updatePlaceholderFocalPointCache(entityType: string, fp: FocalPoint): void {
  _cache[entityType] = fp;
}

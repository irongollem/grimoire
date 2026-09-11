import { supabase } from '@/lib/supabase';
import { artUrl } from '@/lib/assets/artUrl';

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

/**
 * Resolve a placeholder art URL for an entity type, routed through artUrl
 * (#864/#877) so placeholder art can move to R2 behind the CDN.
 *
 * Lives here rather than as 40+ separate `artUrl(...)` call sites because this
 * module already owns placeholder entity-type knowledge (getPlaceholderFocalPoint
 * keys its cache the same way). FocalImage.vue's entityTypeFromPlaceholder()
 * parses this exact filename shape back out of whatever URL this returns.
 */
export function placeholderUrl(entityType: string): string {
  return artUrl(`/assets/placeholders/${entityType}.webp`);
}

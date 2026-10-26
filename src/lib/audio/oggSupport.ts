/**
 * Whether this device can play Ogg Vorbis, the format of the sound library and
 * the workshop sounds. iPhone and iPad Safari plays it only from iOS 18.4, so
 * older devices play nothing and should be told.
 *
 * Feature detection, never a user-agent check: `canPlayType` answers "" when
 * the format is unsupported and "maybe" / "probably" when it is. Without a
 * document or Audio (SSR, tests) it answers true, so nothing warns by mistake.
 */
let cached: boolean | null = null;

export function canPlayOggVorbis(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined" || typeof Audio === "undefined") return true;
  cached = document.createElement("audio").canPlayType('audio/ogg; codecs="vorbis"') !== "";
  return cached;
}

/** Test seam: forget the memoised answer. */
export function resetOggSupportCache(): void {
  cached = null;
}

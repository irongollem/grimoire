/**
 * Evens out the narration of one episode. Takes are recorded on different days and at different distances from
 * the mic, and a take 3 dB louder than its neighbour is heard as the voice jumping (one Reel spanned -22.6 to
 * -19.2 LUFS). Each take is moved to the episode's average loudness before the voice polish, so the voice sits at
 * the level the mix was balanced for while no take stands out from the others.
 */

/** Takes quieter than this (a near-silent or very short take) are left alone: their measurement is not a level. */
const MEASURABLE_LUFS = -50;
/** The most a take is moved. A take further off than this is a different problem (a wrong input) for an ear to catch. */
const MAX_GAIN_DB = 9;

/** The gain in dB for each take (0 where there is none, or it cannot be measured), from each take's loudness in LUFS. */
export function levelGains(loudness: (number | null)[]): number[] {
  const measured = loudness.filter((l): l is number => l !== null && l > MEASURABLE_LUFS);
  if (measured.length < 2) return loudness.map(() => 0);
  const target = measured.reduce((a, b) => a + b, 0) / measured.length;
  return loudness.map((l) => (l === null || l <= MEASURABLE_LUFS ? 0 : Math.max(-MAX_GAIN_DB, Math.min(MAX_GAIN_DB, target - l))));
}

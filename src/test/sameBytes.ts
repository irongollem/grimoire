/** Byte-for-byte equality of two pixel buffers. `expect(Array.from(a)).toEqual(Array.from(b))` on megabytes takes seconds; this takes milliseconds. */
export function sameBytes(x: ArrayLike<number> | null | undefined, y: ArrayLike<number> | null | undefined): boolean {
  if (!x || !y) return !x && !y;
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

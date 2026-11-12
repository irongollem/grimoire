import { ImportError } from "./types";

/** PackBits: a count byte, then a literal run (0..127: that many plus one bytes) or a repeated byte (-1..-127: one minus that many copies). */
export function unpackBits(src: Uint8Array, outLength: number): Uint8Array {
  const out = new Uint8Array(outLength);
  let i = 0;
  let o = 0;
  while (o < outLength) {
    if (i >= src.length) throw new ImportError("A compressed brush image ends early.");
    const n = (src[i++] << 24) >> 24;
    if (n >= 0) {
      const len = n + 1;
      if (i + len > src.length) throw new ImportError("A compressed brush image ends early.");
      for (let k = 0; k < len && o < outLength; k++) out[o++] = src[i + k];
      i += len;
    } else if (n !== -128) {
      if (i >= src.length) throw new ImportError("A compressed brush image ends early.");
      const value = src[i++];
      const len = 1 - n;
      for (let k = 0; k < len && o < outLength; k++) out[o++] = value;
    }
  }
  return out;
}

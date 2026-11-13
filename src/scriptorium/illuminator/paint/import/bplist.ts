import { ImportError } from "./types";

/*
 * A binary property list ("bplist00"), the container Apple's archivers write. Objects are read lazily
 * from the offset table; recursion depth and the number of objects visited are both capped, so a
 * hand-made file that points at itself or fans out cannot hang the reader.
 */

export class PlistUid {
  constructor(readonly index: number) {}
}
export type PlistValue = null | boolean | number | string | Uint8Array | PlistUid | PlistValue[] | Map<string, PlistValue>;

const MAX_DEPTH = 48;
const MAX_VISITS = 200_000;

export function parseBplist(bytes: Uint8Array): PlistValue {
  if (bytes.length < 40 || String.fromCharCode(...bytes.subarray(0, 8)) !== "bplist00") {
    throw new ImportError("It is not a property list.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const t = bytes.length - 32;
  const offsetSize = view.getUint8(t + 6);
  const refSize = view.getUint8(t + 7);
  const count = Number(view.getBigUint64(t + 8));
  const top = Number(view.getBigUint64(t + 16));
  const tableAt = Number(view.getBigUint64(t + 24));
  if (offsetSize < 1 || offsetSize > 8 || refSize < 1 || refSize > 8) throw new ImportError("The property list is damaged.");
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_VISITS || top >= count) {
    throw new ImportError("The property list is damaged.");
  }
  if (!Number.isSafeInteger(tableAt) || tableAt < 8 || tableAt + count * offsetSize > t) {
    throw new ImportError("The property list is damaged.");
  }

  const uint = (at: number, size: number): number => {
    if (at < 0 || at + size > t) throw new ImportError("The property list ends early.");
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + bytes[at + i];
    return v;
  };
  const offsetOf = (index: number): number => {
    if (index >= count) throw new ImportError("The property list points at nothing.");
    return uint(tableAt + index * offsetSize, offsetSize);
  };

  let visits = 0;
  const read = (index: number, depth: number): PlistValue => {
    if (depth > MAX_DEPTH) throw new ImportError("The property list nests too deeply.");
    if (++visits > MAX_VISITS) throw new ImportError("The property list is far larger than any brush's.");
    let at = offsetOf(index);
    if (at < 8 || at >= t) throw new ImportError("The property list points outside itself.");
    const marker = bytes[at++];
    const kind = marker >> 4;
    const low = marker & 15;
    const readLength = (): number => {
      if (low !== 15) return low;
      const intMarker = bytes[at++];
      if (intMarker >> 4 !== 1) throw new ImportError("The property list is damaged.");
      const size = 2 ** (intMarker & 15);
      if (size > 8) throw new ImportError("The property list is damaged.");
      const n = uint(at, size);
      at += size;
      return n;
    };
    switch (kind) {
      case 0:
        if (low === 8) return false;
        if (low === 9) return true;
        return null;
      case 1: {
        const size = 2 ** low;
        if (size > 8) throw new ImportError("The property list holds an integer too large to read.");
        const n = uint(at, size);
        // A one, two or four byte integer is unsigned; an eight byte one is signed.
        return size === 8 && n >= 2 ** 63 ? n - 2 ** 64 : n;
      }
      case 2: {
        const size = 2 ** low;
        if (at + size > t) throw new ImportError("The property list ends early.");
        const dv = new DataView(bytes.buffer, bytes.byteOffset + at, size);
        if (size === 4) return dv.getFloat32(0);
        if (size === 8) return dv.getFloat64(0);
        throw new ImportError("The property list holds a number it cannot read.");
      }
      case 3:
        return null;
      case 4: {
        const n = readLength();
        if (at + n > t) throw new ImportError("The property list ends early.");
        return bytes.slice(at, at + n);
      }
      case 5: {
        const n = readLength();
        if (at + n > t) throw new ImportError("The property list ends early.");
        return String.fromCharCode(...bytes.subarray(at, at + n));
      }
      case 6: {
        const n = readLength();
        if (at + n * 2 > t) throw new ImportError("The property list ends early.");
        let s = "";
        for (let i = 0; i < n; i++) s += String.fromCharCode((bytes[at + i * 2] << 8) | bytes[at + i * 2 + 1]);
        return s;
      }
      case 8:
        return new PlistUid(uint(at, low + 1));
      case 10:
      case 12: {
        const n = readLength();
        if (at + n * refSize > t) throw new ImportError("The property list ends early.");
        const out: PlistValue[] = [];
        for (let i = 0; i < n; i++) out.push(read(uint(at + i * refSize, refSize), depth + 1));
        return out;
      }
      case 13: {
        const n = readLength();
        if (at + n * refSize * 2 > t) throw new ImportError("The property list ends early.");
        const map = new Map<string, PlistValue>();
        for (let i = 0; i < n; i++) {
          const key = read(uint(at + i * refSize, refSize), depth + 1);
          const value = read(uint(at + (n + i) * refSize, refSize), depth + 1);
          if (typeof key === "string") map.set(key, value);
        }
        return map;
      }
      default:
        throw new ImportError("The property list holds a kind of value this reader does not know.");
    }
  };
  return read(top, 0);
}

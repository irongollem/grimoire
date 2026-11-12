import type { Reader } from "./byteReader";
import { ImportError } from "./types";

/*
 * Photoshop's action descriptor, the tree the `desc` block of a version 6 .abr holds: a class name and a
 * set of keyed items, each tagged with a four-letter type. Units are dropped (a percent is a number); the
 * caller knows which keys are percentages.
 */

export interface DescObject {
  cls: string;
  items: Map<string, DescValue>;
}
export type DescValue = number | boolean | string | DescObject | DescValue[];

const MAX_DEPTH = 24;
const MAX_ITEMS = 20000;

/** A key or class id: a length, or four characters when the length is zero. */
function readId(r: Reader): string {
  const len = r.u32();
  if (len > 256) throw new ImportError("A brush setting has an oversized name.");
  return r.ascii(len === 0 ? 4 : len);
}

class Budget {
  items = 0;
  spend(): void {
    if (++this.items > MAX_ITEMS) throw new ImportError("The brush settings are far larger than any brush's.");
  }
}

function readObject(r: Reader, depth: number, budget: Budget): DescObject {
  if (depth > MAX_DEPTH) throw new ImportError("The brush settings nest too deeply.");
  r.unicode();
  const cls = readId(r);
  const count = r.u32();
  const items = new Map<string, DescValue>();
  for (let i = 0; i < count; i++) {
    budget.spend();
    const key = readId(r);
    items.set(key, readValue(r, depth, budget));
  }
  return { cls, items };
}

function readValue(r: Reader, depth: number, budget: Budget): DescValue {
  const type = r.ascii(4);
  switch (type) {
    case "Objc":
    case "GlbO":
      return readObject(r, depth + 1, budget);
    case "VlLs": {
      if (depth > MAX_DEPTH) throw new ImportError("The brush settings nest too deeply.");
      const count = r.u32();
      const list: DescValue[] = [];
      for (let i = 0; i < count; i++) {
        budget.spend();
        list.push(readValue(r, depth + 1, budget));
      }
      return list;
    }
    case "doub":
      return r.f64();
    case "UntF":
      r.skip(4);
      return r.f64();
    case "TEXT":
      return r.unicode(65536);
    case "long":
      return r.i32();
    case "bool":
      return r.u8() !== 0;
    case "enum":
      readId(r);
      return readId(r);
    case "comp":
      r.skip(8);
      return 0;
    case "type":
    case "GlbC":
      r.unicode();
      return readId(r);
    case "tdta":
    case "alis":
      r.skip(r.u32());
      return "";
    default:
      throw new ImportError(`A brush setting has a kind (${type}) this reader does not know.`);
  }
}

/** The `desc` block: a version number (16), then one descriptor. */
export function readDescriptor(r: Reader): DescObject {
  r.u32();
  return readObject(r, 0, new Budget());
}

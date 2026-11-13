import { PlistUid, type PlistValue } from "./bplist";
import { ImportError } from "./types";

/*
 * NSKeyedArchiver: a plist whose "$objects" array holds every object once and refers to the rest by UID.
 * This walks from "$top"."root" and returns plain values: a dictionary is a Map, "$null" is null, and an
 * object that names its class carries it under "$classname".
 */

const MAX_DEPTH = 24;
const MAX_VISITS = 100_000;

const isMap = (v: PlistValue | undefined): v is Map<string, PlistValue> => v instanceof Map;

export function unarchive(plist: PlistValue): PlistValue {
  if (!isMap(plist)) throw new ImportError("It is not an archive.");
  const objects = plist.get("$objects");
  const top = plist.get("$top");
  if (!Array.isArray(objects) || !isMap(top)) return plist;
  const rootUid = top.get("root");
  if (!(rootUid instanceof PlistUid)) throw new ImportError("The archive has no root object.");

  let visits = 0;
  const resolve = (value: PlistValue, depth: number): PlistValue => {
    if (depth > MAX_DEPTH) throw new ImportError("The archive nests too deeply.");
    if (++visits > MAX_VISITS) throw new ImportError("The archive is far larger than any brush's.");
    if (value instanceof PlistUid) {
      if (value.index >= objects.length) throw new ImportError("The archive points at nothing.");
      return resolve(objects[value.index], depth + 1);
    }
    if (value === "$null") return null;
    if (Array.isArray(value)) return value.map((v) => resolve(v, depth + 1));
    if (!isMap(value)) return value;

    const out = new Map<string, PlistValue>();
    const cls = value.get("$class");
    if (cls instanceof PlistUid) {
      const classDict = objects[cls.index];
      const name = isMap(classDict) ? classDict.get("$classname") : undefined;
      if (typeof name === "string") out.set("$classname", name);
    }
    const keys = value.get("NS.keys");
    const values = value.get("NS.objects");
    if (Array.isArray(keys) && Array.isArray(values)) {
      keys.forEach((k, i) => {
        const key = resolve(k, depth + 1);
        if (typeof key === "string" && i < values.length) out.set(key, resolve(values[i], depth + 1));
      });
      return out;
    }
    if (Array.isArray(values)) return values.map((v) => resolve(v, depth + 1));
    for (const [k, v] of value) if (k !== "$class") out.set(k, resolve(v, depth + 1));
    return out;
  };
  return resolve(rootUid, 0);
}

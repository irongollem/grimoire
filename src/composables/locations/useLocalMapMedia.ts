// A moving map's file on THIS device (#1125 decision 6): it lives in OPFS keyed by the place id and is never
// uploaded, so a second device or a cleared browser simply does not have it. `url` is an object URL for playback;
// `missing` says the place wants a file this device lacks, which is when the DM is offered "Pick the file".
import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { getLocalMap, saveLocalMap } from "@/lib/mapImport/localMedia";

export interface ExpectedMapFile {
  fileName: string;
  bytes: number;
}

export function useLocalMapMedia(
  key: MaybeRefOrGetter<string | null>,
  expected: MaybeRefOrGetter<ExpectedMapFile | null> = null,
): {
  url: Ref<string | null>;
  missing: Ref<boolean>;
  /** The last picked file is not the one the place was imported with: warned about, never refused. */
  mismatch: Ref<boolean>;
  pick: (file: File) => Promise<void>;
} {
  const url = ref<string | null>(null);
  const missing = ref(false);
  const mismatch = ref(false);
  // A newer load (or a dispose) invalidates an older one still awaiting the file system.
  let generation = 0;

  function release() {
    if (url.value !== null) URL.revokeObjectURL(url.value);
    url.value = null;
  }

  async function load(k: string | null) {
    const mine = ++generation;
    release();
    missing.value = false;
    mismatch.value = false;
    if (k === null) return;
    const file = await getLocalMap(k);
    if (mine !== generation) return;
    if (file) url.value = URL.createObjectURL(file);
    else missing.value = true;
  }

  watch(() => toValue(key), load, { immediate: true });

  async function pick(file: File) {
    const k = toValue(key);
    if (k === null) return;
    if (!(await saveLocalMap(k, file))) return;
    const want = toValue(expected);
    await load(k);
    mismatch.value = want !== null && (want.fileName !== file.name || want.bytes !== file.size);
  }

  onScopeDispose(() => {
    generation++;
    release();
  });

  return { url, missing, mismatch, pick };
}

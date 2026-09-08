/**
 * The bucket registry, restated for the local-provisioning script.
 *
 * `src/lib/storage/buckets.ts` is the source of truth, but it cannot be
 * imported by a node script: it reads `import.meta.env` at module scope, which
 * is a Vite API that is neither defined nor typed under node — importing it
 * crashes at runtime and breaks `vue-tsc -b` in the node project. Making that
 * access tolerant would mean editing a module 378 files import, to suit a dev
 * script, so the table is duplicated instead.
 *
 * This file deliberately has **no imports at all**. That is what lets both
 * projects see it: the node project (via scripts/dev-buckets.ts) and the app
 * project (via src/lib/storage/bucketRegistryMirror.test.ts, which holds this
 * table equal to BUCKETS and fails the moment the two drift).
 */
export const LOCAL_BUCKETS: ReadonlyArray<{
  id: string;
  public: boolean;
  maxBytes: number;
  mimeTypes: readonly string[];
}> = [
  { id: "npc-portraits", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "asset-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "spell-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "puzzle-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "item-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "monster-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "trap-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "location-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "faction-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "pantheon-emblems", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "loot-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "sounds", public: true, maxBytes: 20971520, mimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/aac", "audio/flac"] },
  { id: "sound-images", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "chronicle", public: true, maxBytes: 5242880, mimeTypes: ["image/webp", "image/jpeg"] },
  { id: "mini-models", public: true, maxBytes: 52428800, mimeTypes: ["model/gltf-binary", "model/stl", "application/octet-stream", "image/webp"] },
];

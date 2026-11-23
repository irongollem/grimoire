/**
 * Convenience entry points for edge functions marking a freshly-generated
 * image with provenance, right before the bytes leave this pipeline —
 * either uploaded via `uploadWithRetry` (server-upload callers) or returned
 * as base64 in a JSON response for the client to upload (sync generators
 * that never touch storage themselves). Both wrap `embedProvenance`
 * (embed.ts), which already composes `buildXmpPacket` internally — this
 * module adds nothing to that call, only to the base64 round-trip most
 * callers here actually need.
 */
import type { AiProvenance } from "./types.ts";
import { embedProvenance } from "./embed.ts";
import { base64FromBytes as bytesToBase64 } from "../base64.ts";

/** Marks raw image bytes. Alias of `embedProvenance` kept for call-site symmetry with `markGeneratedImageB64` below. */
export function markGeneratedImage(bytes: Uint8Array, contentType: string, prov: AiProvenance): Uint8Array {
  return embedProvenance(bytes, contentType, prov);
}


function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Marks a base64-encoded image — the shape provider responses and this
 * pipeline's JSON payloads carry — and returns base64 again. For the edge
 * functions that hand a generated image straight back to the client
 * (entity-image, style-map, and the image legs of npc/location/trap) rather
 * than uploading it server-side.
 */
export function markGeneratedImageB64(b64: string, contentType: string, prov: AiProvenance): string {
  return bytesToBase64(markGeneratedImage(base64ToBytes(b64), contentType, prov));
}

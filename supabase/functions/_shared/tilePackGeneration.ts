import { OPENAI_IMAGE_SUNBURST } from "./platformModels.ts";

export function tilePackSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return null;
  const kind = text(12, 4);
  if (kind === "VP8X") {
    return {
      width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
      height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
    };
  }
  if (kind === "VP8 ") {
    return {
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
    };
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8),
      height: 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10),
    };
  }
  return null;
}

/**
 * The model a tile-pack slot renders on: `provider_config.tile_pack_model`, else
 * its `image_model`, else sunburst. Tiles have their own column because they come
 * out much better on sunburst than on flare (the maintainer, 16 Nov 2026), while
 * the rest of the platform paints on flare. The model is a setting, never a code
 * constant: this function used to hardcode the id and kept rendering on
 * `gpt-image-2` long after the platform had moved on, and nothing surfaced it
 * because a stale-but-valid model id renders perfectly well.
 */
export function tilePackModel(
  config: { tile_pack_model?: string | null; image_model?: string | null } | undefined,
): string {
  return config?.tile_pack_model || config?.image_model || OPENAI_IMAGE_SUNBURST;
}

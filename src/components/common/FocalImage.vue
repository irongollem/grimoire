<template>
  <div :class="['w-full h-full', format === 'token' && 'rounded-full overflow-hidden', format === 'square' && 'overflow-hidden']">
    <img
      v-if="src"
      ref="imgRef"
      :src="src ?? undefined"
      :alt="alt ?? ''"
      class="w-full h-full object-cover"
      :style="{ objectPosition }"
      @load="onLoad"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import smartcrop from "smartcrop";

export type ImageFormat = "portrait" | "landscape" | "token" | "square";

// Target crop ratios passed to smartcrop — should match the display context:
//   portrait  → playing card back  (63 × 88 mm ≈ 2:3)
//   landscape → MTG art box        (63 × 28 mm ≈ 9:4)
//   token     → circular token     (1:1)
const FORMAT_TARGETS: Record<ImageFormat, { width: number; height: number }> = {
  portrait: { width: 2, height: 3 },
  landscape: { width: 9, height: 4 },
  token: { width: 1, height: 1 },
  square: { width: 1, height: 1 },
};

// Default object-position before the focal point is resolved
const FORMAT_DEFAULTS: Record<ImageFormat, string> = {
  portrait: "50% 25%",
  landscape: "50% 40%",
  token: "50% 25%",
  square: "50% 25%",
};

// Bump when analysis logic or cache format changes
const CACHE_PREFIX = "focal_v3:";

const props = defineProps<{
  src?: string | null;
  alt?: string;
  format: ImageFormat;
  /** Manual override — when set, skips smartcrop entirely. Values are 0–100 percentages of the source image. */
  focalPoint?: { x: number; y: number } | null;
}>();


const imgRef = ref<HTMLImageElement | null>(null);
const objectPosition = ref(FORMAT_DEFAULTS[props.format]);

// Raw focal point: 0–100 percentages of the SOURCE IMAGE dimensions.
// This is stored/cached. The display object-position is computed separately
// using computeCenteredPosition() once the image dimensions are known.
const rawFocalPoint = ref<{ x: number; y: number } | null>(null);

/**
 * Convert a raw focal point (0–100% of source image) to the CSS object-position
 * value that centers that point in the displayed container.
 *
 * object-position: X% Y% aligns the X%-point of the image with the X%-point of
 * the container — NOT centering. To center focal point fp in the container we
 * need: objectPos = (fp_px - containerSize/2) / excessSize
 */
function computeCenteredPosition(
  img: HTMLImageElement,
  fp: { x: number; y: number },
): string {
  const cw = img.offsetWidth;
  const ch = img.offsetHeight;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  if (!cw || !ch || !iw || !ih) return FORMAT_DEFAULTS[props.format];

  // object-fit: cover scale
  const scale = Math.max(cw / iw, ch / ih);
  const scaledW = iw * scale;
  const scaledH = ih * scale;

  const excessX = scaledW - cw;
  const excessY = scaledH - ch;

  const fpXpx = (fp.x / 100) * scaledW;
  const fpYpx = (fp.y / 100) * scaledH;

  const x = excessX <= 0 ? 50 : Math.max(0, Math.min(100, ((fpXpx - cw / 2) / excessX) * 100));
  const y = excessY <= 0 ? 50 : Math.max(0, Math.min(100, ((fpYpx - ch / 2) / excessY) * 100));

  return `${Math.round(x)}% ${Math.round(y)}%`;
}

function onLoad() {
  const img = imgRef.value;
  if (!img || !rawFocalPoint.value) return;
  objectPosition.value = computeCenteredPosition(img, rawFocalPoint.value);
}

// ── Cache helpers ──────────────────────────────────────────────────────────────

function cacheKey(url: string) {
  return CACHE_PREFIX + url;
}
function readCache(url: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(cacheKey(url));
    return raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
  } catch {
    return null;
  }
}
function writeCache(url: string, fp: { x: number; y: number }) {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify(fp));
  } catch {}
}

// ── Smartcrop analysis ─────────────────────────────────────────────────────────

async function runSmartcrop(src: string): Promise<{ x: number; y: number } | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });

  if (!img.naturalWidth) return null;

  // For portrait-oriented source images (taller than wide), boost the upper 45%
  // so smartcrop favours the face over high-saturation details lower down.
  const isPortraitImage = img.naturalHeight > img.naturalWidth;
  const boosts = isPortraitImage
    ? [{ x: 0, y: 0, width: img.naturalWidth, height: Math.floor(img.naturalHeight * 0.45), weight: 1.0 }]
    : [];

  try {
    const result = await smartcrop.crop(img, { ...FORMAT_TARGETS[props.format], boost: boosts });
    const crop = result.topCrop;
    return {
      x: Math.round(((crop.x + crop.width / 2) / img.naturalWidth) * 100),
      y: Math.round(((crop.y + crop.height / 2) / img.naturalHeight) * 100),
    };
  } catch {
    return null;
  }
}

// ── Main resolution logic ──────────────────────────────────────────────────────

async function resolve(src: string, manualFp: { x: number; y: number } | null | undefined) {
  if (manualFp) {
    rawFocalPoint.value = manualFp;
  } else {
    const cached = readCache(src);
    if (cached) {
      rawFocalPoint.value = cached;
    } else {
      const computed = await runSmartcrop(src);
      if (computed) {
        rawFocalPoint.value = computed;
        writeCache(src, computed);
      }
    }
  }

  // Apply if the image element already finished loading
  const img = imgRef.value;
  if (img?.complete && img.naturalWidth && rawFocalPoint.value) {
    objectPosition.value = computeCenteredPosition(img, rawFocalPoint.value);
  }
}

watch(
  [() => props.src, () => props.focalPoint],
  ([url, fp]) => {
    rawFocalPoint.value = null;
    objectPosition.value = FORMAT_DEFAULTS[props.format];
    if (url) resolve(url, fp);
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="rootRef"
    :class="[
      'w-full h-full',
      format === 'token' && 'rounded-full overflow-hidden',
      format === 'square' && 'overflow-hidden',
    ]"
  >
    <img
      v-if="src"
      ref="imgRef"
      :src="displaySrc"
      :alt="alt ?? ''"
      :class="isClipped ? 'w-full' : 'w-full h-full object-cover'"
      :style="
        isClipped
          ? { transform: `translateY(${clippedTranslateY}px)` }
          : { objectPosition }
      "
      loading="lazy"
      @load="onLoad"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
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

// ── Supabase image transforms (Pro plan) ───────────────────────────────────────
// Set VITE_SUPABASE_TRANSFORMS=true in .env.local (and Vercel env vars) to enable.
// When disabled, falls back to raw URLs — zero behavior change.

const TRANSFORMS_ENABLED = import.meta.env.VITE_SUPABASE_TRANSFORMS === "true";

const FORMAT_RENDER_WIDTHS: Record<ImageFormat, number> = {
  portrait: 400,
  landscape: 600,
  token: 200,
  square: 300,
};

function toRenderUrl(url: string, width: number, quality = 80): string {
  if (!TRANSFORMS_ENABLED) return url;
  return (
    url.replace("/storage/v1/object/", "/storage/v1/render/image/") +
    `?width=${width}&quality=${quality}&resize=contain`
  );
}

const displaySrc = computed(() =>
  props.src
    ? toRenderUrl(props.src, FORMAT_RENDER_WIDTHS[props.format])
    : undefined,
);

const rootRef = ref<HTMLElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);
const objectPosition = ref(FORMAT_DEFAULTS[props.format]);
// Clipped mode: image taller than its overflow:hidden container (no h-full in chain).
// Use translateY to center the focal point instead of object-position.
const isClipped = ref(false);
const clippedTranslateY = ref(0);

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

  if (!iw || !ih) return FORMAT_DEFAULTS[props.format];
  // Element has no layout dimensions (e.g. inside display:none print container).
  // Use the format's known aspect ratio as proxy container dimensions — the
  // math is ratio-based so this gives the exact same result as real pixel dims.
  const { width: proxyW, height: proxyH } = FORMAT_TARGETS[props.format];
  const _cw = cw || proxyW;
  const _ch = ch || proxyH;

  // object-fit: cover scale
  const scale = Math.max(_cw / iw, _ch / ih);
  const scaledW = iw * scale;
  const scaledH = ih * scale;

  const excessX = scaledW - _cw;
  const excessY = scaledH - _ch;

  const fpXpx = (fp.x / 100) * scaledW;
  const fpYpx = (fp.y / 100) * scaledH;

  const x =
    excessX <= 0
      ? 50
      : Math.max(0, Math.min(100, ((fpXpx - _cw / 2) / excessX) * 100));
  const y =
    excessY <= 0
      ? 50
      : Math.max(0, Math.min(100, ((fpYpx - _ch / 2) / excessY) * 100));

  return `${Math.round(x)}% ${Math.round(y)}%`;
}

function applyFocalPoint(img: HTMLImageElement, fp: { x: number; y: number }) {
  const containerH = rootRef.value?.offsetHeight ?? 0;
  const renderedH = img.naturalHeight * (img.offsetWidth / img.naturalWidth);

  // Clipped mode: image renders at natural height, container clips it via overflow:hidden.
  // object-position has no effect here — use translateY to center the focal point.
  if (containerH > 0 && renderedH > containerH + 2) {
    isClipped.value = true;
    const focusY = (fp.y / 100) * renderedH;
    const offset = Math.max(
      0,
      Math.min(renderedH - containerH, focusY - containerH / 2),
    );
    clippedTranslateY.value = -offset;
  } else {
    isClipped.value = false;
    clippedTranslateY.value = 0;
    objectPosition.value = computeCenteredPosition(img, fp);
  }
}

function onLoad() {
  const img = imgRef.value;
  if (!img || !rawFocalPoint.value) return;
  applyFocalPoint(img, rawFocalPoint.value);
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

async function runSmartcrop(
  src: string,
): Promise<{ x: number; y: number } | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = toRenderUrl(src, 400, 75);
  });

  if (!img.naturalWidth) return null;

  // For portrait-oriented source images (taller than wide), boost the upper 45%
  // so smartcrop favours the face over high-saturation details lower down.
  const isPortraitImage = img.naturalHeight > img.naturalWidth;
  const boosts = isPortraitImage
    ? [
        {
          x: 0,
          y: 0,
          width: img.naturalWidth,
          height: Math.floor(img.naturalHeight * 0.45),
          weight: 1.0,
        },
      ]
    : [];

  try {
    const result = await smartcrop.crop(img, {
      ...FORMAT_TARGETS[props.format],
      boost: boosts,
    });
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

async function resolve(
  src: string,
  manualFp: { x: number; y: number } | null | undefined,
) {
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
    applyFocalPoint(img, rawFocalPoint.value);
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

// Recalculate focal position on resize — translateY depends on both the
// rendered image height and the container clip height, both of which change
// when the viewport is resized.
const resizeObserver = new ResizeObserver(() => {
  const img = imgRef.value;
  if (img?.complete && img.naturalWidth && rawFocalPoint.value) {
    applyFocalPoint(img, rawFocalPoint.value);
  }
});

watch(rootRef, (el, prev) => {
  if (prev) resizeObserver.unobserve(prev);
  if (el) resizeObserver.observe(el);
});

onBeforeUnmount(() => resizeObserver.disconnect());
</script>

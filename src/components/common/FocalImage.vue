<template>
  <div
    ref="rootRef"
    v-bind="$attrs"
    :class="[
      'w-full h-full',
      format === 'token' && 'rounded-full overflow-hidden',
      format === 'square' && 'overflow-hidden',
      lightbox && src && 'cursor-zoom-in',
    ]"
    @click="handleImageClick"
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
      :loading="print ? 'eager' : 'lazy'"
      @load="onLoad"
      @error="onError"
    />
    <img
      v-else-if="placeholder"
      ref="placeholderImgRef"
      :src="placeholder"
      :alt="alt ?? ''"
      class="w-full h-full object-cover opacity-40"
      :style="{ objectPosition }"
      loading="lazy"
      @load="onPlaceholderLoad"
    />
  </div>
  <ImageLightbox v-if="lightbox" :src="lightboxSrc" @close="lightboxSrc = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import smartcrop from "smartcrop";
import { backfillVariants, type VariantWidth } from "@/lib/storage";
import ImageLightbox from "@/components/common/ImageLightbox.vue";
import { initPlaceholderFocalPoints, getPlaceholderFocalPoint } from "@/lib/placeholderFocalPoints";

export type ImageFormat = "portrait" | "landscape" | "token" | "square";

defineOptions({ inheritAttrs: false });

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
  /** Override the default variant width for this format. Use 600 for large detail-view portraits. */
  renderWidth?: VariantWidth;
  /** When true, skip variant URL derivation and serve the full-resolution original.
   *  Use this in Card Forge where images are printed at ~300 DPI. */
  print?: boolean;
  /** When true, clicking the image opens a full-resolution lightbox overlay. */
  lightbox?: boolean;
  /** Fallback image URL shown (dimmed) when src is null/undefined. */
  placeholder?: string;
}>();

const FORMAT_RENDER_WIDTHS: Record<ImageFormat, VariantWidth> = {
  portrait: 400,
  landscape: 600,
  token: 200,
  square: 300,
};

function toVariantUrl(url: string, width: VariantWidth): string {
  // Variants are always .webp regardless of the original's extension (png/jpeg/webp).
  const lastDot = url.lastIndexOf(".");
  const stem = lastDot === -1 ? url : url.slice(0, lastDot);
  return `${stem}_w${width}.webp`;
}

// Set to true when the variant URL returns a 4xx — falls back to original.
// Reset when props.src changes (new upload will have variants).
const variantFailed = ref(false);

const lightboxSrc = ref<string | null>(null);

function handleImageClick() {
  if (props.lightbox && props.src) lightboxSrc.value = props.src;
}

// Matches URLs that are already pre-sized variants (_w200/_w300/_w400/_w600).
// If image_url in the DB was accidentally set to a variant path (e.g. by the
// old one-time backfill script), deriving another variant would double the
// suffix (_w400_w600.webp) — serve the stored variant as-is instead.
const VARIANT_URL_RE = /_w(?:200|300|400|600)\.webp$/;

const displaySrc = computed(() => {
  if (!props.src) return undefined;
  // blob:/data: URLs can't be converted to variant paths — serve as-is.
  if (props.print || variantFailed.value || !props.src.startsWith("http")) return props.src;
  // Already a variant URL in DB — use it directly, skip double-suffixing.
  if (VARIANT_URL_RE.test(props.src)) return props.src;
  return toVariantUrl(props.src, props.renderWidth ?? FORMAT_RENDER_WIDTHS[props.format]);
});

const rootRef = ref<HTMLElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);
const placeholderImgRef = ref<HTMLImageElement | null>(null);
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

function onPlaceholderLoad() {
  const img = placeholderImgRef.value;
  if (!img || !rawFocalPoint.value) return;
  applyFocalPoint(img, rawFocalPoint.value);
}

function onError() {
  // Variant is missing — flip to original. variantFailed causes displaySrc to
  // return props.src, so Vue re-renders cleanly without any further 4xx.
  variantFailed.value = true;
  // Backfill the missing variants in the background so future loads use them.
  if (props.src) void backfillVariants(props.src);
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
    img.onerror = () => {
      // Variant missing — fall back to original for smartcrop analysis.
      if (img.src !== src) { img.src = src; } else { resolve(); }
    };
    // Local assets (placeholders) have no variants — skip _w400 to avoid 404s.
    img.src = src.startsWith("http") ? toVariantUrl(src, 400) : src;
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

/** Extract entity type key from a placeholder URL: /assets/placeholders/npc.webp → "npc" */
function entityTypeFromPlaceholder(url: string): string | null {
  const filename = url.split("/").pop();
  return filename ? filename.replace(/\.[^.]+$/, "") || null : null;
}

async function resolvePlaceholder(url: string) {
  // Ensure admin-configured focal points are loaded (no-op after first call).
  await initPlaceholderFocalPoints();

  // 1. Admin DB override takes priority
  const entityType = entityTypeFromPlaceholder(url);
  if (entityType) {
    const adminFp = getPlaceholderFocalPoint(entityType);
    if (adminFp) {
      rawFocalPoint.value = adminFp;
      const img = placeholderImgRef.value;
      if (img?.complete && img.naturalWidth) applyFocalPoint(img, adminFp);
      return;
    }
  }

  // 2. localStorage cache (previous smartcrop result)
  const cached = readCache(url);
  if (cached) {
    rawFocalPoint.value = cached;
    return;
  }

  // 3. Run smartcrop on the placeholder image (portrait targets for face detection)
  const computed = await runSmartcrop(url);
  if (computed) {
    rawFocalPoint.value = computed;
    writeCache(url, computed);
    const img = placeholderImgRef.value;
    if (img?.complete && img.naturalWidth) applyFocalPoint(img, computed);
  }
}

watch(
  [() => props.src, () => props.placeholder, () => props.focalPoint],
  ([url, ph, fp]) => {
    rawFocalPoint.value = null;
    objectPosition.value = FORMAT_DEFAULTS[props.format];
    variantFailed.value = false;
    if (url) {
      void resolve(url, fp);
    } else if (ph) {
      void resolvePlaceholder(ph);
    }
  },
  { immediate: true },
);

// Recalculate focal position on resize — translateY depends on both the
// rendered image height and the container clip height, both of which change
// when the viewport is resized.
const resizeObserver = new ResizeObserver(() => {
  const img = imgRef.value ?? placeholderImgRef.value;
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

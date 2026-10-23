/**
 * The owner's preview of an unreleased Open Book (#1085). The reader at /w/<slug> is the real one; this marker only
 * tells it to read the owner's draft through their session instead of the public release. It lives in
 * sessionStorage, so it ends with the tab and never reaches a visitor's browser.
 */
import { ref } from "vue";
import { safeSessionStorage } from "@/lib/safeLocalStorage";

const KEY = "grimoire:open-book-preview";

type Marker = { slug: string; campaignId: string };

function read(): Marker | null {
  try {
    const raw = safeSessionStorage().getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { slug, campaignId } = parsed as Record<string, unknown>;
    return typeof slug === "string" && typeof campaignId === "string" ? { slug, campaignId } : null;
  } catch {
    return null;
  }
}

/** Reactive, so the views leave preview the moment it ends. */
const marker = ref<Marker | null>(read());

export function startPreview(slug: string, campaignId: string): void {
  marker.value = { slug, campaignId };
  try {
    safeSessionStorage().setItem(KEY, JSON.stringify(marker.value));
  } catch {
    // Storage refused the write: the marker still holds for this page's lifetime.
  }
}

export function endPreview(): void {
  marker.value = null;
  try {
    safeSessionStorage().removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The campaign being previewed at this slug, or null when the slug is read publicly. */
export function previewFor(slug: string | null): string | null {
  const m = marker.value;
  return m && slug !== null && m.slug === slug ? m.campaignId : null;
}

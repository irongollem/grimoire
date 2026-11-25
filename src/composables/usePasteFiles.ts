/**
 * Ctrl-V / ⌘V for a drop zone: a file on the clipboard (a screenshot, an image
 * copied from a browser) goes where a dropped file would.
 *
 * A page can hold several zones (an NPC sheet has a portrait box and a rich
 * text field), so a paste must never land somewhere the DM did not mean. One
 * document listener picks a single zone: the one under the pointer, else the
 * one holding keyboard focus. A paste aimed at a text field (an input, a
 * textarea, the rich text editor) is left to that field, wherever the pointer
 * rests, so the editor keeps its own image paste.
 */
import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { tryOnScopeDispose, useEventListener, useFocusWithin } from "@vueuse/core";
import { isMacPlatform, isTextEntryTarget } from "@/lib/hotkeys";

export interface PasteFilesOptions {
  /** Which clipboard files this zone takes; the rest are ignored. Every file by default. */
  accept?: (file: File) => boolean;
  /** False while the zone cannot take a file (uploading, full). */
  enabled?: MaybeRefOrGetter<boolean>;
}

interface PasteZone {
  el: () => HTMLElement | null;
  hovered: Ref<boolean>;
  enabled: () => boolean;
  accept: (file: File) => boolean;
  onFiles: (files: File[]) => void;
}

const zones = new Set<PasteZone>();

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** The files on a clipboard or drag payload that `accept` takes. */
export function filesFrom(data: DataTransfer | null, accept: (file: File) => boolean = () => true): File[] {
  if (!data) return [];
  return Array.from(data.files).filter(accept);
}

/** A focused file input is a zone's own picker, not a text field. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement && target.type === "file") return false;
  return isTextEntryTarget(target);
}

/** The zone a paste goes to: under the pointer first, else holding focus. Exported for tests. */
export function pickZone<Z extends { el: () => HTMLElement | null; hovered: Ref<boolean>; enabled: () => boolean }>(
  candidates: Iterable<Z>,
  active: Element | null,
): Z | null {
  const live = [...candidates].filter((z) => z.enabled() && z.el() !== null);
  return live.find((z) => z.hovered.value)
    ?? live.find((z) => active !== null && z.el()!.contains(active))
    ?? null;
}

function onDocumentPaste(event: ClipboardEvent): void {
  if (event.defaultPrevented || isTextField(event.target)) return;
  const zone = pickZone(zones, document.activeElement);
  if (!zone) return;
  const files = filesFrom(event.clipboardData, zone.accept);
  if (files.length === 0) return;
  event.preventDefault();
  zone.onFiles(files);
}

function register(zone: PasteZone): void {
  if (zones.size === 0) document.addEventListener("paste", onDocumentPaste);
  zones.add(zone);
}

function unregister(zone: PasteZone): void {
  zones.delete(zone);
  if (zones.size === 0) document.removeEventListener("paste", onDocumentPaste);
}

/**
 * Makes `target` take pasted files. `armed` is true while a paste would land
 * here, for a zone that wants to say so ("or paste").
 */
export function usePasteFiles(
  target: Readonly<Ref<HTMLElement | null | undefined>>,
  onFiles: (files: File[]) => void,
  { accept = () => true, enabled = true }: PasteFilesOptions = {},
): { armed: Readonly<Ref<boolean>> } {
  const hovered = ref(false);
  useEventListener(target, "pointerenter", () => { hovered.value = true; });
  useEventListener(target, "pointerleave", () => { hovered.value = false; });
  const { focused } = useFocusWithin(target);

  const zone: PasteZone = {
    el: () => target.value ?? null,
    hovered,
    enabled: () => toValue(enabled),
    accept,
    onFiles,
  };
  register(zone);
  tryOnScopeDispose(() => unregister(zone));

  return { armed: computed(() => toValue(enabled) && (hovered.value || focused.value)) };
}

/** "⌘V" on a Mac, "Ctrl+V" elsewhere, for a zone's paste hint. */
export function pasteKeyLabel(): string {
  return isMacPlatform() ? "⌘V" : "Ctrl+V";
}

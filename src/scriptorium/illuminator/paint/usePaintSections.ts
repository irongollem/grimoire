import { ref } from "vue";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

export const PAINT_SECTIONS = [
  { id: "brushes", label: "Brushes" },
  { id: "layers", label: "Layers" },
  { id: "colour", label: "Colour" },
  { id: "versions", label: "Versions" },
] as const;
export type PaintSectionId = (typeof PAINT_SECTIONS)[number]["id"];

export const PAINT_SECTIONS_KEY = "grimoire:illuminate:paint-sections";
const FIRST_TIME: PaintSectionId[] = ["brushes", "layers"];

function remembered(): PaintSectionId[] {
  try {
    const raw = safeLocalStorage().getItem(PAINT_SECTIONS_KEY);
    if (raw === null) return [...FIRST_TIME];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return PAINT_SECTIONS.map((s) => s.id).filter((id) => parsed.includes(id));
  } catch {
    /* blocked or garbled storage: the first-time set */
  }
  return [...FIRST_TIME];
}

/**
 * Which blades of the painting panel are open: any number at once, kept per device. A blocked or full storage
 * only costs the memory.
 */
export function usePaintSections() {
  const open = ref<PaintSectionId[]>(remembered());
  function save(): void {
    try {
      safeLocalStorage().setItem(PAINT_SECTIONS_KEY, JSON.stringify(open.value));
    } catch {
      /* not remembered */
    }
  }
  const isOpen = (id: PaintSectionId) => open.value.includes(id);
  function set(id: PaintSectionId, value: boolean): void {
    if (isOpen(id) === value) return;
    open.value = value ? [...open.value, id] : open.value.filter((x) => x !== id);
    save();
  }
  const toggle = (id: PaintSectionId) => set(id, !isOpen(id));
  return { open, isOpen, set, toggle };
}

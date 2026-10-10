import type { ImageVariant } from "@/components/common/entity/EntityImageBlock.vue";

/**
 * The True Form / Cutout / Alter Ego tab over an NPC's portrait art (#917
 * story 4) — one shared definition so the desktop sidebar (NpcSidebar.vue)
 * and the phone editor (NpcEditMobile.vue) cannot drift on the tab ids or
 * labels. Not `useArtTabs.ts` (the monster/item Picture/Cutout pair):
 * an NPC already has a two-tab portrait switch (True Form / Alter Ego) that
 * predates that module, and reusing its two-value `ArtTab` type here would
 * either drop the disguise tab or force a third value into a type another
 * entity relies on staying binary.
 *
 * The cutout is always of the TRUE form — a disguised NPC's alter ego gets no
 * cutout of its own, same as `entityArt.ts`'s figures being a property of one
 * image pair per entity, not per persona.
 */
export type NpcArtTab = "true-form" | "cutout" | "alter-ego";

export const NPC_ART_VARIANTS: readonly ImageVariant[] = [
  { id: "true-form", label: "True Form" },
  { id: "cutout", label: "Cutout" },
  { id: "alter-ego", label: "Alter Ego" },
];

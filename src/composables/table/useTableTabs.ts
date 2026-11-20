import { computed, ref, watch, type Ref } from "vue";

export type TableTab = "story" | "sheet" | "scene";

export interface TableTabsDeps {
  /** Three columns fit: nothing is a tab. */
  showAll: Ref<boolean>;
  /** A tablet draws story and scene side by side. */
  wide: Ref<boolean>;
  /** Whether the sitting has a character whose sheet can be opened. */
  hasSheet: () => boolean;
  /** Whether a roll is being waited on. */
  asking: () => boolean;
}

/** The tabs of the table screen below `lg`, and which of them is on screen. */
export function useTableTabs(deps: TableTabsDeps) {
  const tab = ref<TableTab>("story");
  // What is on screen below `lg`. A tablet draws story and scene side by side, so for it "scene" is the story's tab; a
  // sitting with nobody readable has no sheet to open.
  const view = computed<TableTab>(() => {
    if (deps.showAll.value) return "story";
    if (tab.value === "sheet" && !deps.hasSheet()) return "story";
    if (tab.value === "scene" && deps.wide.value) return "story";
    return tab.value;
  });
  const tabOptions = computed<Array<{ value: TableTab; label: string }>>(() => [
    { value: "story" as const, label: "Story" },
    ...(deps.hasSheet() ? [{ value: "sheet" as const, label: "Sheet" }] : []),
    ...(deps.wide.value ? [] : [{ value: "scene" as const, label: "Scene" }]),
  ]);
  // A roll the story asks for brings the player back to it, from whichever tab they were reading.
  watch(
    () => deps.asking(),
    (now) => {
      if (now) tab.value = "story";
    },
  );
  return { tab, view, tabOptions };
}

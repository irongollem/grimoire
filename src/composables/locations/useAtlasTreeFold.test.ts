import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";
import { useUiStore } from "@/stores/ui";
import { useAtlasTreeFold } from "./useAtlasTreeFold";

describe("useAtlasTreeFold", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("follows the DM's own fold when no pane is asking for the width", () => {
    const ui = useUiStore();
    const { treeFolded, foldTree, unfoldTree } = useAtlasTreeFold(ref(false));
    expect(treeFolded.value).toBe(false);

    foldTree();
    expect(treeFolded.value).toBe(true);
    expect(ui.locationsTreeCollapsed).toBe(true);

    unfoldTree();
    expect(treeFolded.value).toBe(false);
    expect(ui.locationsTreeCollapsed).toBe(false);
  });

  it("folds for a pane that wants the width without writing the saved preference", async () => {
    const ui = useUiStore();
    const paneWantsWidth = ref(true);
    const { treeFolded } = useAtlasTreeFold(paneWantsWidth);

    expect(treeFolded.value).toBe(true);
    // The bug this replaces: the automatic fold wrote the stored flag, so a
    // reload while a site was running left the tree folded for good.
    expect(ui.locationsTreeCollapsed).toBe(false);
    await nextTick();
    expect(localStorage.getItem("grimoire:atlas:treeCollapsed")).not.toBe("true");

    paneWantsWidth.value = false;
    expect(treeFolded.value).toBe(false);
  });

  it("lets the DM reopen the tree beside such a pane, for that stretch only", async () => {
    const ui = useUiStore();
    const paneWantsWidth = ref(true);
    const { treeFolded, foldTree, unfoldTree } = useAtlasTreeFold(paneWantsWidth);

    unfoldTree();
    expect(treeFolded.value).toBe(false);
    foldTree();
    expect(treeFolded.value).toBe(true);
    expect(ui.locationsTreeCollapsed).toBe(false);

    // Reopened, then the pane stops asking and asks again: folded once more.
    unfoldTree();
    paneWantsWidth.value = false;
    await nextTick();
    paneWantsWidth.value = true;
    await nextTick();
    expect(treeFolded.value).toBe(true);
  });

  it("keeps a fold the DM set themselves after the pane stops asking", () => {
    const ui = useUiStore();
    ui.locationsTreeCollapsed = true;
    const paneWantsWidth = ref(true);
    const { treeFolded } = useAtlasTreeFold(paneWantsWidth);

    paneWantsWidth.value = false;
    expect(treeFolded.value).toBe(true);
  });

  it("opens the results when a search is typed into a folded tree", async () => {
    const ui = useUiStore();
    ui.locationsTreeCollapsed = true;
    const { treeFolded, resultsOpen } = useAtlasTreeFold(ref(false));
    expect(treeFolded.value).toBe(true);

    ui.locationsSearch = "trout";
    await nextTick();
    expect(resultsOpen.value).toBe(true);
    expect(treeFolded.value).toBe(false);
    // Showing results is not a change of mind about the fold.
    expect(ui.locationsTreeCollapsed).toBe(true);
  });

  it("opens the results for the type filter too, and beside a pane that wants the width", async () => {
    const ui = useUiStore();
    const { treeFolded } = useAtlasTreeFold(ref(true));
    expect(treeFolded.value).toBe(true);

    ui.locationsFilterType = "tavern";
    await nextTick();
    expect(treeFolded.value).toBe(false);
  });

  it("puts the results away once a match is picked, and again when the filters are cleared", async () => {
    const ui = useUiStore();
    ui.locationsTreeCollapsed = true;
    const { treeFolded, resultsOpen, closeResults } = useAtlasTreeFold(ref(false));

    ui.locationsSearch = "trout";
    await nextTick();
    closeResults();
    expect(resultsOpen.value).toBe(false);
    expect(treeFolded.value).toBe(true);

    // Refining the search brings them back.
    ui.locationsSearch = "trout inn";
    await nextTick();
    expect(resultsOpen.value).toBe(true);

    ui.resetLocationsFilters();
    await nextTick();
    expect(resultsOpen.value).toBe(false);
    expect(treeFolded.value).toBe(true);
  });

  it("does not reopen results for a search left over from an earlier visit", () => {
    const ui = useUiStore();
    ui.locationsSearch = "trout";
    ui.locationsTreeCollapsed = true;
    const { resultsOpen, treeFolded } = useAtlasTreeFold(ref(false));

    expect(resultsOpen.value).toBe(false);
    expect(treeFolded.value).toBe(true);
  });

  it("folding the tree by hand also puts the results away", async () => {
    const ui = useUiStore();
    ui.locationsTreeCollapsed = true;
    const { treeFolded, foldTree } = useAtlasTreeFold(ref(false));

    ui.locationsSearch = "trout";
    await nextTick();
    expect(treeFolded.value).toBe(false);

    foldTree();
    expect(treeFolded.value).toBe(true);
  });
});

// World web filters (#1084). A graph is not a list, but its filters are filters:
// opening a sheet from the web and coming back should not drop the query, the
// kinds switched off or the group being drawn.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { GroupKind, WebKind } from "@/lib/worldWeb/kinds";
import type { TieFamily } from "@/lib/worldWeb/ties";

export const useWorldUiStore = defineStore("ui:world", () => {
  const worldWebSearch = ref("");
  /** Kinds switched off in the chip row. Empty is everything: a fresh web shows the whole world. */
  const worldWebHiddenKinds = ref<WebKind[]>([]);
  /** What to gather in a hull: a faction's members, a place's residents, a deity's faithful. "" is nothing. */
  const worldWebGroupKind = ref<GroupKind | "">("");
  const worldWebGroupId = ref("");
  /** Narrows the lines to one family of tie. */
  const worldWebTieFamily = ref<TieFamily | "">("");

  const hasActiveFilters = computed(
    () =>
      worldWebSearch.value !== "" ||
      worldWebHiddenKinds.value.length > 0 ||
      worldWebGroupId.value !== "" ||
      worldWebTieFamily.value !== "",
  );

  function toggleKind(kind: WebKind) {
    worldWebHiddenKinds.value = worldWebHiddenKinds.value.includes(kind)
      ? worldWebHiddenKinds.value.filter((k) => k !== kind)
      : [...worldWebHiddenKinds.value, kind];
  }

  function setGroup(kind: GroupKind | "", id = "") {
    worldWebGroupKind.value = kind;
    worldWebGroupId.value = id;
  }

  function resetWorldWebFilters() {
    worldWebSearch.value = "";
    worldWebHiddenKinds.value = [];
    worldWebGroupKind.value = "";
    worldWebGroupId.value = "";
    worldWebTieFamily.value = "";
  }

  return {
    worldWebSearch,
    worldWebHiddenKinds,
    worldWebGroupKind,
    worldWebGroupId,
    worldWebTieFamily,
    hasActiveFilters,
    toggleKind,
    setGroup,
    resetWorldWebFilters,
  };
});

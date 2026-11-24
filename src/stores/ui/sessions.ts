// The Sessions page's list state: the order the Chronicle reads in. Session-scoped, so it survives navigation.
import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChronicleOrder } from "@/lib/canon/canonChronicle";

export const useSessionsUiStore = defineStore("ui:sessions", () => {
  const chronicleOrder = ref<ChronicleOrder>("newest");
  return { chronicleOrder };
});

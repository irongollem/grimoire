import { readonly, ref } from "vue";
import type { CharacterSpellEntry } from "@/types/spell.types";

const candidate = ref<CharacterSpellEntry | null>(null);

/** Shared hand-off between the prepared list and spell browser. */
export function useSpellReplacement() {
  return {
    candidate: readonly(candidate),
    choose: (entry: CharacterSpellEntry) => { candidate.value = entry; },
    clear: () => { candidate.value = null; },
  };
}

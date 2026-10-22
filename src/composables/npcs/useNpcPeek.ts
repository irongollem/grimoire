import { inject, provide, readonly, ref, type InjectionKey } from "vue";

/**
 * Seeing another NPC without losing the one on screen ("who was that again?").
 *
 * Inside an NPC modal, a name opens in the same modal: it replaces what is shown
 * and a back arrow returns (NpcDetailModal keeps the trail and provides itself
 * here). Anywhere else, such as the edit screen or a character page, it opens
 * the NPC modal on top of the page; NpcPeekHost, mounted once in the DM layout,
 * renders that one.
 */
interface NpcModalNav {
  open(id: string): void;
}

const NPC_MODAL_NAV: InjectionKey<NpcModalNav> = Symbol("npc-modal-nav");

const peekId = ref<string | null>(null);

/** For NpcDetailModal: names clicked inside it open here, not in a new modal. */
export function provideNpcModalNav(nav: NpcModalNav): void {
  provide(NPC_MODAL_NAV, nav);
}

/** For NpcPeekHost: the NPC opened from outside any NPC modal. */
export function useNpcPeek() {
  return {
    peekId: readonly(peekId),
    close(): void {
      peekId.value = null;
    },
  };
}

/** Open an NPC from a name: in the enclosing NPC modal if there is one, else as a modal over the page. */
export function useOpenNpc(): (id: string) => void {
  const nav = inject(NPC_MODAL_NAV, null);
  return (id: string) => {
    if (nav) nav.open(id);
    else peekId.value = id;
  };
}

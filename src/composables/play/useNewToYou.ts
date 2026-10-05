import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import type { NewToYouItem } from "@/components/play/people/NewToYouStrip.vue";
import type { NewToYouKind } from "@/components/play/people/NewToYouCard.vue";
import { classifyPeople } from "@/lib/npcs/peopleLedger";
import { getNpcDisplayFocalPoint, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import type { PlayerNpc } from "@/types/npc.types";

export interface NewToYouEntry {
  npc: PlayerNpc;
  kind: NewToYouKind;
}

/** The card for one waiting NPC: what the party sees after the turn, and the cover before it. */
export function toNewToYouItem(entry: NewToYouEntry, place: string | null): NewToYouItem {
  const { npc, kind } = entry;
  const visible = (field: string) => npc.player_visible_fields.includes(field);
  const what = [visible("race") ? npc.race : null, visible("occupation") ? npc.occupation : null]
    .filter((part): part is string => !!part)
    .join(" · ");
  const showPortrait = visible("portrait");
  return {
    id: npc.id,
    kind,
    place,
    person: {
      name: visible("name") ? npc.name : null,
      what: what || null,
      portraitUrl: showPortrait ? getNpcDisplayPortrait(npc) : null,
      focalPoint: showPortrait ? (getNpcDisplayFocalPoint(npc) ?? null) : null,
      relationship: npc.relationship,
    },
    cover:
      kind === "unmasked"
        ? {
            name: npc.disguise_name,
            portraitUrl: npc.disguise_portrait_url,
            focalPoint: npc.disguise_portrait_focal_point ?? null,
          }
        : undefined,
  };
}

/**
 * Splits the player's NPCs into the "New to you" strip and the ledger.
 *
 * Nothing is classified until the read map has loaded: before that every NPC
 * looks unread, and the whole page would flash face down. A person turned this
 * visit stays in the strip (turned, in place) even though marking them read
 * moves them out of the waiting set, so the card does not vanish under the
 * player's finger.
 */
export function useNewToYou(
  npcs: MaybeRefOrGetter<readonly PlayerNpc[]>,
  readMap: MaybeRefOrGetter<ReadonlyMap<string, Date> | undefined>,
) {
  const turnedKinds = ref(new Map<string, NewToYouKind>());

  const classified = computed(() => {
    const read = toValue(readMap);
    return read ? classifyPeople(toValue(npcs), read) : null;
  });

  const ready = computed(() => classified.value !== null);

  const entries = computed<NewToYouEntry[]>(() => {
    const c = classified.value;
    if (!c) return [];
    const waiting = new Map<string, NewToYouKind>();
    for (const npc of c.unmasked) waiting.set(npc.id, "unmasked");
    for (const npc of c.faceDown) waiting.set(npc.id, "new");
    const out: NewToYouEntry[] = [];
    for (const npc of toValue(npcs)) {
      const kind = waiting.get(npc.id) ?? turnedKinds.value.get(npc.id);
      if (kind) out.push({ npc, kind });
    }
    return out;
  });

  const ledger = computed(() => classified.value?.ledger ?? []);

  /** Call as the card turns, before the NPC is marked read. */
  function turn(id: string) {
    if (turnedKinds.value.has(id)) return;
    const kind = entries.value.find((e) => e.npc.id === id)?.kind;
    if (!kind) return;
    turnedKinds.value = new Map(turnedKinds.value).set(id, kind);
  }

  return { ready, entries, ledger, turn };
}

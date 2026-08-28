<template>
  <!--
    A puzzle's reveal, in the app's one reveal control.

    Puzzles were the last entity that could not name an audience: a single
    `is_shared` boolean revealed the room to the whole campaign or to nobody.
    `20260817230740` gave them `player_visible_to`, so the DM can hand the
    riddle to the character standing in front of it.

    The "what" is which hints the party has been given. Hints are the puzzle's
    reveal ladder — a DM lets them out one at a time as the table gets stuck —
    so they belong exactly where the audience decision is, rather than in a
    separate panel further down the page.

    `read_aloud` deliberately did *not* come along. It is text the DM writes,
    not a switch they flip, and a textarea inside a popover is a bad place to
    write anything; it now lives in the page body with the puzzle's other prose.
  -->
  <RevealControl :adapter="adapter" :entity-name="puzzle.name" :form="form">
    <template #what>
      <p class="mb-2 font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground">
        HINTS GIVEN
      </p>
      <div v-if="hints.length" class="flex flex-col gap-1">
        <RevealOption
          v-for="hint in hints"
          :key="hint.order"
          :label="`Hint ${hint.order}`"
          :checked="sharedHints.includes(hint.order)"
          @toggle="toggleHint(hint.order)"
        />
      </div>
      <p v-else class="text-caption text-muted-foreground italic">
        This puzzle has no hints yet.
      </p>
    </template>
  </RevealControl>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import RevealControl from "@/components/common/RevealControl.vue";
import RevealOption from "@/components/common/RevealOption.vue";
import { useParty } from "@/composables/party/useParty";
import { useUpdatePuzzle } from "@/composables/dungeon-features/usePuzzles";
import { arrayRevealAdapter } from "@/lib/reveal";
import type { RevealForm } from "@/lib/reveal";
import { useCampaignStore } from "@/stores/campaign";
import type { PuzzleRoom, PuzzleUpdate } from "@/types/puzzle.types";

const { puzzle, form = "button" } = defineProps<{
  puzzle: PuzzleRoom;
  form?: RevealForm;
}>();

const { mutate: updatePuzzle } = useUpdatePuzzle();
const { data: partyData } = useParty();
const campaign = useCampaignStore();

/** Local optimistic state, so a toggle lands without waiting for the refetch. */
const visibleTo = ref<string[]>([...puzzle.player_visible_to]);
const sharedHints = ref<number[]>([...puzzle.shared_hints]);

watch(
  () => puzzle,
  (next) => {
    visibleTo.value = [...next.player_visible_to];
    sharedHints.value = [...next.shared_hints];
  },
);

const hints = computed(() => [...puzzle.hints].sort((a, b) => a.order - b.order));

function save(update: PuzzleUpdate) {
  updatePuzzle({ id: puzzle.id, update });
}

const adapter = arrayRevealAdapter(
  visibleTo,
  () => (partyData.value ?? []).map((m) => m.id),
  (next) => {
    const shared = next.length > 0;
    // Hiding clears the hint ladder: the next group to meet this puzzle should
    // start from the top rather than inherit the last party's progress.
    if (!shared) sharedHints.value = [];
    save({
      player_visible_to: next,
      is_shared: shared,
      shared_hints: sharedHints.value,
      // Sharing a general puzzle scopes it here, and that is not a side effect
      // to design away: get_player_visible_puzzles finds a puzzle by its
      // campaign_id, so there is no such thing as "shared with everyone's
      // players". Un-sharing leaves the scope alone — the DM chose it, and the
      // Scope control is where they change it back.
      campaign_id: shared
        ? (puzzle.campaign_id ?? campaign.activeCampaignId ?? null)
        : puzzle.campaign_id,
    });
  },
);

function toggleHint(order: number) {
  sharedHints.value = sharedHints.value.includes(order)
    ? sharedHints.value.filter((o) => o !== order)
    : [...sharedHints.value, order].sort((a, b) => a - b);
  save({ shared_hints: sharedHints.value });
}
</script>

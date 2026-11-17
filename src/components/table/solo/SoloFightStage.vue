<template>
  <!-- Opens the fight, then puts it on. The board (and with it everything that sends the fight commands) is mounted
       only once the fight exists on the server: a command that arrives before the open is refused as a fight that
       is gone, and the page would let go of a fight that had not begun. -->
  <SoloFightBoard
    v-if="opened"
    ref="board"
    :encounter-id="encounterId"
    :member="member"
    :slots="slots"
    :helper-turn="helperTurn"
    @lines="(lines, byServer) => emit('lines', lines, byServer)"
    @over="(how) => emit('over', how)"
    @lost="emit('lost')"
    @turn="(state) => emit('turn', state)"
  />
  <Teleport v-else defer :to="`#${slots.map}`">
    <p v-if="openError" class="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-body text-destructive" role="alert">
      The fight could not be opened. {{ openError }}
      <AppButton variant="outline" size="sm" label="Try again" @click="retry()" />
    </p>
    <div v-else class="flex size-full items-center justify-center" role="status" aria-label="Opening the fight">
      <BannerLoader class="h-8" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useOpenRun } from "@/composables/encounters/useOpenRun";
import type { SoloFightEnd } from "@/composables/table/useSoloFightHost";
import type { BoardLine } from "@/lib/table/fight/boardLines";
import type { FightChange, FightTurn } from "@/lib/table/fight/fightChange";
import type { PartyMember } from "@/types/party.types";
import SoloFightBoard from "./SoloFightBoard.vue";

const { encounterId, member, slots, helperTurn } = defineProps<{
  /** Asks the story for the turn of someone with the party whom the rules cannot play; settles when it has been told. */
  helperTurn: (name: string) => Promise<void>;
  encounterId: string;
  /** The character the player plays: the only one who fights for the party, whoever the encounter lists. */
  member: PartyMember;
  /** The ids of the four places on the table screen the fight's parts go to. */
  slots: { map: string; turn: string; roster: string; roll: string };
}>();
const emit = defineEmits<{ lines: [lines: BoardLine[], byServer: boolean]; over: [how: SoloFightEnd]; lost: []; turn: [state: FightTurn] }>();

const board = ref<InstanceType<typeof SoloFightBoard> | null>(null);
defineExpose({
  /** Carries out the Dungeon Master's ruling on the board; nothing happens while the fight is not open. */
  apply: (change: FightChange) => board.value?.apply(change),
  spendWords: () => board.value?.spendWords(),
});

const { opened, openError, retry } = useOpenRun(computed(() => encounterId), { onlyMemberId: () => member.id });
</script>

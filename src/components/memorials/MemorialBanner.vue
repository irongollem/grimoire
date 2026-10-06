<template>
  <section class="mbanner border border-border bg-card" :data-kind="memorial.kind" :aria-label="`${memorial.character_name}, ${fallen ? 'fallen' : 'retired'}`">
    <MemorialCameo
      :kind="memorial.kind"
      :name="memorial.character_name"
      :portrait-url="memorial.portrait_url"
      :focal-point="memorial.portrait_focal_point"
      :scale="0.4"
      class="mbanner-cameo"
    />
    <div class="min-w-0 flex-1">
      <p class="mbanner-line text-heading-sm text-foreground" data-testid="banner-line">
        <b>{{ memorial.character_name }}</b> {{ fallen ? "fell" : "retired" }} on {{ when }}.
      </p>
      <p class="mbanner-sub text-body italic text-muted-foreground" data-testid="banner-sub">{{ sub }}</p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <AppButton :to="cardPath" variant="outline" size="sm" label="See the card" data-testid="see-card" />
      <AppButton
        v-if="undoLabel"
        variant="outline"
        size="sm"
        :icon="IconUndo"
        :label="undoLabel"
        :loading="restore.isPending.value"
        data-testid="undo"
        @click="undo"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import MemorialCameo from "@/components/memorials/MemorialCameo.vue";
import { useRestoreCharacter } from "@/composables/memorials/useMemorials";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconUndo } from "@/lib/icons";
import type { CharacterMemorial } from "@/types/memorial.types";

/**
 * Top of a character's sheet while the character has a memorial in effect (Hall of the
 * Fallen, #982, frames 06/08/09). Both the DM's page and the player's render the same sheet,
 * so this is mounted once, inside it. The sheet itself is untouched: the banner only says
 * where they are and offers the way back.
 *
 * Who may undo: the DM either way; the owner only for a retirement (the server refuses a
 * player restoring the fallen, so the button is not offered).
 */
const props = defineProps<{
  memorial: CharacterMemorial;
  viewer: "dm" | "owner" | "other";
}>();

const confirm = useConfirm();
const toast = useToast();
const restore = useRestoreCharacter();

const fallen = computed(() => props.memorial.kind === "fallen");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function realDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : value;
}

const when = computed(() => {
  const real = realDate(props.memorial.real_date);
  return props.memorial.game_date !== null ? `${props.memorial.game_date} (at the table, ${real})` : real;
});

const sub = computed(() =>
  fallen.value
    ? "The sheet is kept as it was. They are out of the party tracker and the encounter roster."
    : "They can return whenever you like; the DM is told when they do.",
);

const cardPath = computed(() => (props.viewer === "dm" ? "/party/fallen" : "/play/fallen"));

const undoLabel = computed(() => {
  if (props.viewer === "other") return null;
  if (fallen.value) return props.viewer === "dm" ? "Restore to life" : null;
  return "Return to the party";
});

async function undo() {
  const m = props.memorial;
  const message = fallen.value
    ? `Restore ${m.character_name} to life? They rejoin the party with the sheet as it was.`
    : `Return ${m.character_name} to the party?`;
  const ok = await confirm.confirm(message, {
    title: fallen.value ? "Restore to life" : "Return to the party",
    confirmLabel: undoLabel.value ? undoLabel.value : "Confirm",
    danger: false,
  });
  if (!ok) return;
  restore.mutate(m.party_member_id, {
    onError: (e) => toast.error(toast.fromError(e, `Could not bring ${m.character_name} back.`)),
  });
}
</script>

<style scoped>
.mbanner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding: 0.5rem 1rem 0.5rem 0.5rem;
  border-radius: 0.5rem;
  border-left: 0.375rem solid #6e1f1a;
}
.mbanner[data-kind="retired"] {
  border-left-color: #b48a32;
}
.mbanner-cameo {
  margin: -0.25rem 0;
}
.mbanner-line,
.mbanner-sub {
  margin: 0;
}
.mbanner-sub {
  margin-top: 0.125rem;
}
</style>

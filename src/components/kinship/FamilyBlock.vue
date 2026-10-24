<template>
  <section v-if="player ? groups.length > 0 : true" :class="framed && 'rounded-lg border border-border bg-card p-4'" data-testid="family-block">
    <div class="mb-1 flex w-full items-center justify-between gap-2">
      <h2 class="text-heading-sm font-bold text-foreground">{{ title }}</h2>
      <div class="flex items-center gap-2">
        <AppButton
          v-if="!player"
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconAddUser"
          icon-size="xs"
          label="Add relative"
          @click="addOpen = true"
        />
        <AppButton
          v-if="groups.length > 0"
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconNetwork"
          icon-size="xs"
          label="Open tree"
          :to="treeTo"
        />
      </div>
    </div>
    <div class="gold-divider mb-3" />

    <BannerLoader v-if="source.isLoading.value && groups.length === 0" />
    <p v-else-if="groups.length === 0" class="text-body italic text-muted-foreground">No family yet.</p>

    <div v-else class="space-y-3">
      <div v-for="group in groups" :key="group.id">
        <div class="flex items-baseline gap-2">
          <h3 class="text-eyebrow text-muted-foreground">{{ group.title }}</h3>
          <span v-if="group.caption" class="text-caption italic text-muted-foreground">{{ group.caption }}</span>
        </div>
        <ul class="mt-1 flex flex-col gap-2">
          <KinRow v-for="r in group.rows" :key="r.key" :row="r" :player="player" @remove="removeLink" />
        </ul>
      </div>
    </div>

    <AddRelativeDialog v-if="!player" :subject="person" :open="addOpen" @close="addOpen = false" @added="addOpen = false" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AddRelativeDialog from "@/components/kinship/AddRelativeDialog.vue";
import KinRow from "@/components/kinship/KinRow.vue";
import { buildFamilyGroups, type FamilyRow } from "@/components/kinship/familyRows";
import { useKinClock } from "@/composables/kinship/useKinClock";
import { useDeleteKinLink } from "@/composables/kinship/useKinLinks";
import { useDmKinGraph, usePlayerKinGraph, type KinGraphSource } from "@/composables/kinship/useKinGraph";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconAddUser, IconNetwork } from "@/lib/icons";
import type { PersonKey } from "@/types/kinship.types";

/**
 * One person's immediate family as a list (frames 02, 07 and 08): the same
 * groups on a desktop sheet and on a phone. The DM reads every stored link and
 * can edit them; a player reads only what get_player_visible_kin lets through,
 * and sees nothing at all when that is empty (even a count would be a reveal).
 */
const { person, player = false, title = "Family", framed = false } = defineProps<{
  person: PersonKey;
  player?: boolean;
  title?: string;
  /** Draws its own card, for a host that has none around it. */
  framed?: boolean;
}>();

// `player` is fixed for a mount, so the source is chosen once.
const source: KinGraphSource = player ? usePlayerKinGraph() : useDmKinGraph();
const clock = useKinClock();
const { confirm } = useConfirm();
const toast = useToast();
const deleteLink = useDeleteKinLink();

const addOpen = ref(false);

const notes = computed(() => new Map(source.links.value.map((l) => [l.id, l.note])));
const groups = computed(() =>
  buildFamilyGroups(source.graph.value, source.people.value, person, clock.value, notes.value),
);
const treeTo = computed(() =>
  player ? { name: "play-family-tree", params: { key: person } } : { name: "family-tree", params: { key: person } },
);

async function removeLink(row: FamilyRow) {
  if (!row.link) return;
  const ok = await confirm(`Remove the family link to ${row.person.name}? Neither of them is deleted.`, {
    title: "Remove link",
    confirmLabel: "Remove link",
  });
  if (!ok) return;
  try {
    await deleteLink.mutateAsync(row.link.id);
    toast.success("Link removed.");
  } catch {
    toast.error("Could not remove the link. Please try again.");
  }
}
</script>

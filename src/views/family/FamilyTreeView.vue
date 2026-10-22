<template>
  <div class="flex h-full min-h-0 flex-col gap-3 px-4 py-4 md:px-6 md:py-6">
    <div v-if="source.isLoading.value" class="flex flex-col gap-3" aria-busy="true" data-testid="family-skeleton">
      <SkeletonBlock class="h-12 w-64" />
      <div class="flex gap-3">
        <SkeletonBlock v-for="n in 4" :key="n" class="h-14 w-40" />
      </div>
    </div>

    <div v-else-if="!person" class="flex flex-col items-start gap-3">
      <p class="font-fell text-body italic text-muted-foreground">This person is not in your book.</p>
      <AppButton variant="link" :to="player ? '/play' : '/npcs'" :label="player ? 'Back to the table' : 'Back to the NPCs'" />
    </div>

    <template v-else>
      <header class="flex items-center gap-3">
        <span class="grid size-14 shrink-0 place-items-center overflow-hidden bg-muted text-title text-muted-foreground" aria-hidden="true">
          <img v-if="person.portraitUrl" :src="person.portraitUrl" alt="" class="size-full object-cover" />
          <template v-else>{{ person.name.trim().charAt(0).toUpperCase() }}</template>
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-label uppercase text-muted-foreground">Family of</p>
          <h1 class="truncate text-title font-bold text-foreground">{{ person.name }}</h1>
        </div>
        <AppButton v-if="person.to" variant="subtle" size="sm" :to="person.to" :icon="IconChevronLeft" :label="`Back to ${person.name}`" collapse-label-on-mobile />
      </header>

      <div class="flex flex-wrap items-center gap-2">
        <span class="inline-flex h-7 items-center rounded-full border border-destructive px-3 text-label text-destructive">
          Centred on {{ person.name }}
        </span>
        <span class="flex-1" />
        <FamilyTreeToolbar />
        <AppButton v-if="!player" size="sm" :icon="IconAddUser" label="Add relative" @click="adding = true" />
      </div>

      <div class="torn min-h-0 flex-1 p-2 md:p-4">
        <FamilyTree
          :source="source"
          :members="visible.members"
          :folds="visible.folds"
          :anchor="focus"
          :focus="focus"
          :married-in="marriedIn"
          @select="onSelect"
          @unfold="onUnfold"
        />
      </div>

      <AddRelativeDialog v-if="!player" :subject="focus" :open="adding" @close="adding = false" @added="adding = false" />
    </template>
  </div>
</template>

<script setup lang="ts">
/** A family tree centred on one person (frames 04 and 07b). DM and player share it; only the source differs. */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import SkeletonBlock from "@/components/common/feedback/SkeletonBlock.vue";
import AddRelativeDialog from "@/components/kinship/AddRelativeDialog.vue";
import FamilyTree from "@/components/kinship/FamilyTree.vue";
import FamilyTreeToolbar from "@/components/kinship/FamilyTreeToolbar.vue";
import { useDmKinGraph, usePlayerKinGraph } from "@/composables/kinship/useKinGraph";
import { IconAddUser, IconChevronLeft } from "@/lib/icons";
import { parentsOf, spousesOf } from "@/lib/kinship/graph";
import { selectAroundFocus } from "@/lib/kinship/select";
import { useFamilyUiStore } from "@/stores/ui/family";
import type { PersonKey } from "@/types/kinship.types";

const route = useRoute();
const router = useRouter();
const ui = useFamilyUiStore();

const player = route.meta.layout === "player";
const source = player ? usePlayerKinGraph() : useDmKinGraph();

const focus = computed(() => String(route.params.key) as PersonKey);
const person = computed(() => source.people.value.get(focus.value) ?? null);
const adding = ref(false);

// Branches the viewer opened; a different centre starts folded again.
const expanded = ref(new Set<PersonKey>());
watch(focus, () => {
  expanded.value = new Set();
});

const selection = computed(() => selectAroundFocus(source.graph.value, focus.value, { expanded: expanded.value }));

// A spouse with no parents of their own whose partner has some: they came into the family.
const marriedIn = computed(() => {
  const g = source.graph.value;
  const out = new Set<PersonKey>();
  for (const k of selection.value.members) {
    if (parentsOf(g, k).length > 0) continue;
    if (spousesOf(g, k).some((s) => parentsOf(g, s.key).length > 0)) out.add(k);
  }
  return out;
});

const visible = computed(() => {
  const members = new Set<PersonKey>();
  for (const k of selection.value.members) {
    const p = source.people.value.get(k);
    if (k !== focus.value && p) {
      if (!ui.familyShowDead && p.dead) continue;
      if (!ui.familyShowPcs && p.isPc) continue;
      if (!ui.familyShowMarriedIn && marriedIn.value.has(k)) continue;
    }
    members.add(k);
  }
  // A fold stays with its parent whatever the toggles hide.
  const folds = new Map([...selection.value.folds].filter(([parent]) => members.has(parent)));
  return { members, folds };
});

function onUnfold(parent: PersonKey): void {
  expanded.value = new Set([...expanded.value, parent]);
}

function onSelect(key: PersonKey): void {
  if (key === focus.value) {
    // The second tap on the centred person opens them.
    if (person.value?.to) void router.push(person.value.to);
    return;
  }
  void router.replace({ name: player ? "play-family-tree" : "family-tree", params: { key } });
}
</script>

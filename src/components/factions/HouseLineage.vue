<template>
  <div class="flex flex-col gap-3" data-testid="house-lineage">
    <header class="flex items-center gap-4">
      <span class="grid size-16 shrink-0 place-items-center overflow-hidden bg-muted text-muted-foreground" aria-hidden="true">
        <img v-if="faction.emblem_url" :src="faction.emblem_url" alt="" class="size-full object-cover" />
        <IconShield v-else class="size-7" />
      </span>
      <!-- The page header above already carries the house's name. -->
      <div class="min-w-0 flex-1">
        <p class="text-label uppercase text-muted-foreground">Factions · House</p>
        <p v-if="head" class="text-body italic text-muted-foreground">head: {{ head }}</p>
      </div>
    </header>

    <BannerLoader class="h-4" v-if="source.isLoading.value || npcRows.isLoading.value || pcRows.isLoading.value" />

    <p v-else-if="seeds.size === 0" class="font-fell text-body italic text-muted-foreground">
      No members yet. Add the family's people as members, then link them as kin.
    </p>

    <template v-else>
      <div v-if="!setting" class="flex flex-wrap items-center gap-2">
        <span
          v-if="focusName"
          class="inline-flex h-7 items-center gap-1 rounded-full border border-destructive pl-3 pr-1 text-label text-destructive"
        >
          Centred on {{ focusName }}
          <AppButton variant="ghost" size="icon-xs" :icon="IconClose" aria-label="Show the whole house" @click="clearFocus" />
        </span>
        <span class="flex-1" />
        <FamilyTreeToolbar />
        <AppButton size="sm" label="Line of succession" @click="startSetting" />
      </div>
      <div v-else class="flex flex-wrap items-center gap-2">
        <span class="inline-flex h-7 items-center rounded-full border border-primary px-3 text-label text-primary">
          Setting the line of succession
        </span>
        <span class="text-caption italic text-muted-foreground">
          Click people in the order they inherit. Click a numbered person again to take them out.
        </span>
        <span class="flex-1" />
        <AppButton variant="ghost" size="sm" label="Cancel" @click="setting = false" />
        <AppButton variant="primary" size="sm" label="Done" :loading="saving" @click="finish" />
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div class="torn min-h-[28rem] p-2 md:p-4">
          <FamilyTree
            :source="source"
            :members="visible.members"
            :folds="visible.folds"
            :anchor="focus ?? undefined"
            :focus="focus"
            :married-in="lineage.marriedIn"
            :succession="ranks"
            :dimmed="dimmed"
            @select="onSelect"
            @unfold="onUnfold"
          />
        </div>
        <HouseSuccessionPanel
          v-if="setting"
          :faction="faction"
          :line="draft"
          :people="source.people.value"
          @move="onMove"
        />
        <HouseLineageKey v-else class="hidden lg:flex" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/** A House's Lineage tab (frames 04 and 04b): its people drawn as a tree, and the line of succession set on it. */
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import HouseLineageKey from "@/components/factions/HouseLineageKey.vue";
import HouseSuccessionPanel from "@/components/factions/HouseSuccessionPanel.vue";
import FamilyTree from "@/components/kinship/FamilyTree.vue";
import FamilyTreeToolbar from "@/components/kinship/FamilyTreeToolbar.vue";
import { useFactionNpcs, useFactionPartyMembers } from "@/composables/factions/useFactions";
import { useSetHouseSuccession } from "@/composables/factions/useHouseSuccession";
import { useDmKinGraph } from "@/composables/kinship/useKinGraph";
import { useToast } from "@/composables/useToast";
import { IconClose, IconShield } from "@/lib/icons";
import { childrenOf } from "@/lib/kinship/graph";
import { houseLineage } from "@/lib/kinship/house";
import { lineFromRows, memberRows, moveInLine, rankMap, seedKeys, toggleInLine } from "@/lib/kinship/succession";
import { useFamilyUiStore } from "@/stores/ui/family";
import type { Faction } from "@/types/faction.types";
import type { PersonKey } from "@/types/kinship.types";

const { faction } = defineProps<{ faction: Faction }>();

const route = useRoute();
const router = useRouter();
const ui = useFamilyUiStore();
const toast = useToast();
const source = useDmKinGraph();
const npcRows = useFactionNpcs(() => faction.id);
const pcRows = useFactionPartyMembers(() => faction.id);
const setSuccession = useSetHouseSuccession();

const rows = computed(() => memberRows(npcRows.data.value ?? [], pcRows.data.value ?? []));
const seeds = computed(() => seedKeys(rows.value));
const lineage = computed(() => houseLineage(source.graph.value, seeds.value, faction.descent ?? "either"));

const head = computed(() => {
  const npc = npcRows.data.value?.find((r) => r.role === "Head of house");
  if (npc) return npc.npc.name;
  return pcRows.data.value?.find((r) => r.role === "Head of house")?.party_member.name ?? null;
});

// ?focus=<PersonKey> arrives from a person's sheet or tree.
const focus = computed<PersonKey | null>(() => {
  const f = route.query.focus;
  const key = typeof f === "string" ? (f as PersonKey) : null;
  return key && source.people.value.has(key) ? key : null;
});
const focusName = computed(() => (focus.value ? (source.people.value.get(focus.value)?.name ?? null) : null));
function clearFocus(): void {
  const { focus: _focus, ...rest } = route.query;
  void router.replace({ query: rest });
}

// Branches the viewer opened, with everything beneath them.
const expanded = ref(new Set<PersonKey>());
function onUnfold(parent: PersonKey): void {
  const g = source.graph.value;
  const opened = new Set(expanded.value);
  const queue = [...(lineage.value.folds.get(parent) ?? [])];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i];
    if (k === undefined || opened.has(k)) continue;
    opened.add(k);
    for (const c of childrenOf(g, k)) queue.push(c.key);
  }
  expanded.value = opened;
}

const visible = computed(() => {
  const members = new Set<PersonKey>();
  for (const k of [...lineage.value.members, ...expanded.value]) {
    const p = source.people.value.get(k);
    if (p && k !== focus.value) {
      if (!ui.familyShowDead && p.dead) continue;
      if (!ui.familyShowPcs && p.isPc) continue;
      if (!ui.familyShowMarriedIn && lineage.value.marriedIn.has(k)) continue;
    }
    members.add(k);
  }
  // A fold stays with its parent whatever the toggles hide, until it is opened.
  const folds = new Map(
    [...lineage.value.folds].filter(([parent, kids]) => members.has(parent) && kids.some((k) => !members.has(k))),
  );
  return { members, folds };
});

// Succession mode: a draft line edited on the tree and the side panel, written on Done.
const setting = ref(false);
const saving = ref(false);
const draft = ref<PersonKey[]>([]);
const storedLine = computed(() => lineFromRows(rows.value));
const ranks = computed(() => rankMap(setting.value ? draft.value : storedLine.value));
const dimmed = computed(() =>
  setting.value ? new Set([...visible.value.members].filter((k) => !draft.value.includes(k))) : undefined,
);

function startSetting(): void {
  draft.value = [...storedLine.value];
  setting.value = true;
}
function onMove(key: PersonKey, delta: -1 | 1): void {
  draft.value = moveInLine(draft.value, key, delta);
}
async function finish(): Promise<void> {
  saving.value = true;
  try {
    await setSuccession.mutateAsync({ factionId: faction.id, line: draft.value });
    toast.success("Line of succession saved");
    setting.value = false;
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  } finally {
    saving.value = false;
  }
}

function onSelect(key: PersonKey): void {
  if (setting.value) {
    draft.value = toggleInLine(draft.value, key);
    return;
  }
  // A house tree does not re-centre: the card opens the person.
  const to = source.people.value.get(key)?.to;
  if (to) void router.push(to);
}
</script>

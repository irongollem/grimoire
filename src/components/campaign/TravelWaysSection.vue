<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-3">
    <h2 class="text-heading-sm font-semibold text-foreground">Ways of travelling</h2>

    <ul class="divide-y divide-border">
      <li v-for="r in rows" :key="r.way.key" class="py-2" :data-testid="`way-${r.way.key}`">
        <form v-if="editingKey === r.way.key" class="space-y-2" @submit.prevent="save">
          <TravelWayFields v-model="form" :terrains="terrains" :companions="companionOptions" />
          <div class="flex gap-2">
            <AppButton type="submit" size="sm" :disabled="!valid" :loading="saving">Save</AppButton>
            <AppButton size="sm" variant="ghost" @click="editingKey = null">Cancel</AppButton>
          </div>
        </form>
        <div v-else class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-label-lg font-semibold text-foreground">{{ r.way.name }}</span>
              <span class="text-caption text-muted-foreground">{{ WAY_KIND_LABELS[r.way.kind] }}</span>
              <span v-if="r.changed" class="text-eyebrow uppercase text-ink-caution">Changed</span>
            </div>
            <p class="text-caption text-foreground" data-testid="way-speed">{{ r.speedText }}</p>
            <p v-if="r.atHomeText" class="text-caption text-foreground">{{ r.atHomeText }}</p>
            <p v-if="r.way.throughTheNight" class="text-caption text-foreground">Sails through the night</p>
            <p class="text-caption text-muted-foreground">{{ r.sourceText }}</p>
          </div>
          <AppButton size="sm" variant="ghost" @click="edit(r.way)">Edit</AppButton>
          <AppButton v-if="r.changed" size="sm" variant="ghost" @click="reset(r.way.key)">Back to the book</AppButton>
          <AppButton v-else-if="!r.preset" size="sm" variant="ghost" tone="danger" @click="remove(r.way)">Remove</AppButton>
        </div>
      </li>
    </ul>

    <form v-if="editingKey === NEW" class="space-y-2 border-t border-border pt-3" @submit.prevent="save">
      <TravelWayFields v-model="form" :terrains="terrains" :companions="companionOptions" />
      <div class="flex gap-2">
        <AppButton type="submit" size="sm" :disabled="!valid" :loading="saving">Add</AppButton>
        <AppButton size="sm" variant="ghost" @click="editingKey = null">Cancel</AppButton>
      </div>
    </form>
    <AppButton v-else size="sm" variant="outline" @click="startNew">Add a way of travelling</AppButton>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useResetTravel, useSaveWay, useTravel } from "@/composables/locations/useTravel";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { campaignWays, WAY_PRESETS, type WayOfTravel } from "@/rules/travelSpeed";
import { canTravelThroughTheNight, slugKey, WAY_KIND_LABELS, waySpeedText } from "./travelSettings";
import TravelWayFields, { type WayForm } from "./TravelWayFields.vue";

const NEW = "\u0000new";

const { terrains, rows: stored } = useTravel();
const { data: companions } = useCompanions();
const save$ = useSaveWay();
const reset$ = useResetTravel("travel_ways");
const toast = useToast();
const { confirm } = useConfirm();

const companionById = computed(() => new Map((companions.value ?? []).map((c) => [c.id, c])));
const companionOptions = computed(() => (companions.value ?? []).map((c) => ({ id: c.id, name: `${c.name} (${c.speed} ft)` })));

// Every way, including one whose companion is gone: the table lists what exists, `useTravel().ways` what can move.
const allWays = computed(() => campaignWays(stored.data.value?.ways ?? []));

const rows = computed(() => {
  const overridden = new Set((stored.data.value?.ways ?? []).map((r) => r.key));
  const terrainName = (key: string) => terrains.value.find((t) => t.key === key)?.name ?? key;
  return allWays.value.map((way) => {
    const preset = WAY_PRESETS.some((p) => p.key === way.key);
    const changed = preset && overridden.has(way.key);
    return {
      way,
      preset,
      changed,
      speedText: waySpeedText(way, way.companionId === null ? undefined : companionById.value.get(way.companionId)),
      atHomeText: way.atHome.length > 0 ? `At home on: ${way.atHome.map(terrainName).join(", ")}` : null,
      sourceText: !preset ? "Your own" : changed ? "Changed from the book" : (way.source ?? "A starting point of ours, yours to change"),
    };
  });
});

const editingKey = ref<string | null>(null);
const form = ref<WayForm>(blankForm());
const saving = computed(() => save$.isPending.value);

function blankForm(): WayForm {
  return { name: "", kind: "vehicle", speedMode: "feet", companionId: "", feet: 30, mph: 1, atHome: [], throughTheNight: false, sink: {} };
}

const valid = computed(() => {
  const f = form.value;
  if (f.name.trim().length === 0) return false;
  if (f.speedMode === "companion") return f.companionId !== "";
  const n = f.speedMode === "feet" ? f.feet : f.mph;
  return typeof n === "number" && n > 0;
});

function edit(w: WayOfTravel) {
  form.value = {
    name: w.name,
    kind: w.kind,
    speedMode: w.companionId !== null ? "companion" : w.mph !== null ? "mph" : "feet",
    companionId: w.companionId ?? "",
    feet: w.speedFeet ?? 30,
    mph: w.mph ?? 1,
    atHome: [...w.atHome],
    throughTheNight: w.throughTheNight,
    // A preset's own sinking (snowshoes on snow) is carried, not edited here.
    sink: { ...w.sink },
  };
  editingKey.value = w.key;
}

function startNew() {
  form.value = blankForm();
  editingKey.value = NEW;
}

async function save() {
  if (!valid.value || editingKey.value === null) return;
  const f = form.value;
  const key = editingKey.value === NEW ? slugKey(f.name, allWays.value.map((w) => w.key)) : editingKey.value;
  try {
    await save$.mutateAsync({
      key,
      name: f.name.trim(),
      kind: f.kind,
      speed_feet: f.speedMode === "feet" ? f.feet : null,
      mph: f.speedMode === "mph" ? f.mph : null,
      companion_id: f.speedMode === "companion" ? f.companionId : null,
      at_home: f.atHome,
      sink: f.sink,
      through_the_night: canTravelThroughTheNight(f.kind) && f.throughTheNight,
    });
    editingKey.value = null;
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

async function reset(key: string) {
  try {
    await reset$.mutateAsync(key);
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

async function remove(w: WayOfTravel) {
  if (!(await confirm(`${w.name} will no longer be a way your party can travel.`, { title: `Remove ${w.name}?`, confirmLabel: "Remove" }))) return;
  await reset(w.key);
}
</script>

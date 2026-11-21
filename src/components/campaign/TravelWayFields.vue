<script lang="ts">
import type { WayKind } from "@/rules/travelSpeed";

export interface WayForm {
  name: string;
  kind: WayKind;
  speedMode: "companion" | "feet" | "mph";
  companionId: string;
  feet: number;
  mph: number;
  atHome: string[];
  throughTheNight: boolean;
  /** Carried through from the way being edited; not a field of this form. */
  sink: Record<string, number>;
}
</script>

<template>
  <div class="grid gap-2 sm:grid-cols-2">
    <label class="block">
      <span class="text-caption font-semibold text-muted-foreground">Name</span>
      <AppInput v-model="form.name" block placeholder="Dogsled (axe beak)" data-testid="way-name" />
    </label>
    <label class="block">
      <span class="text-caption font-semibold text-muted-foreground">What it is</span>
      <AppSelect v-model="form.kind" block data-testid="way-kind">
        <option v-for="k in WAY_KINDS" :key="k" :value="k">{{ WAY_KIND_LABELS[k] }}</option>
      </AppSelect>
    </label>

    <div class="sm:col-span-2 space-y-2">
      <span class="text-caption font-semibold text-muted-foreground">Its speed</span>
      <SegmentedControl v-model="form.speedMode" :options="SPEED_MODES" />
      <EntityCombobox
        v-if="form.speedMode === 'companion'"
        v-model="form.companionId"
        :options="companions"
        placeholder="Search companions…"
      />
      <AppInput v-else-if="form.speedMode === 'feet'" v-model.number="form.feet" type="number" block data-testid="way-feet" />
      <AppInput v-else v-model.number="form.mph" type="number" block data-testid="way-mph" />
      <!-- What the bestiary says about the creature, applied when it is picked; the DM may change any of it. -->
      <p v-if="form.speedMode === 'companion' && traitsText" class="text-caption text-muted-foreground" data-testid="way-beast-traits">
        From the bestiary: {{ traitsText }}.
      </p>
      <p v-if="form.speedMode === 'companion' && companions.length === 0" class="text-caption text-muted-foreground">
        No companions in this campaign yet. Add the creature that pulls or carries it first.
      </p>
    </div>

    <fieldset class="sm:col-span-2 space-y-1">
      <legend class="text-caption font-semibold text-muted-foreground">At home on</legend>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <AppCheckbox v-for="t in terrains" :key="t.key" v-model="form.atHome" :value="t.key" :label="t.name" />
      </div>
    </fieldset>

    <AppCheckbox
      v-if="canTravelThroughTheNight(form.kind)"
      v-model="form.throughTheNight"
      class="sm:col-span-2"
      label="Travels through the night"
    />
  </div>
</template>

<script setup lang="ts">
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { computed, watch } from "vue";
import { useBeastTravel } from "@/composables/locations/useTravel";
import { beastTravelText, suggestWay, type Terrain } from "@/rules/travelSpeed";
import { canTravelThroughTheNight, WAY_KIND_LABELS, WAY_KINDS } from "./travelSettings";

const { terrains } = defineProps<{
  terrains: readonly Terrain[];
  /** `name` carries the creature's speed: "Snowbeak (50 ft)". */
  companions: { id: string; name: string }[];
}>();

const form = defineModel<WayForm>({ required: true });

const SPEED_MODES: { value: WayForm["speedMode"]; label: string }[] = [
  { value: "companion", label: "A creature's speed" },
  { value: "feet", label: "Feet" },
  { value: "mph", label: "Miles an hour" },
];

// ── The bestiary's word on the creature ──────────────────────────────────────
const { traits, flies } = useBeastTravel(() => (form.value.speedMode === "companion" && form.value.companionId !== "" ? form.value.companionId : null));
// Applied when the DM picks a creature other than the one the form opened with (as soon as its traits arrive),
// never over a way reopened with its creature unchanged: what the DM saved stands.
const openedWith = form.value.companionId;
watch(
  [() => form.value.companionId, traits],
  ([id, t]) => {
    if (!t || id === "" || id === openedWith) return;
    const suggestion = suggestWay(t, flies.value, form.value.kind);
    form.value = { ...form.value, kind: suggestion.kind, atHome: suggestion.atHome };
  },
);
const traitsText = computed(() => (traits.value ? beastTravelText(traits.value, flies.value, (k) => terrains.find((x) => x.key === k)?.name ?? k) : ""));
</script>


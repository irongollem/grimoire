<template>
  <section class="flex flex-col gap-2 border-t border-border pt-3" data-testid="set-out-provisions">
    <p class="text-label-lg font-semibold text-foreground">Food for the road</p>
    <p class="text-caption text-muted-foreground">Party stash: {{ stash }} {{ stash === 1 ? "ration" : "rations" }}.</p>
    <ul class="flex flex-col gap-1">
      <li v-for="line in lines" :key="line.id" class="text-body text-foreground" :data-testid="`set-out-food-${line.id}`">
        <span class="font-semibold">{{ line.name }}</span>
        <span class="text-muted-foreground"> carries {{ line.carried }}. </span>{{ line.outcome }}
      </li>
    </ul>

    <!-- Foraging is a check at a slow pace (DMG "Foraging"): the rolls are made here so the DM sees them first. -->
    <div v-if="canForage" class="flex flex-col gap-2 border-t border-border pt-2">
      <AppCheckbox v-model="forageOn" label="Forage on the way" />
      <template v-if="forageOn">
        <AppSelect v-model="terrain" size="sm" aria-label="How much the land gives">
          <option v-for="t in FORAGE_TERRAINS" :key="t.id" :value="t.id">{{ t.label }} (DC {{ t.dc }})</option>
        </AppSelect>
        <AppCheckbox
          v-for="line in lines"
          :key="line.id"
          :model-value="foragers.includes(line.id)"
          :label="line.name"
          @update:model-value="toggle(line.id, $event)"
        />
        <ul v-if="rolls.length" class="flex flex-col gap-0.5" data-testid="set-out-forage-rolls">
          <li v-for="(r, i) in rolls" :key="i" class="text-caption text-muted-foreground">{{ r }}</li>
        </ul>
        <AppButton variant="outline" size="sm" label="Roll again" class="self-start" @click="emit('reroll')" />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { FORAGE_TERRAINS, type ForageTerrainId } from "@/lib/travel/provisions";

/** The food half of the Set out dialog: what each traveller carries, what the journey eats, and the foraging checks. */
defineProps<{
  stash: number;
  lines: { id: string; name: string; carried: number; outcome: string }[];
  canForage: boolean;
  /** One sentence per forage roll, already worded. */
  rolls: string[];
}>();
const forageOn = defineModel<boolean>("forage", { required: true });
const terrain = defineModel<ForageTerrainId>("terrain", { required: true });
const foragers = defineModel<string[]>("foragers", { required: true });
const emit = defineEmits<{ reroll: [] }>();

function toggle(id: string, on: boolean): void {
  foragers.value = on ? [...foragers.value, id] : foragers.value.filter((f) => f !== id);
}
</script>

<template>
  <div class="min-w-0 space-y-2">
    <template v-if="verb === 'tick_clock'">
      <EntityCombobox v-if="targets.clockOptions.value.length" v-model="clockId" class="min-w-0" :options="targets.clockOptions.value" placeholder="Which clock…" />
      <p v-else class="text-caption italic text-muted-foreground">{{ NO_QUEST_CLOCKS_NOTE }}</p>
      <label v-if="targets.clockOptions.value.length" class="flex items-center gap-1 text-caption text-muted-foreground">
        <AppInput v-model.number="clockStep" type="number" size="body-xs" :block="false" class="w-16" aria-label="Segments to tick" />
        segments (negative winds it back)
      </label>
    </template>
    <template v-else-if="verb === 'move_npc'">
      <EntityCombobox v-if="targets.npcOptions.value.length" v-model="npcId" class="min-w-0" :options="targets.npcOptions.value" placeholder="Which NPC…" />
      <p v-else class="text-caption italic text-muted-foreground">No NPCs in this campaign yet.</p>
      <EntityCombobox v-if="targets.npcOptions.value.length" v-model="locationId" class="min-w-0" :options="targets.locationOptions.value" placeholder="Moves to…">
        <template #option="{ opt }">
          <span :style="{ paddingLeft: `${opt.depth * 0.75}rem` }">{{ opt.name }}</span>
        </template>
      </EntityCombobox>
    </template>
    <template v-else-if="verb === 'add_companion'">
      <EntityCombobox v-if="targets.npcOptions.value.length" v-model="npcId" class="min-w-0" :options="targets.npcOptions.value" placeholder="Which NPC…" />
      <p v-else class="text-caption italic text-muted-foreground">No NPCs in this campaign yet.</p>
      <p v-if="targets.npcOptions.value.length" class="text-caption text-muted-foreground">They join the party as an unassigned companion.</p>
    </template>
    <template v-else-if="verb === 'shift_faction_standing'">
      <EntityCombobox v-if="targets.factionOptions.value.length" v-model="factionId" class="min-w-0" :options="targets.factionOptions.value" placeholder="Which faction…" />
      <p v-else class="text-caption italic text-muted-foreground">No factions in this campaign yet.</p>
      <AppSelect v-if="targets.factionOptions.value.length" v-model="shiftKey" class="min-w-0" aria-label="What happens to the party's standing">
        <option v-for="option in RELATIONSHIP_SHIFT_OPTIONS" :key="option.key" :value="option.key">{{ option.label }}</option>
      </AppSelect>
    </template>
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import type { WorldVerbTargets } from "@/composables/quests/useWorldVerbTargets";
import { NO_QUEST_CLOCKS_NOTE, RELATIONSHIP_SHIFT_OPTIONS } from "@/lib/quests/consequences";
import type { QuestConsequenceAction } from "@/types/quest.types";

/**
 * The target pickers for the four #1011 verbs, shared by the quest rules panel
 * and the beat payoff panel so the two cannot drift. The parent owns the form
 * state (it builds the insert); this only draws the fields for `verb`.
 */
defineProps<{
  verb: QuestConsequenceAction;
  targets: WorldVerbTargets;
}>();

const clockId = defineModel<string>("clockId", { required: true });
const clockStep = defineModel<number>("clockStep", { required: true });
const npcId = defineModel<string>("npcId", { required: true });
const locationId = defineModel<string>("locationId", { required: true });
const factionId = defineModel<string>("factionId", { required: true });
const shiftKey = defineModel<string>("shiftKey", { required: true });
</script>

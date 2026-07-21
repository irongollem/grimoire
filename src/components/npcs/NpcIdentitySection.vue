<template>
  <section>
    <div class="text-heading-sm font-bold text-foreground mb-1">Identity</div>
    <div class="gold-divider mb-3" />
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="sm:col-span-2">
        <label class="field-label">Name *</label>
        <input
          :value="name"
          required
          placeholder="Full name…"
          class="field-input"
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="sm:col-span-2">
        <label class="field-label">Disguise Name <span class="font-normal text-muted-foreground/60">(alter ego)</span></label>
        <input
          :value="disguiseName ?? ''"
          placeholder="Melisande the Miller's Wife…"
          class="field-input"
          @input="emit('update:disguiseName', ($event.target as HTMLInputElement).value || null)"
        />
      </div>
      <div>
        <label class="field-label">Species</label>
        <input
          :value="race ?? ''"
          placeholder="Human, Elf, Tiefling…"
          class="field-input"
          @input="emit('update:race', ($event.target as HTMLInputElement).value || null)"
        />
      </div>
      <div>
        <label class="field-label">Alignment</label>
        <select
          :value="alignment ?? ''"
          class="field-input"
          @change="emit('update:alignment', ($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">— None —</option>
          <option v-for="a in ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
      <div>
        <label class="field-label">Age</label>
        <input
          :value="age ?? ''"
          placeholder="Young, 45, Ancient…"
          class="field-input"
          @input="emit('update:age', ($event.target as HTMLInputElement).value || null)"
        />
      </div>
      <div>
        <label class="field-label">Occupation</label>
        <input
          :value="occupation ?? ''"
          placeholder="Blacksmith, Spy, Innkeeper…"
          class="field-input"
          @input="emit('update:occupation', ($event.target as HTMLInputElement).value || null)"
        />
      </div>
      <div>
        <label class="field-label">Location</label>
        <EntityCombobox
          :model-value="locationId ?? ''"
          :options="locationOptions"
          placeholder="— none —"
          @update:model-value="emit('update:locationId', $event || null)"
        >
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>
      </div>
      <div v-if="npcId" class="sm:col-span-2">
        <label class="field-label">Factions</label>
        <NpcFactionsSection :npc-id="npcId" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import EntityCombobox from '@/components/common/EntityCombobox.vue'
import NpcFactionsSection from '@/components/factions/NpcFactionsSection.vue'
import type { Location } from '@/types/location.types'

type LocationOption = Location & { depth: number }

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned',
]

const {
  npcId = null,
  name,
  disguiseName = null,
  race = null,
  alignment = null,
  age = null,
  occupation = null,
  locationId = null,
  locationOptions,
} = defineProps<{
  npcId?: string | null
  name: string
  disguiseName?: string | null
  race?: string | null
  alignment?: string | null
  age?: string | null
  occupation?: string | null
  locationId?: string | null
  locationOptions: LocationOption[]
}>()

const emit = defineEmits<{
  'update:name': [value: string]
  'update:disguiseName': [value: string | null]
  'update:race': [value: string | null]
  'update:alignment': [value: string | null]
  'update:age': [value: string | null]
  'update:occupation': [value: string | null]
  'update:locationId': [value: string | null]
}>()
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>

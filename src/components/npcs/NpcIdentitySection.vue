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
          <option value="">None</option>
          <option v-for="a in ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
      <div>
        <label class="field-label">Age (description)</label>
        <input
          :value="age ?? ''"
          placeholder="Young, Ancient…"
          class="field-input"
          @input="emit('update:age', ($event.target as HTMLInputElement).value || null)"
        />
      </div>
      <div>
        <label class="field-label">Born</label>
        <CalendarDateInput
          label="Birth"
          :model-value="{ year: bornYear, month: bornMonth, day: bornDay }"
          tone="filled"
          @update:model-value="emit('update:birth', { born_year: $event.year, born_month: $event.month, born_day: $event.day })"
        />
        <p class="mt-1 text-label text-muted-foreground">A birth date replaces the age description on the sheet.</p>
      </div>
      <!-- Only a dead NPC shows a death date; toggling status away keeps what was typed. -->
      <div v-if="dead">
        <label class="field-label">Died</label>
        <CalendarDateInput
          label="Death"
          :model-value="{ year: diedYear, month: diedMonth, day: diedDay }"
          tone="filled"
          @update:model-value="emit('update:death', { died_year: $event.year, died_month: $event.month, died_day: $event.day })"
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
          placeholder="None"
          @update:model-value="emit('update:locationId', $event || null)"
        >
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 0.75}rem` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import CalendarDateInput from '@/components/common/controls/CalendarDateInput.vue'
import EntityCombobox from '@/components/common/controls/EntityCombobox.vue'
import type { LocationSummary } from '@/types/location.types'

type LocationOption = LocationSummary & { depth: number }

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned',
]

const {
  name,
  disguiseName = null,
  race = null,
  alignment = null,
  age = null,
  bornYear = null,
  bornMonth = null,
  bornDay = null,
  dead = false,
  diedYear = null,
  diedMonth = null,
  diedDay = null,
  occupation = null,
  locationId = null,
  locationOptions,
} = defineProps<{
  name: string
  disguiseName?: string | null
  race?: string | null
  alignment?: string | null
  age?: string | null
  bornYear?: number | null
  bornMonth?: number | null
  bornDay?: number | null
  /** Status is dead: the death date shows. */
  dead?: boolean
  diedYear?: number | null
  diedMonth?: number | null
  diedDay?: number | null
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
  'update:birth': [value: { born_year: number | null; born_month: number | null; born_day: number | null }]
  'update:death': [value: { died_year: number | null; died_month: number | null; died_day: number | null }]
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

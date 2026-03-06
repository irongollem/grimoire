<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-cinzel text-lg font-bold text-foreground">
            {{ editEvent ? 'Edit Event' : 'New Event' }}
          </h2>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Form -->
        <form class="px-5 py-4 space-y-4" @submit.prevent="submit">
          <!-- Title -->
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
              TITLE
            </label>
            <input
              v-model="form.title"
              required
              type="text"
              placeholder="Event name…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Event type + Color row -->
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
                TYPE
              </label>
              <select
                v-model="form.event_type"
                class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="campaign">Campaign</option>
                <option value="session">Session</option>
                <option value="world">World Event</option>
                <option value="festival">Festival</option>
                <option value="deadline">Deadline</option>
              </select>
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
                COLOR
              </label>
              <div class="flex gap-1.5 pt-1">
                <button
                  v-for="c in PRESET_COLORS"
                  :key="c"
                  type="button"
                  :style="{ backgroundColor: c }"
                  class="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  :class="form.color === c ? 'border-foreground scale-110' : 'border-transparent'"
                  @click="form.color = c"
                />
              </div>
            </div>
          </div>

          <!-- Date type toggle -->
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">
              DATE
            </label>
            <div class="flex rounded-md border border-border overflow-hidden mb-3">
              <button
                type="button"
                class="flex-1 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
                :class="dateType === 'regular'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'"
                @click="dateType = 'regular'"
              >
                Regular Day
              </button>
              <button
                type="button"
                class="flex-1 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
                :class="dateType === 'festival'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'"
                @click="dateType = 'festival'"
              >
                Festival Day
              </button>
            </div>

            <!-- Regular date fields -->
            <div v-if="dateType === 'regular'" class="grid grid-cols-3 gap-2">
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
                <input
                  v-model.number="form.harptos_year"
                  type="number"
                  min="1"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Month</label>
                <select
                  v-model.number="form.harptos_month"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option v-for="m in adapter.months" :key="m.num" :value="m.num">
                    {{ m.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Day</label>
                <input
                  v-model.number="form.harptos_day"
                  type="number"
                  min="1"
                  max="30"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <!-- Festival date fields -->
            <div v-else class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
                <input
                  v-model.number="form.harptos_year"
                  type="number"
                  min="1"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Festival</label>
                <select
                  v-model="form.festival_day"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option
                    v-for="f in availableFestivals"
                    :key="f.name"
                    :value="f.name"
                  >
                    {{ f.name }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Multi-day toggle -->
          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="form.is_multi_day"
                type="checkbox"
                class="w-4 h-4 rounded border-border accent-primary"
              />
              <span class="font-fell text-sm text-foreground">Multi-day event</span>
            </label>

            <div v-if="form.is_multi_day" class="mt-3 grid grid-cols-3 gap-2">
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">End year</label>
                <input
                  v-model.number="form.end_year"
                  type="number"
                  min="1"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">End month</label>
                <select
                  v-model.number="form.end_month"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option :value="null">—</option>
                  <option v-for="m in adapter.months" :key="m.num" :value="m.num">
                    {{ m.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">End day</label>
                <input
                  v-model.number="form.end_day"
                  type="number"
                  min="1"
                  max="30"
                  class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          <!-- Description -->
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
              DESCRIPTION <span class="text-muted-foreground font-fell normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              v-model="form.description"
              rows="3"
              placeholder="What happened…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="isPending"
              class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {{ isPending ? 'Saving…' : (editEvent ? 'Save Changes' : 'Create Event') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useCalendarStore } from '@/stores/calendar'
import { useCreateCalendarEvent, useUpdateCalendarEvent } from '@/composables/useCalendarEvents'
import type { CalendarEvent, CalendarEventInsert } from '@/types/calendar.types'

const PRESET_COLORS = [
  '#C9920A', // gold
  '#C0392B', // dragon red
  '#2E7D32', // elven green
  '#6A1B9A', // arcane purple
  '#1B3A4B', // teal
  '#E67E22', // orange
  '#2980B9', // blue
  '#7F8C8D', // stone gray
]

const props = defineProps<{
  modelValue: boolean
  editEvent?: CalendarEvent | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const calendar = useCalendarStore()
const { mutateAsync: createEvent, isPending: isCreating } = useCreateCalendarEvent()
const { mutateAsync: updateEvent, isPending: isUpdating } = useUpdateCalendarEvent()

const isPending = computed(() => isCreating.value || isUpdating.value)

type DateType = 'regular' | 'festival'
const dateType = ref<DateType>('regular')

function defaultForm(): CalendarEventInsert {
  return {
    title: '',
    description: null,
    event_type: 'campaign',
    color: PRESET_COLORS[0],
    harptos_year: calendar.currentYear,
    harptos_month: calendar.currentMonth,
    harptos_day: 1,
    festival_day: null,
    is_multi_day: false,
    end_year: null,
    end_month: null,
    end_day: null,
  }
}

const form = ref<CalendarEventInsert>(defaultForm())

const adapter = computed(() => calendar.adapter)

const availableFestivals = computed(() =>
  adapter.value.intercalaryDays.filter(d =>
    !d.isLeapOnly || adapter.value.isLeapYear(form.value.harptos_year)
  )
)

watch(() => props.modelValue, (open) => {
  if (open) {
    if (props.editEvent) {
      form.value = {
        title: props.editEvent.title,
        description: props.editEvent.description,
        event_type: props.editEvent.event_type,
        color: props.editEvent.color,
        harptos_year: props.editEvent.harptos_year,
        harptos_month: props.editEvent.harptos_month,
        harptos_day: props.editEvent.harptos_day,
        festival_day: props.editEvent.festival_day,
        is_multi_day: props.editEvent.is_multi_day,
        end_year: props.editEvent.end_year,
        end_month: props.editEvent.end_month,
        end_day: props.editEvent.end_day,
      }
      dateType.value = props.editEvent.festival_day ? 'festival' : 'regular'
    } else {
      form.value = defaultForm()
      dateType.value = 'regular'
    }
  }
})

watch(dateType, (type) => {
  if (type === 'festival') {
    form.value.harptos_month = null
    form.value.harptos_day = null
    form.value.festival_day = availableFestivals.value[0]?.name ?? null
  } else {
    form.value.festival_day = null
    form.value.harptos_month = calendar.currentMonth
    form.value.harptos_day = 1
  }
})

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  const payload: CalendarEventInsert = {
    ...form.value,
    harptos_month: dateType.value === 'regular' ? form.value.harptos_month : null,
    harptos_day: dateType.value === 'regular' ? form.value.harptos_day : null,
    festival_day: dateType.value === 'festival' ? form.value.festival_day : null,
    end_year: form.value.is_multi_day ? form.value.end_year : null,
    end_month: form.value.is_multi_day ? form.value.end_month : null,
    end_day: form.value.is_multi_day ? form.value.end_day : null,
  }

  if (props.editEvent) {
    await updateEvent({ id: props.editEvent.id, update: payload })
  } else {
    await createEvent(payload)
  }
  close()
}
</script>

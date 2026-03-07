<template>
  <!-- Modal backdrop -->
  <div class="fixed inset-0 z-50 flex items-start justify-end">
    <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
    <div class="relative z-10 h-full w-full max-w-xl bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="font-cinzel text-base font-bold text-foreground">
          {{ props.member ? `Edit ${props.member.name}` : 'Add Hero' }}
        </h2>
        <button type="button" class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none" @click="emit('close')">×</button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-border shrink-0">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="flex-1 px-3 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="activeTab === tab.id ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

        <!-- Identity tab -->
        <template v-if="activeTab === 'identity'">
          <div class="grid grid-cols-2 gap-3">
            <label class="col-span-2 block">
              <span class="field-label">Character Name *</span>
              <input v-model="f.name" class="field-input w-full" placeholder="Aric Stormblade" />
            </label>
            <label class="block">
              <span class="field-label">Player Name</span>
              <input v-model="f.player_name" class="field-input w-full" placeholder="Jeff" />
            </label>
            <label class="block">
              <span class="field-label">Race</span>
              <input v-model="f.race" class="field-input w-full" placeholder="Human" />
            </label>
            <label class="block">
              <span class="field-label">Class</span>
              <input v-model="f.class" class="field-input w-full" placeholder="Fighter" />
            </label>
            <label class="block">
              <span class="field-label">Subclass</span>
              <input v-model="f.subclass" class="field-input w-full" placeholder="Battle Master" />
            </label>
            <label class="block">
              <span class="field-label">Level</span>
              <input v-model.number="f.level" type="number" min="1" max="20" class="field-input w-full" />
            </label>
            <div>
              <label class="field-label">Proficiency Bonus</label>
              <div class="field-input bg-muted/30 text-muted-foreground flex items-center">
                +{{ profBonus }} <span class="ml-2 text-[11px]">(from level {{ f.level }})</span>
              </div>
            </div>
          </div>
          <label class="block">
            <span class="field-label">Notes</span>
            <textarea v-model="f.notes" rows="3" class="field-input w-full resize-none" placeholder="Background, personality, goals…" />
          </label>
        </template>

        <!-- Stats tab -->
        <template v-if="activeTab === 'stats'">
          <!-- Ability scores -->
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Ability Scores</p>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
              <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
              <input v-model.number="f[stat.key]" type="number" min="1" max="30" class="field-input w-full text-center px-1" />
              <span class="font-cinzel text-xs font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
                {{ mod(f[stat.key]) >= 0 ? '+' : '' }}{{ mod(f[stat.key]) }}
              </span>
            </label>
          </div>

          <!-- Combat stats -->
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">Combat</p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label class="block">
              <span class="field-label">Max HP</span>
              <input v-model.number="f.max_hp" type="number" min="1" class="field-input w-full" />
            </label>
            <label class="block">
              <span class="field-label">Current HP</span>
              <input v-model.number="f.current_hp" type="number" class="field-input w-full" />
            </label>
            <label class="block">
              <span class="field-label">Temp HP</span>
              <input v-model.number="f.temp_hp" type="number" min="0" class="field-input w-full" />
            </label>
            <label class="block">
              <span class="field-label">Armor Class</span>
              <input v-model.number="f.ac" type="number" min="1" class="field-input w-full" />
            </label>
            <label class="block">
              <span class="field-label">Speed (ft)</span>
              <input v-model.number="f.speed" type="number" min="0" step="5" class="field-input w-full" />
            </label>
            <label class="block">
              <span class="field-label">Initiative Bonus</span>
              <input v-model.number="f.initiative_bonus" type="number" class="field-input w-full" placeholder="= DEX mod" />
            </label>
          </div>

          <!-- Computed passives (read-only) -->
          <div class="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE PERC.</p>
              <p class="font-cinzel text-base font-bold text-foreground">{{ passivePerception }}</p>
            </div>
            <div>
              <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INS.</p>
              <p class="font-cinzel text-base font-bold text-foreground">{{ passiveInsight }}</p>
            </div>
            <div>
              <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INV.</p>
              <p class="font-cinzel text-base font-bold text-foreground">{{ passiveInvestigation }}</p>
            </div>
          </div>
        </template>

        <!-- Proficiencies tab -->
        <template v-if="activeTab === 'profs'">
          <!-- Saving throws -->
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Saving Throw Proficiencies</p>
          <div class="grid grid-cols-3 gap-2">
            <label v-for="save in SAVE_STATS" :key="save.key" class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                :checked="f.saving_throw_proficiencies.includes(save.key)"
                class="rounded"
                @change="toggleSave(save.key)"
              />
              <span class="font-cinzel text-xs text-foreground">{{ save.label }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground">
                {{ saveBonus(save.key) }}
              </span>
            </label>
          </div>

          <!-- Skills -->
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">Skills</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
              <div class="flex rounded overflow-hidden border border-border text-[10px] font-cinzel font-semibold shrink-0">
                <button
                  v-for="level in PROF_LEVELS"
                  :key="level.value"
                  type="button"
                  class="px-1.5 py-0.5 transition-colors"
                  :class="(f.skill_proficiencies[skill.key] ?? 'none') === level.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'"
                  @click="setSkillProf(skill.key, level.value)"
                >
                  {{ level.label }}
                </button>
              </div>
              <span class="font-fell text-xs text-foreground flex-1">{{ skill.label }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                {{ skillBonus(skill.key, skill.ability) }}
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between gap-2 px-5 py-4 border-t border-border shrink-0">
        <button
          v-if="props.member"
          type="button"
          class="font-cinzel text-xs text-destructive hover:opacity-80 transition-opacity"
          @click="remove"
        >
          Remove from party
        </button>
        <div class="flex gap-2 ml-auto">
          <button type="button" class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors" @click="emit('close')">
            Cancel
          </button>
          <button
            type="button"
            :disabled="!f.name.trim()"
            class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="save"
          >
            {{ props.member ? 'Save Changes' : 'Add to Party' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useCreatePartyMember, useUpdatePartyMember, useDeletePartyMember } from '@/composables/useParty'
import { SKILLS } from '@/types/party.types'
import type { PartyMember, PartyMemberInsert, SkillProfLevel, SaveKey } from '@/types/party.types'

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'stats', label: 'Stats' },
  { id: 'profs', label: 'Proficiencies' },
] as const

const ABILITY_STATS = [
  { key: 'str' as const, label: 'STR' },
  { key: 'dex' as const, label: 'DEX' },
  { key: 'con' as const, label: 'CON' },
  { key: 'int' as const, label: 'INT' },
  { key: 'wis' as const, label: 'WIS' },
  { key: 'cha' as const, label: 'CHA' },
]
const SAVE_STATS = [
  { key: 'str' as SaveKey, label: 'Strength' },
  { key: 'dex' as SaveKey, label: 'Dexterity' },
  { key: 'con' as SaveKey, label: 'Constitution' },
  { key: 'int' as SaveKey, label: 'Intelligence' },
  { key: 'wis' as SaveKey, label: 'Wisdom' },
  { key: 'cha' as SaveKey, label: 'Charisma' },
]
const PROF_LEVELS: { value: SkillProfLevel; label: string }[] = [
  { value: 'none', label: '–' },
  { value: 'proficient', label: 'P' },
  { value: 'expertise', label: 'E' },
]

const props = defineProps<{ member: PartyMember | null }>()
const emit = defineEmits<{ close: [] }>()

const activeTab = ref<'identity' | 'stats' | 'profs'>('identity')

const f = reactive<Omit<PartyMemberInsert, 'sort_order'> & { sort_order: number }>({
  name: props.member?.name ?? '',
  player_name: props.member?.player_name ?? '',
  class: props.member?.class ?? '',
  subclass: props.member?.subclass ?? '',
  level: props.member?.level ?? 1,
  race: props.member?.race ?? '',
  max_hp: props.member?.max_hp ?? 10,
  current_hp: props.member?.current_hp ?? 10,
  temp_hp: props.member?.temp_hp ?? 0,
  ac: props.member?.ac ?? 10,
  speed: props.member?.speed ?? 30,
  initiative_bonus: props.member?.initiative_bonus ?? 0,
  current_initiative: props.member?.current_initiative ?? null,
  str: props.member?.str ?? 10,
  dex: props.member?.dex ?? 10,
  con: props.member?.con ?? 10,
  int: props.member?.int ?? 10,
  wis: props.member?.wis ?? 10,
  cha: props.member?.cha ?? 10,
  proficiency_bonus: props.member?.proficiency_bonus ?? 2,
  skill_proficiencies: { ...(props.member?.skill_proficiencies ?? {}) },
  saving_throw_proficiencies: [...(props.member?.saving_throw_proficiencies ?? [])],
  conditions: [...(props.member?.conditions ?? [])],
  inspiration: props.member?.inspiration ?? false,
  death_save_successes: props.member?.death_save_successes ?? 0,
  death_save_failures: props.member?.death_save_failures ?? 0,
  notes: props.member?.notes ?? '',
  sort_order: props.member?.sort_order ?? 0,
})

function mod(score: number) { return Math.floor((score - 10) / 2) }

const profBonus = computed(() => {
  const l = f.level
  if (l >= 17) return 6
  if (l >= 13) return 5
  if (l >= 9) return 4
  if (l >= 5) return 3
  return 2
})

function skillProf(key: keyof typeof f.skill_proficiencies) {
  return f.skill_proficiencies[key] ?? 'none'
}
function setSkillProf(key: keyof typeof f.skill_proficiencies, val: SkillProfLevel) {
  f.skill_proficiencies[key] = val
}
function skillBonus(key: keyof typeof f.skill_proficiencies, ability: SaveKey): string {
  const base = mod(f[ability])
  const prof = skillProf(key)
  const bonus = prof === 'proficient' ? base + profBonus.value
    : prof === 'expertise' ? base + profBonus.value * 2
    : base
  return (bonus >= 0 ? '+' : '') + bonus
}
function toggleSave(key: SaveKey) {
  const idx = f.saving_throw_proficiencies.indexOf(key)
  if (idx >= 0) f.saving_throw_proficiencies.splice(idx, 1)
  else f.saving_throw_proficiencies.push(key)
}
function saveBonus(key: SaveKey): string {
  const base = mod(f[key])
  const bonus = f.saving_throw_proficiencies.includes(key) ? base + profBonus.value : base
  return (bonus >= 0 ? '+' : '') + bonus
}

// Passive skills
const passivePerception = computed(() => {
  const base = mod(f.wis)
  const prof = skillProf('perception')
  return 10 + base + (prof === 'proficient' ? profBonus.value : prof === 'expertise' ? profBonus.value * 2 : 0)
})
const passiveInsight = computed(() => {
  const base = mod(f.wis)
  const prof = skillProf('insight')
  return 10 + base + (prof === 'proficient' ? profBonus.value : prof === 'expertise' ? profBonus.value * 2 : 0)
})
const passiveInvestigation = computed(() => {
  const base = mod(f.int)
  const prof = skillProf('investigation')
  return 10 + base + (prof === 'proficient' ? profBonus.value : prof === 'expertise' ? profBonus.value * 2 : 0)
})

// CRUD
const { mutateAsync: create } = useCreatePartyMember()
const { mutateAsync: update } = useUpdatePartyMember()
const { mutateAsync: del } = useDeletePartyMember()

async function save() {
  const payload: PartyMemberInsert = {
    ...f,
    name: f.name.trim(),
    player_name: f.player_name || null,
    class: f.class || null,
    subclass: f.subclass || null,
    race: f.race || null,
    notes: f.notes || null,
    proficiency_bonus: profBonus.value,
  }
  if (props.member) {
    await update({ id: props.member.id, update: payload })
  } else {
    await create(payload)
  }
  emit('close')
}

async function remove() {
  if (!props.member) return
  if (!confirm(`Remove ${props.member.name} from the party?`)) return
  await del(props.member.id)
  emit('close')
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label { @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1; }
.field-input { @apply bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring; }
</style>

<template>
  <div>
    <!-- Action bar -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
        @click="rollAllInitiative"
      >
        <Dices class="h-3.5 w-3.5 text-primary" />
        Roll All Initiative
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        @click="clearInitiative"
      >
        <RotateCcw class="h-3.5 w-3.5" />
        Clear Initiative
      </button>
      <button
        type="button"
        class="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        @click="openForm(null)"
      >
        <Plus class="h-3.5 w-3.5" />
        Add Hero
      </button>
    </div>

    <!-- Loading / Empty -->
    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>

    <EmptyState
      v-else-if="!party?.length"
      title="No heroes in your party"
      description="Add your players' characters to track their HP, initiative, and passive skills."
    >
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          @click="openForm(null)"
        >
          Add first hero
        </button>
      </template>
    </EmptyState>

    <!-- Party cards -->
    <div v-else class="flex flex-col gap-3">
      <div
        v-for="member in sortedMembers"
        :key="member.id"
        class="rounded-lg border bg-card overflow-hidden transition-colors"
        :class="member.current_hp <= 0 ? 'border-destructive/50' : 'border-border'"
      >
        <div class="flex flex-col md:flex-row">

          <!-- Left: identity + initiative -->
          <div class="flex items-start justify-between gap-3 p-4 md:w-56 md:flex-col md:justify-start md:border-r md:border-border shrink-0">
            <div class="flex-1">
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ member.name }}</h3>
              <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
                {{ [member.race, member.class, member.level ? `Lv${member.level}` : ''].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="member.player_name" class="font-fell text-[11px] text-muted-foreground mt-0.5">
                {{ member.player_name }}
              </p>
            </div>

            <!-- Initiative -->
            <div class="flex flex-col items-center gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">INIT</span>
              <div class="flex items-center gap-1">
                <span
                  class="font-cinzel text-lg font-bold leading-none"
                  :class="member.current_initiative !== null ? 'text-primary' : 'text-muted-foreground'"
                >
                  {{ member.current_initiative !== null ? member.current_initiative : '–' }}
                </span>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-primary transition-colors"
                  title="Roll initiative"
                  @click="rollInitiative(member)"
                >
                  <Dices class="h-3.5 w-3.5" />
                </button>
              </div>
              <span class="font-cinzel text-[10px] text-muted-foreground">
                {{ member.initiative_bonus >= 0 ? '+' : '' }}{{ member.initiative_bonus }} bonus
              </span>
            </div>
          </div>

          <!-- Middle: HP + stats -->
          <div class="flex-1 p-4 flex flex-col gap-3">

            <!-- HP section -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
                  HP
                  <span
                    class="ml-2 text-sm font-bold"
                    :class="hpColor(member.current_hp, member.max_hp)"
                  >{{ member.current_hp }}</span>
                  <span class="text-muted-foreground font-normal"> / {{ member.max_hp }}</span>
                  <span v-if="member.temp_hp > 0" class="ml-1 text-blue-400 font-bold">+{{ member.temp_hp }} tmp</span>
                </span>
                <span v-if="member.inspiration" class="font-cinzel text-[10px] font-bold text-yellow-400 tracking-wider">✦ INSPIRED</span>
              </div>

              <!-- HP bar -->
              <div class="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="hpBarColor(member.current_hp, member.max_hp)"
                  :style="{ width: `${Math.max(0, Math.min(100, (member.current_hp / member.max_hp) * 100))}%` }"
                />
              </div>

              <!-- HP controls -->
              <div class="flex items-center gap-2">
                <input
                  :id="`hp-input-${member.id}`"
                  v-model.number="hpInputs[member.id]"
                  type="number"
                  min="0"
                  placeholder="Amt"
                  class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  class="px-2.5 py-1 rounded bg-destructive/10 border border-destructive/30 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                  @click="dealDamage(member)"
                >
                  Damage
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded bg-green-500/10 border border-green-500/30 font-cinzel text-xs font-semibold text-green-500 hover:bg-green-500/20 transition-colors"
                  @click="heal(member)"
                >
                  Heal
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 font-cinzel text-xs font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
                  @click="addTemp(member)"
                >
                  +Temp
                </button>
              </div>
            </div>

            <!-- Key stats row -->
            <div class="flex flex-wrap gap-x-4 gap-y-1 font-cinzel text-xs">
              <span><span class="text-muted-foreground">AC</span> <span class="font-bold text-foreground">{{ member.ac }}</span></span>
              <span><span class="text-muted-foreground">Speed</span> <span class="font-bold text-foreground">{{ member.speed }}ft</span></span>
              <span><span class="text-muted-foreground">PP</span> <span class="font-bold text-foreground">{{ passivePerception(member) }}</span></span>
              <span><span class="text-muted-foreground">PI</span> <span class="font-bold text-foreground">{{ passiveInsight(member) }}</span></span>
              <span><span class="text-muted-foreground">PInv</span> <span class="font-bold text-foreground">{{ passiveInvestigation(member) }}</span></span>
            </div>

            <!-- Saving throw proficiencies -->
            <div v-if="member.saving_throw_proficiencies.length" class="flex flex-wrap gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground mr-1 self-center">SAVES:</span>
              <span
                v-for="save in member.saving_throw_proficiencies"
                :key="save"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-foreground font-semibold uppercase tracking-wider"
              >
                {{ save }}
              </span>
            </div>

            <!-- Conditions -->
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-for="cond in member.conditions"
                :key="cond"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/30 font-cinzel text-[10px] font-semibold text-destructive"
              >
                {{ cond }}
                <button type="button" class="hover:text-destructive/60 transition-colors" @click="removeCondition(member, cond)">×</button>
              </span>

              <!-- Add condition -->
              <div class="relative">
                <button
                  type="button"
                  class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/40 font-cinzel text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                  @click="conditionOpen[member.id] = !conditionOpen[member.id]"
                >
                  <Plus class="h-2.5 w-2.5" /> Condition
                </button>
                <div
                  v-if="conditionOpen[member.id]"
                  class="absolute left-0 top-full mt-1 z-10 w-48 rounded-lg border border-border bg-card shadow-lg p-1"
                >
                  <button
                    v-for="cond in availableConditions(member)"
                    :key="cond"
                    type="button"
                    class="w-full text-left px-2 py-1 rounded font-cinzel text-[11px] text-foreground hover:bg-muted transition-colors"
                    @click="addCondition(member, cond)"
                  >
                    {{ cond }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Death saves (shown when HP ≤ 0) -->
            <div v-if="member.current_hp <= 0" class="flex items-center gap-3 p-2 rounded bg-destructive/10 border border-destructive/20">
              <span class="font-cinzel text-[10px] font-bold text-destructive tracking-wider">DEATH SAVES</span>
              <div class="flex items-center gap-1">
                <span class="font-cinzel text-[10px] text-green-500">✓</span>
                <div class="flex gap-1">
                  <button
                    v-for="i in 3" :key="`s${i}`"
                    type="button"
                    class="w-4 h-4 rounded-full border transition-colors"
                    :class="i <= member.death_save_successes ? 'bg-green-500 border-green-500' : 'border-muted-foreground/40'"
                    @click="toggleDeathSave(member, 'success')"
                  />
                </div>
              </div>
              <div class="flex items-center gap-1">
                <span class="font-cinzel text-[10px] text-destructive">✗</span>
                <div class="flex gap-1">
                  <button
                    v-for="i in 3" :key="`f${i}`"
                    type="button"
                    class="w-4 h-4 rounded-full border transition-colors"
                    :class="i <= member.death_save_failures ? 'bg-destructive border-destructive' : 'border-muted-foreground/40'"
                    @click="toggleDeathSave(member, 'failure')"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Right: actions -->
          <div class="flex md:flex-col items-center justify-end gap-2 px-4 py-3 md:border-l md:border-border shrink-0">
            <button
              type="button"
              :class="['w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                member.inspiration ? 'bg-yellow-400/20 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400']"
              title="Toggle inspiration"
              @click="toggleInspiration(member)"
            >
              <Sparkles class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              title="Edit character"
              @click="openForm(member)"
            >
              <Pencil class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Member form modal -->
    <PartyMemberForm
      v-if="formOpen"
      :member="editingMember"
      @close="formOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { Plus, Dices, RotateCcw, Pencil, Sparkles } from 'lucide-vue-next'
import { useParty, useUpdatePartyMember } from '@/composables/useParty'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PartyMemberForm from './PartyMemberForm.vue'
import { CONDITIONS } from '@/types/party.types'
import type { PartyMember, SkillProficiencies, SkillProfLevel } from '@/types/party.types'

const { data: party, isLoading } = useParty()
const { mutateAsync: updateMember } = useUpdatePartyMember()

// Initiative
const sortedMembers = computed(() => {
  const members = party.value ?? []
  const allHaveInit = members.length > 0 && members.every(m => m.current_initiative !== null)
  if (allHaveInit) {
    return [...members].sort((a, b) => (b.current_initiative ?? 0) - (a.current_initiative ?? 0))
  }
  return [...members].sort((a, b) => a.sort_order - b.sort_order)
})

function d20() { return Math.floor(Math.random() * 20) + 1 }

async function rollInitiative(member: PartyMember) {
  const roll = d20() + member.initiative_bonus
  await updateMember({ id: member.id, update: { current_initiative: roll } })
}
async function rollAllInitiative() {
  for (const member of party.value ?? []) {
    await rollInitiative(member)
  }
}
async function clearInitiative() {
  for (const member of party.value ?? []) {
    await updateMember({ id: member.id, update: { current_initiative: null } })
  }
}

// HP tracking
const hpInputs = reactive<Record<string, number>>({})

function getHpAmount(member: PartyMember): number {
  return Math.max(0, hpInputs[member.id] ?? 0)
}

async function dealDamage(member: PartyMember) {
  const amount = getHpAmount(member)
  if (!amount) return
  let hp = member.current_hp
  let temp = member.temp_hp
  // Temp HP absorbs damage first
  if (temp > 0) {
    const absorbed = Math.min(temp, amount)
    temp -= absorbed
    hp = Math.max(-member.max_hp, hp - (amount - absorbed))
  } else {
    hp = Math.max(-member.max_hp, hp - amount)
  }
  await updateMember({ id: member.id, update: { current_hp: hp, temp_hp: temp } })
  hpInputs[member.id] = 0
}

async function heal(member: PartyMember) {
  const amount = getHpAmount(member)
  if (!amount) return
  const hp = Math.min(member.max_hp, member.current_hp + amount)
  await updateMember({ id: member.id, update: { current_hp: hp, death_save_successes: 0, death_save_failures: 0 } })
  hpInputs[member.id] = 0
}

async function addTemp(member: PartyMember) {
  const amount = getHpAmount(member)
  if (!amount) return
  const temp = Math.max(member.temp_hp, amount) // temp HP doesn't stack, take the higher
  await updateMember({ id: member.id, update: { temp_hp: temp } })
  hpInputs[member.id] = 0
}

// Conditions
const conditionOpen = reactive<Record<string, boolean>>({})

function availableConditions(member: PartyMember) {
  return CONDITIONS.filter(c => !member.conditions.includes(c))
}
async function addCondition(member: PartyMember, condition: string) {
  conditionOpen[member.id] = false
  await updateMember({ id: member.id, update: { conditions: [...member.conditions, condition] } })
}
async function removeCondition(member: PartyMember, condition: string) {
  await updateMember({ id: member.id, update: { conditions: member.conditions.filter(c => c !== condition) } })
}

// Inspiration
async function toggleInspiration(member: PartyMember) {
  await updateMember({ id: member.id, update: { inspiration: !member.inspiration } })
}

// Death saves
async function toggleDeathSave(member: PartyMember, type: 'success' | 'failure') {
  if (type === 'success') {
    const n = member.death_save_successes >= 3 ? 0 : member.death_save_successes + 1
    await updateMember({ id: member.id, update: { death_save_successes: n } })
  } else {
    const n = member.death_save_failures >= 3 ? 0 : member.death_save_failures + 1
    await updateMember({ id: member.id, update: { death_save_failures: n } })
  }
}

// Passive skills
function mod(score: number) { return Math.floor((score - 10) / 2) }
function profAdd(profs: SkillProficiencies, key: keyof SkillProficiencies, profBonus: number) {
  const level: SkillProfLevel = profs[key] ?? 'none'
  return level === 'proficient' ? profBonus : level === 'expertise' ? profBonus * 2 : 0
}

function passivePerception(m: PartyMember) {
  return 10 + mod(m.wis) + profAdd(m.skill_proficiencies, 'perception', m.proficiency_bonus)
}
function passiveInsight(m: PartyMember) {
  return 10 + mod(m.wis) + profAdd(m.skill_proficiencies, 'insight', m.proficiency_bonus)
}
function passiveInvestigation(m: PartyMember) {
  return 10 + mod(m.int) + profAdd(m.skill_proficiencies, 'investigation', m.proficiency_bonus)
}

// HP colour helpers
function hpColor(current: number, max: number) {
  const pct = current / max
  if (current <= 0) return 'text-destructive'
  if (pct <= 0.25) return 'text-orange-400'
  if (pct <= 0.5) return 'text-yellow-400'
  return 'text-green-400'
}
function hpBarColor(current: number, max: number) {
  const pct = current / max
  if (current <= 0) return 'bg-destructive'
  if (pct <= 0.25) return 'bg-orange-400'
  if (pct <= 0.5) return 'bg-yellow-400'
  return 'bg-green-500'
}

// Form
const formOpen = ref(false)
const editingMember = ref<PartyMember | null>(null)

function openForm(member: PartyMember | null) {
  editingMember.value = member
  formOpen.value = true
}
</script>

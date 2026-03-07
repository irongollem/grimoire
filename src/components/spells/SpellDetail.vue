<template>
  <div class="flex flex-col gap-6">
    <!-- ── Header actions ─────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <RouterLink to="/spells" class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider">
        ← Spellbook
      </RouterLink>
      <div class="flex items-center gap-2">
        <button
          v-if="spell"
          type="button"
          :disabled="isSendingToScriptorium"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
          @click="sendToScriptorium"
        >
          <ScrollText class="h-3.5 w-3.5" />
          {{ isSendingToScriptorium ? 'Sending…' : 'Send to Scriptorium' }}
        </button>
        <button
          v-if="spell"
          type="button"
          :disabled="isDeleting"
          class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
          @click="confirmDelete"
        >
          <Trash2 class="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          type="button"
          :disabled="isSaving || !name.trim()"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="save"
        >
          <Save class="h-3.5 w-3.5" />
          {{ isSaving ? 'Saving…' : (spell ? 'Save' : 'Create') }}
        </button>
      </div>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- ── Left: Core spell fields ────────────────────────────────────── -->
      <div class="xl:col-span-2 flex flex-col gap-4">

        <!-- Name -->
        <label>
          <span class="sr-only">Spell name</span>
          <input
            v-model="name"
            placeholder="Spell name…"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <!-- Level + School row -->
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Level</span>
            <select
              v-model.number="level"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option :value="0">Cantrip (0)</option>
              <option v-for="n in 9" :key="n" :value="n">{{ n }}{{ levelSuffix(n) }}-Level</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">School</span>
            <select
              v-model="school"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
            >
              <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
            </select>
          </label>
        </div>

        <!-- Casting Time + Range -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Casting Time</span>
            <select
              v-model="castingTime"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="o in CASTING_TIME_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input
              v-if="castingTime === 'Special'"
              v-model="castingTimeCustom"
              placeholder="Describe casting time…"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              v-if="castingTime === 'Reaction'"
              v-model="castingTimeCustom"
              placeholder="Reaction to what? (optional)"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Range</span>
            <select
              v-model="range"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="o in RANGE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input
              v-if="range === 'Special'"
              v-model="rangeCustom"
              placeholder="Describe range…"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- Duration + flags -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Duration</span>
            <select
              v-model="duration"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @change="onDurationChange"
            >
              <option v-for="o in DURATION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input
              v-if="duration === 'Special'"
              v-model="durationCustom"
              placeholder="Describe duration…"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div class="flex flex-col gap-3 justify-end pb-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="concentration" class="rounded" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">CONCENTRATION</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="ritual" class="rounded" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">RITUAL</span>
            </label>
          </div>
        </div>

        <!-- Components -->
        <div class="flex flex-col gap-2">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Components</span>
          <div class="flex items-center gap-4">
            <label v-for="c in SPELL_COMPONENTS" :key="c" class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" :value="c" v-model="components" class="rounded" />
              <span class="font-cinzel text-sm font-semibold text-foreground">{{ c }}</span>
            </label>
          </div>
          <input
            v-if="components.includes('M')"
            v-model="material"
            placeholder="Material component (e.g. a pinch of sulfur and powdered iron)…"
            class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Description</span>
          <textarea
            v-model="description"
            rows="8"
            placeholder="Describe the spell's effects…"
            class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>

        <!-- At Higher Levels -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">At Higher Levels <span class="normal-case font-fell font-normal text-muted-foreground">(optional)</span></span>
          <textarea
            v-model="higherLevels"
            rows="2"
            placeholder="When cast using a higher-level spell slot…"
            class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>

        <!-- Source + image URL -->
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Source</span>
            <input
              v-model="source"
              placeholder="e.g. Homebrew, PHB, XGtE…"
              class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Art URL <span class="normal-case font-fell font-normal">(card printing)</span></span>
            <input
              v-model="imageUrl"
              placeholder="https://… (optional, used on printed cards)"
              class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>

        <!-- Tags -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Tags</span>
          <div class="flex items-center gap-1.5 flex-wrap min-h-8 bg-card border border-border rounded-md px-2 py-1">
            <span
              v-for="tag in tags"
              :key="tag"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
              <button type="button" class="hover:text-destructive transition-colors leading-none text-sm" @click="removeTag(tag)">×</button>
            </span>
            <input
              v-model="tagInput"
              placeholder="Add tag…"
              class="bg-transparent border-none outline-none font-fell text-xs text-muted-foreground placeholder:text-muted-foreground/60 min-w-20 flex-1"
              @keydown.enter.prevent="addTag"
              @keydown="onTagKey"
            />
          </div>
        </div>
      </div>

      <!-- ── Right: Classes + Advisor ────────────────────────────────────── -->
      <div class="flex flex-col gap-4">

        <!-- Class list -->
        <div class="rounded-lg border border-border bg-card p-4">
          <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase mb-3">Spell Lists</h3>
          <p class="font-fell text-xs text-muted-foreground italic mb-3">Which classes have access to this spell?</p>
          <div class="flex flex-col gap-2">
            <label v-for="cls in SPELL_CLASSES" :key="cls" class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" :value="cls" v-model="classes" class="rounded" />
              <span class="font-fell text-sm text-foreground">{{ cls }}</span>
            </label>
          </div>
        </div>

        <!-- Spell Level Advisor -->
        <div class="rounded-lg border border-border bg-card p-4">
          <button
            type="button"
            class="flex items-center justify-between w-full"
            @click="advisorOpen = !advisorOpen"
          >
            <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
              <Lightbulb class="h-3.5 w-3.5 text-primary" />
              Spell Level Advisor
            </h3>
            <ChevronDown class="h-3.5 w-3.5 text-muted-foreground transition-transform" :class="advisorOpen ? 'rotate-180' : ''" />
          </button>
          <p class="font-fell text-xs text-muted-foreground italic mt-1 mb-3">
            Estimate a balanced level based on 2024 DMG guidelines.
          </p>

          <div v-if="advisorOpen" class="flex flex-col gap-3">
            <!-- Effect type -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Main Effect</span>
              <select v-model="adv.effectType" class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="damage">Damage</option>
                <option value="healing">Healing / Restoration</option>
                <option value="control">Control (restrain, slow, etc.)</option>
                <option value="buff">Buff / Enhancement</option>
                <option value="utility">Utility / Exploration</option>
              </select>
            </label>

            <!-- Damage / healing dice -->
            <label v-if="adv.effectType === 'damage' || adv.effectType === 'healing'" class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">
                {{ adv.effectType === 'damage' ? 'Damage Dice' : 'Healing Dice' }}
              </span>
              <input
                v-model="adv.damageDice"
                placeholder="e.g. 3d6, 8d8+20"
                class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span v-if="adv.damageDice" class="font-fell text-[11px] text-muted-foreground">
                Avg: {{ Math.round(parseDiceAvg(adv.damageDice)) }}
              </span>
            </label>

            <!-- AoE -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Area of Effect</span>
              <select v-model="adv.aoeType" class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="single">Single target</option>
                <option value="small">Small (≤15 ft cone / ≤30 ft line)</option>
                <option value="medium">Medium (20 ft radius / 60 ft line)</option>
                <option value="large">Large (30+ ft radius, many targets)</option>
              </select>
            </label>

            <!-- Save type -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Targeting / Save</span>
              <select v-model="adv.saveType" class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="save_for_half">Saving throw — half on save</option>
                <option value="save_negates">Saving throw — negates on save</option>
                <option value="attack_roll">Attack roll (can miss)</option>
                <option value="automatic">Automatic — no save or attack</option>
              </select>
            </label>

            <!-- Duration -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Duration Tier</span>
              <select v-model="adv.durationTier" class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="instantaneous">Instantaneous</option>
                <option value="conc_1min">Concentration, ≤1 minute</option>
                <option value="conc_10min">Concentration, ≤10 minutes</option>
                <option value="conc_1hour">Concentration, ≤1 hour</option>
                <option value="sustained_1min">1 minute (no concentration)</option>
                <option value="sustained_long">8+ hours (no concentration)</option>
              </select>
            </label>

            <!-- Checkboxes -->
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.requiresConcentration" class="rounded" />
                <span class="font-fell text-sm text-foreground">Requires Concentration</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.hasSecondaryEffect" class="rounded" />
                <span class="font-fell text-sm text-foreground">Secondary condition / rider effect</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.isRitual" class="rounded" />
                <span class="font-fell text-sm text-foreground">Can be cast as Ritual</span>
              </label>
            </div>

            <!-- Result -->
            <div v-if="advResult" class="rounded-md bg-primary/10 border border-primary/30 p-3">
              <p class="font-cinzel text-sm font-bold text-primary mb-2">
                Suggested: Level {{ advResult.suggestedMin }}–{{ advResult.suggestedMax }}
              </p>
              <ul class="space-y-0.5">
                <li
                  v-for="(f, i) in advResult.factors"
                  :key="i"
                  class="font-fell text-xs text-muted-foreground flex gap-1.5"
                >
                  <span class="text-primary shrink-0">·</span>{{ f }}
                </li>
              </ul>
              <button
                type="button"
                class="mt-3 font-cinzel text-[10px] text-primary tracking-wider hover:underline"
                @click="applyAdvisorLevel"
              >
                Apply level {{ advResult.suggestedMin + Math.floor((advResult.suggestedMax - advResult.suggestedMin) / 2) }} →
              </button>
            </div>

            <!-- Reference table toggle -->
            <button
              type="button"
              class="font-cinzel text-[10px] text-muted-foreground tracking-wider hover:text-foreground transition-colors text-left"
              @click="showTable = !showTable"
            >
              {{ showTable ? '▲ Hide' : '▼ Show' }} damage benchmark table
            </button>
            <div v-if="showTable" class="overflow-x-auto">
              <table class="w-full text-[10px] font-fell">
                <thead>
                  <tr class="border-b border-border text-muted-foreground">
                    <th class="text-left py-1 pr-2">Lvl</th>
                    <th class="text-left py-1 pr-2">Single</th>
                    <th class="text-left py-1 pr-2">Small AoE</th>
                    <th class="text-left py-1">Large AoE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in DAMAGE_BENCHMARKS" :key="row.level" class="border-b border-border/30">
                    <td class="py-0.5 pr-2 font-cinzel font-bold text-foreground">{{ row.label }}</td>
                    <td class="py-0.5 pr-2 text-muted-foreground">{{ row.singleTarget }}</td>
                    <td class="py-0.5 pr-2 text-muted-foreground">{{ row.aoeSmall }}</td>
                    <td class="py-0.5 text-muted-foreground">{{ row.aoeLarge }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Save, Trash2, ScrollText, Lightbulb, ChevronDown } from 'lucide-vue-next'
import {
  SPELL_SCHOOLS, SPELL_CLASSES, SPELL_COMPONENTS,
  CASTING_TIME_OPTIONS, DURATION_OPTIONS, RANGE_OPTIONS,
} from '@/types/spell.types'
import type { Spell, SpellSchool } from '@/types/spell.types'
import { useCreateSpell, useUpdateSpell, useDeleteSpell } from '@/composables/useSpells'
import { useCreateScriptoriumDocument } from '@/composables/useScriptorium'
import { formatSpellForScriptorium } from '@/lib/scriptoriumImport'
import {
  adviseLevelRange, parseDiceAvg, DAMAGE_BENCHMARKS,
  type EffectType, type AoeType, type SaveType, type DurationTier,
} from '@/lib/spellAdvisor'

const props = defineProps<{ spell: Spell | null }>()
const router = useRouter()

// ── Core fields ───────────────────────────────────────────────────────────────
const name             = ref(props.spell?.name ?? '')
const level            = ref(props.spell?.level ?? 1)
const school           = ref<SpellSchool>(props.spell?.school ?? 'evocation')
const castingTime      = ref(props.spell?.casting_time ?? 'Action')
const castingTimeCustom = ref(props.spell?.casting_time_custom ?? '')
const range            = ref(props.spell?.range ?? '60 ft.')
const rangeCustom      = ref(props.spell?.range_custom ?? '')
const duration         = ref(props.spell?.duration ?? 'Instantaneous')
const durationCustom   = ref(props.spell?.duration_custom ?? '')
const concentration    = ref(props.spell?.concentration ?? false)
const ritual           = ref(props.spell?.ritual ?? false)
const components       = ref<string[]>(props.spell?.components ?? [])
const material         = ref(props.spell?.material ?? '')
const description      = ref(props.spell?.description ?? '')
const higherLevels     = ref(props.spell?.higher_levels ?? '')
const classes          = ref<string[]>(props.spell?.classes ?? [])
const source           = ref(props.spell?.source ?? '')
const imageUrl         = ref(props.spell?.image_url ?? '')
const tags             = ref<string[]>(props.spell?.tags ?? [])
const tagInput         = ref('')

function levelSuffix(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}

// Auto-set concentration when a concentration duration is selected
function onDurationChange() {
  if (duration.value.startsWith('Concentration')) concentration.value = true
}

// Tags
function addTag() {
  const val = tagInput.value.replace(/,\s*$/, '').trim()
  if (val && !tags.value.includes(val)) tags.value.push(val)
  tagInput.value = ''
}
function onTagKey(e: KeyboardEvent) {
  if (e.key === ',') { e.preventDefault(); addTag() }
}
function removeTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

// ── Advisor state ─────────────────────────────────────────────────────────────
const advisorOpen = ref(false)
const showTable   = ref(false)

const adv = reactive({
  effectType:          'damage' as EffectType,
  damageDice:          '',
  aoeType:             'single' as AoeType,
  saveType:            'save_for_half' as SaveType,
  durationTier:        'instantaneous' as DurationTier,
  requiresConcentration: false,
  hasSecondaryEffect:  false,
  isRitual:            false,
})

const advResult = computed(() => {
  if (!advisorOpen.value) return null
  return adviseLevelRange(adv)
})

function applyAdvisorLevel() {
  if (!advResult.value) return
  const mid = advResult.value.suggestedMin + Math.floor((advResult.value.suggestedMax - advResult.value.suggestedMin) / 2)
  level.value = Math.max(0, Math.min(9, mid))
}

// Sync concentration checkbox → advisor
watch(concentration, val => { adv.requiresConcentration = val })
watch(ritual, val => { adv.isRitual = val })

// ── Save / Delete ─────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateSpell()
const { mutateAsync: update } = useUpdateSpell()
const { mutateAsync: deleteSpell } = useDeleteSpell()
const isSaving   = ref(false)
const isDeleting = ref(false)
const saveError  = ref('')

function buildPayload() {
  return {
    name: name.value.trim(),
    level: level.value,
    school: school.value,
    casting_time: castingTime.value,
    casting_time_custom: castingTime.value === 'Special' || castingTime.value === 'Reaction' ? (castingTimeCustom.value || null) : null,
    range: range.value,
    range_custom: range.value === 'Special' ? (rangeCustom.value || null) : null,
    duration: duration.value,
    duration_custom: duration.value === 'Special' ? (durationCustom.value || null) : null,
    concentration: concentration.value,
    ritual: ritual.value,
    components: components.value,
    material: components.value.includes('M') ? (material.value || null) : null,
    description: description.value,
    higher_levels: higherLevels.value || null,
    classes: classes.value,
    tags: tags.value,
    source: source.value || null,
    image_url: imageUrl.value || null,
  }
}

async function save() {
  if (!name.value.trim()) return
  isSaving.value = true
  saveError.value = ''
  try {
    if (props.spell) {
      await update({ id: props.spell.id, update: buildPayload() })
      router.push('/spells')
    } else {
      const created = await create(buildPayload())
      router.replace(`/spells/${created.id}`)
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    isSaving.value = false
  }
}

async function confirmDelete() {
  if (!props.spell || !confirm(`Delete "${props.spell.name}"? This cannot be undone.`)) return
  isDeleting.value = true
  try {
    await deleteSpell(props.spell.id)
    router.push('/spells')
  } finally {
    isDeleting.value = false
  }
}

// ── Send to Scriptorium ───────────────────────────────────────────────────────
const { mutateAsync: createDoc } = useCreateScriptoriumDocument()
const isSendingToScriptorium = ref(false)

async function sendToScriptorium() {
  if (!props.spell) return
  isSendingToScriptorium.value = true
  try {
    const data = formatSpellForScriptorium(props.spell)
    const doc = await createDoc(data)
    router.push(`/scriptorium/${doc.id}`)
  } finally {
    isSendingToScriptorium.value = false
  }
}
</script>

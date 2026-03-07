<template>
  <form @submit.prevent="save">
    <!-- ── Top action bar ───────────────────────────────────────────── -->
    <div class="flex items-center justify-between mb-6 gap-4">
      <RouterLink to="/npcs" class="font-fell text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← All NPCs
      </RouterLink>
      <div class="flex items-center gap-2">
        <button
          v-if="npc?.id"
          type="button"
          class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors"
          @click="confirmDelete"
        >
          Delete
        </button>
        <button
          type="submit"
          :disabled="isSaving"
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {{ isSaving ? 'Saving…' : (npc?.id ? 'Save Changes' : 'Create NPC') }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      <!-- ── Left: portrait + meta ────────────────────────────────── -->
      <div class="space-y-4">
        <!-- Portrait -->
        <div
          class="relative aspect-[3/4] rounded-lg border border-border overflow-hidden bg-muted cursor-pointer group"
          @click="triggerPortraitUpload"
        >
          <img v-if="form.portrait_url" :src="form.portrait_url" alt="Portrait" class="w-full h-full object-cover" />
          <div v-else class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImagePlus class="h-10 w-10" />
            <span class="font-fell text-sm italic">Upload portrait</span>
          </div>
          <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="font-fell text-white text-sm italic">
              {{ form.portrait_url ? 'Change portrait' : 'Upload portrait' }}
            </span>
          </div>
          <div v-if="isUploading" class="absolute inset-0 bg-black/60 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />

        <!-- Status -->
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">STATUS</p>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="s in STATUS_OPTIONS" :key="s.value" type="button"
              class="py-1.5 rounded border font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :style="form.status === s.value ? { borderColor: s.color, backgroundColor: s.color + '22', color: s.color } : {}"
              :class="form.status !== s.value ? 'border-border text-muted-foreground hover:border-primary/40' : ''"
              @click="form.status = s.value"
            >{{ s.label }}</button>
          </div>
        </div>

        <!-- Relationship -->
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">RELATIONSHIP</p>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="r in REL_OPTIONS" :key="r.value" type="button"
              class="py-1.5 rounded border font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :style="form.relationship === r.value ? { borderColor: r.color, backgroundColor: r.color + '22', color: r.color } : {}"
              :class="form.relationship !== r.value ? 'border-border text-muted-foreground hover:border-primary/40' : ''"
              @click="form.relationship = r.value"
            >{{ r.label }}</button>
          </div>
        </div>

        <!-- Tags -->
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">TAGS</p>
          <div class="flex flex-wrap gap-1.5 mb-1.5">
            <span
              v-for="tag in form.tags" :key="tag"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted font-cinzel text-xs text-muted-foreground"
            >
              {{ tag }}
              <button type="button" class="hover:text-destructive leading-none" @click="removeTag(tag)">×</button>
            </span>
          </div>
          <input
            v-model="tagInput" type="text" placeholder="Add tag + Enter"
            class="w-full bg-muted border border-border rounded-md px-2.5 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @keydown.enter.prevent="addTag"
            @keydown.exact.prevent.comma="addTag"
          />
        </div>
      </div>

      <!-- ── Right: form sections ──────────────────────────────────── -->
      <div class="space-y-7">

        <!-- Identity -->
        <section>
          <div class="font-cinzel text-base font-bold text-foreground mb-1">Identity</div>
          <div class="gold-divider mb-3" />
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="sm:col-span-2">
              <label class="field-label">Name *</label>
              <input v-model="form.name" required placeholder="Full name…" class="field-input" />
            </div>
            <div>
              <label class="field-label">Race</label>
              <input v-model="form.race" placeholder="Human, Elf, Tiefling…" class="field-input" />
            </div>
            <div>
              <label class="field-label">Class / Role</label>
              <input v-model="form.class" placeholder="Rogue, Guard, Merchant…" class="field-input" />
            </div>
            <div>
              <label class="field-label">Alignment</label>
              <select v-model="form.alignment" class="field-input">
                <option value="">— None —</option>
                <option v-for="a in ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
              </select>
            </div>
            <div>
              <label class="field-label">Age</label>
              <input v-model="form.age" placeholder="Young, 45, Ancient…" class="field-input" />
            </div>
            <div>
              <label class="field-label">Occupation</label>
              <input v-model="form.occupation" placeholder="Blacksmith, Spy, Innkeeper…" class="field-input" />
            </div>
            <div>
              <label class="field-label">Location</label>
              <input v-model="form.location" placeholder="City, region, or lair…" class="field-input" />
            </div>
            <div class="sm:col-span-2">
              <label class="field-label">Affiliation</label>
              <input v-model="form.affiliation" placeholder="Guild, faction, cult…" class="field-input" />
            </div>
          </div>
        </section>

        <!-- Lore -->
        <section>
          <div class="font-cinzel text-base font-bold text-foreground mb-1">Lore</div>
          <div class="gold-divider mb-3" />
          <div class="space-y-3">
            <div>
              <label class="field-label">Appearance</label>
              <textarea v-model="form.appearance" rows="2" placeholder="Physical description, clothing, distinguishing features…" class="field-input resize-none" />
            </div>
            <div>
              <label class="field-label">Personality</label>
              <textarea v-model="form.personality" rows="2" placeholder="Traits, mannerisms, ideals, bonds, flaws…" class="field-input resize-none" />
            </div>
            <div>
              <label class="field-label">Backstory</label>
              <textarea v-model="form.backstory" rows="3" placeholder="History, origin, formative events…" class="field-input resize-none" />
            </div>
            <div class="border border-burgundy-700/50 rounded-md p-3 bg-burgundy-900/20">
              <label class="field-label">🔐 DM Secret</label>
              <textarea v-model="form.secret" rows="2" placeholder="Hidden motivations, true identity, dark secret…" class="field-input resize-none" />
            </div>
            <div>
              <label class="field-label">Notes</label>
              <textarea v-model="form.notes" rows="2" placeholder="Session notes, loose threads…" class="field-input resize-none" />
            </div>
          </div>
        </section>

        <!-- Stat Block -->
        <section>
          <div class="flex items-center justify-between mb-1">
            <div class="font-cinzel text-base font-bold text-foreground">Stat Block</div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="hasStatBlock" type="checkbox" class="w-4 h-4 rounded border-border accent-primary" />
              <span class="font-fell text-sm text-foreground">Include stat block</span>
            </label>
          </div>
          <div class="gold-divider mb-3" />

          <div v-if="hasStatBlock" class="space-y-4">
            <!-- Template picker -->
            <div>
              <label class="field-label">Load template</label>
              <select class="field-input" @change="applyTemplate(($event.target as HTMLSelectElement).value)">
                <option value="">— Custom / blank —</option>
                <optgroup v-for="cat in templateCategories" :key="cat" :label="cat">
                  <option v-for="t in templatesByCategory(cat)" :key="t.id" :value="t.id">
                    {{ t.name }} (CR {{ t.stat_block.challenge_rating }})
                  </option>
                </optgroup>
              </select>
            </div>

            <!-- Core stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label class="field-label">Armor Class</label>
                <input v-model.number="statBlock.armor_class" type="number" min="0" class="field-input" />
              </div>
              <div>
                <label class="field-label">Hit Points</label>
                <input v-model="statBlock.hit_points" placeholder="52 (8d8+16)" class="field-input" />
              </div>
              <div>
                <label class="field-label">Speed</label>
                <input v-model="statBlock.speed" placeholder="30 ft." class="field-input" />
              </div>
              <div>
                <label class="field-label">Challenge Rating</label>
                <input v-model="statBlock.challenge_rating" placeholder="1/2" class="field-input" />
              </div>
            </div>

            <!-- Ability scores -->
            <div>
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">ABILITY SCORES</p>
              <div class="grid grid-cols-6 gap-1.5">
                <div v-for="ab in ABILITIES" :key="ab.key" class="text-center">
                  <p class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground mb-1">{{ ab.label }}</p>
                  <input
                    v-model.number="(statBlock as Record<string, unknown>)[ab.key]"
                    type="number" min="1" max="30"
                    class="field-input text-center px-1"
                  />
                  <p class="font-fell text-xs text-muted-foreground mt-0.5">
                    {{ modifier((statBlock as Record<string, unknown>)[ab.key] as number) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Text fields -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label class="field-label">Skills</label>
                <input v-model="statBlock.skills" placeholder="Perception +4, Stealth +6" class="field-input" />
              </div>
              <div>
                <label class="field-label">Senses</label>
                <input v-model="statBlock.senses" placeholder="Darkvision 60 ft., passive Perception 14" class="field-input" />
              </div>
              <div>
                <label class="field-label">Damage Resistances</label>
                <input v-model="statBlock.damage_resistances" class="field-input" />
              </div>
              <div>
                <label class="field-label">Damage Immunities</label>
                <input v-model="statBlock.damage_immunities" class="field-input" />
              </div>
              <div>
                <label class="field-label">Condition Immunities</label>
                <input v-model="statBlock.condition_immunities" class="field-input" />
              </div>
              <div>
                <label class="field-label">Languages</label>
                <input v-model="statBlock.languages" placeholder="Common, Elvish" class="field-input" />
              </div>
            </div>

            <!-- Special abilities -->
            <TraitSection v-model="statBlock.special_abilities" label="Special Abilities" />
            <TraitSection v-model="statBlock.actions" label="Actions" />
            <TraitSection v-model="statBlock.legendary_actions" label="Legendary Actions" />
          </div>
        </section>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ImagePlus } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useCreateNpc, useUpdateNpc, useDeleteNpc } from '@/composables/useNpcs'
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES, getNpcTemplate } from '@/data/npcTemplates'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import TraitSection from '@/components/npcs/TraitSection.vue'
import type { Npc, NpcInsert, NpcStatus, NpcRelationship, StatBlock } from '@/types/npc.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: NpcStatus; label: string; color: string }[] = [
  { value: 'alive',   label: 'Alive',   color: '#22c55e' },
  { value: 'dead',    label: 'Dead',    color: '#ef4444' },
  { value: 'missing', label: 'Missing', color: '#f59e0b' },
  { value: 'unknown', label: '?',       color: '#6b7280' },
]
const REL_OPTIONS: { value: NpcRelationship; label: string; color: string }[] = [
  { value: 'ally',    label: 'Ally',    color: '#2563eb' },
  { value: 'neutral', label: 'Neutral', color: '#6b7280' },
  { value: 'enemy',   label: 'Enemy',   color: '#dc2626' },
  { value: 'unknown', label: '?',       color: '#9333ea' },
]
const ALIGNMENTS = [
  'Lawful Good','Neutral Good','Chaotic Good',
  'Lawful Neutral','True Neutral','Chaotic Neutral',
  'Lawful Evil','Neutral Evil','Chaotic Evil','Unaligned',
]
const ABILITIES = [
  { key: 'str', label: 'STR' }, { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' }, { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' }, { key: 'cha', label: 'CHA' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ npc?: Npc | null }>()

// ── Store + mutations ─────────────────────────────────────────────────────────

const router = useRouter()
const auth = useAuthStore()
const { mutateAsync: createNpc, isPending: isCreating } = useCreateNpc()
const { mutateAsync: updateNpc, isPending: isUpdating } = useUpdateNpc()
const { mutateAsync: deleteNpc } = useDeleteNpc()
const isSaving = computed(() => isCreating.value || isUpdating.value)

// ── Form state ────────────────────────────────────────────────────────────────

const form = reactive<NpcInsert>({
  name: props.npc?.name ?? '',
  race: props.npc?.race ?? null,
  class: props.npc?.class ?? null,
  alignment: props.npc?.alignment ?? null,
  age: props.npc?.age ?? null,
  occupation: props.npc?.occupation ?? null,
  location: props.npc?.location ?? null,
  affiliation: props.npc?.affiliation ?? null,
  appearance: props.npc?.appearance ?? null,
  personality: props.npc?.personality ?? null,
  backstory: props.npc?.backstory ?? null,
  secret: props.npc?.secret ?? null,
  notes: props.npc?.notes ?? null,
  status: props.npc?.status ?? 'alive',
  relationship: props.npc?.relationship ?? 'neutral',
  portrait_url: props.npc?.portrait_url ?? null,
  tags: [...(props.npc?.tags ?? [])],
  stat_block: props.npc?.stat_block ?? null,
  scriptorium_doc_id: props.npc?.scriptorium_doc_id ?? null,
})

// ── Stat block ────────────────────────────────────────────────────────────────

const hasStatBlock = ref(!!props.npc?.stat_block)

interface FlatStatBlock {
  armor_class: number
  hit_points: string
  speed: string
  str: number; dex: number; con: number; int: number; wis: number; cha: number
  challenge_rating: string
  skills: string
  damage_resistances: string
  damage_immunities: string
  condition_immunities: string
  senses: string
  languages: string
  special_abilities: StatBlock['special_abilities']
  actions: StatBlock['actions']
  legendary_actions: StatBlock['legendary_actions']
}

function skillsToString(skills?: Record<string, string>): string {
  if (!skills) return ''
  return Object.entries(skills).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')
}

const statBlock = reactive<FlatStatBlock>({
  armor_class: props.npc?.stat_block?.armor_class ?? 10,
  hit_points: props.npc?.stat_block?.hit_points ?? '4 (1d8)',
  speed: props.npc?.stat_block?.speed ?? '30 ft.',
  str: props.npc?.stat_block?.str ?? 10,
  dex: props.npc?.stat_block?.dex ?? 10,
  con: props.npc?.stat_block?.con ?? 10,
  int: props.npc?.stat_block?.int ?? 10,
  wis: props.npc?.stat_block?.wis ?? 10,
  cha: props.npc?.stat_block?.cha ?? 10,
  challenge_rating: props.npc?.stat_block?.challenge_rating ?? '0',
  skills: skillsToString(props.npc?.stat_block?.skills),
  damage_resistances: props.npc?.stat_block?.damage_resistances ?? '',
  damage_immunities: props.npc?.stat_block?.damage_immunities ?? '',
  condition_immunities: props.npc?.stat_block?.condition_immunities ?? '',
  senses: props.npc?.stat_block?.senses ?? '',
  languages: props.npc?.stat_block?.languages ?? '',
  special_abilities: props.npc?.stat_block?.special_abilities ? [...props.npc.stat_block.special_abilities] : [],
  actions: props.npc?.stat_block?.actions ? [...props.npc.stat_block.actions] : [],
  legendary_actions: props.npc?.stat_block?.legendary_actions ? [...props.npc.stat_block.legendary_actions] : [],
})

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

// ── Templates ─────────────────────────────────────────────────────────────────

const templateCategories = computed(() => NPC_TEMPLATE_CATEGORIES)
function templatesByCategory(cat: string) {
  return NPC_TEMPLATES.filter(t => t.category === cat)
}
function applyTemplate(id: string) {
  if (!id) return
  const tpl = getNpcTemplate(id)
  if (!tpl) return
  const sb = tpl.stat_block
  hasStatBlock.value = true
  Object.assign(statBlock, {
    armor_class: sb.armor_class,
    hit_points: sb.hit_points,
    speed: sb.speed,
    str: sb.str, dex: sb.dex, con: sb.con,
    int: sb.int, wis: sb.wis, cha: sb.cha,
    challenge_rating: sb.challenge_rating,
    skills: skillsToString(sb.skills),
    damage_resistances: sb.damage_resistances ?? '',
    damage_immunities: sb.damage_immunities ?? '',
    condition_immunities: sb.condition_immunities ?? '',
    senses: sb.senses ?? '',
    languages: sb.languages ?? '',
    special_abilities: sb.special_abilities ? [...sb.special_abilities] : [],
    actions: sb.actions ? [...sb.actions] : [],
    legendary_actions: sb.legendary_actions ? [...sb.legendary_actions] : [],
  })
}

// ── Tags ──────────────────────────────────────────────────────────────────────

const tagInput = ref('')
function addTag() {
  const t = tagInput.value.trim().replace(/,$/, '')
  if (t && !form.tags.includes(t)) form.tags.push(t)
  tagInput.value = ''
}
function removeTag(tag: string) {
  form.tags = form.tags.filter(t => t !== tag)
}

// ── Portrait upload ───────────────────────────────────────────────────────────

const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)

function triggerPortraitUpload() { fileInput.value?.click() }

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !auth.user) return
  isUploading.value = true
  try {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('npc-portraits').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('npc-portraits').getPublicUrl(path)
    form.portrait_url = data.publicUrl
  } catch (err) {
    void err
  } finally {
    isUploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

function buildStatBlock(): StatBlock | null {
  if (!hasStatBlock.value) return null
  const skillsRecord: Record<string, string> = {}
  if (statBlock.skills) {
    statBlock.skills.split(',').forEach(entry => {
      const match = entry.trim().match(/^(.+?)\s+([+-]\d+)$/)
      if (match) skillsRecord[match[1].trim().replace(/ /g, '_')] = match[2]
    })
  }
  return {
    armor_class: statBlock.armor_class,
    hit_points: statBlock.hit_points,
    speed: statBlock.speed,
    str: statBlock.str, dex: statBlock.dex, con: statBlock.con,
    int: statBlock.int, wis: statBlock.wis, cha: statBlock.cha,
    challenge_rating: statBlock.challenge_rating,
    ...(Object.keys(skillsRecord).length ? { skills: skillsRecord } : {}),
    ...(statBlock.damage_resistances ? { damage_resistances: statBlock.damage_resistances } : {}),
    ...(statBlock.damage_immunities ? { damage_immunities: statBlock.damage_immunities } : {}),
    ...(statBlock.condition_immunities ? { condition_immunities: statBlock.condition_immunities } : {}),
    ...(statBlock.senses ? { senses: statBlock.senses } : {}),
    ...(statBlock.languages ? { languages: statBlock.languages } : {}),
    ...(statBlock.special_abilities?.length ? { special_abilities: statBlock.special_abilities } : {}),
    ...(statBlock.actions?.length ? { actions: statBlock.actions } : {}),
    ...(statBlock.legendary_actions?.length ? { legendary_actions: statBlock.legendary_actions } : {}),
  }
}

async function save() {
  const payload: NpcInsert = {
    ...form,
    race: form.race || null,
    class: form.class || null,
    alignment: form.alignment || null,
    age: form.age || null,
    occupation: form.occupation || null,
    location: form.location || null,
    affiliation: form.affiliation || null,
    appearance: form.appearance || null,
    personality: form.personality || null,
    backstory: form.backstory || null,
    secret: form.secret || null,
    notes: form.notes || null,
    stat_block: buildStatBlock(),
  }
  if (props.npc?.id) {
    await updateNpc({ id: props.npc.id, update: payload })
  } else {
    const created = await createNpc(payload)
    router.replace(`/npcs/${created.id}`)
  }
}

async function confirmDelete() {
  if (!props.npc?.id) return
  if (!window.confirm(`Delete ${props.npc.name}? This cannot be undone.`)) return
  await deleteNpc(props.npc.id)
  router.push('/npcs')
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
</style>

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
          v-if="npc?.id"
          type="button"
          :disabled="isSendingToScriptorium"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
          @click="sendToScriptorium"
        >
          <ScrollText class="h-3.5 w-3.5" />
          {{ isSendingToScriptorium ? 'Exporting…' : 'Send to Scriptorium' }}
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
        <ImageUpload
          :model-value="form.portrait_url || null"
          :focal-point="form.portrait_focal_point"
          bucket="npc-portraits"
          show-focal-point
          @update:model-value="form.portrait_url = $event ?? ''"
          @update:focal-point="form.portrait_focal_point = $event"
        />

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

        <!-- Player sharing -->
        <div class="border border-border rounded-lg p-3 space-y-2.5">
          <div class="flex items-center justify-between">
            <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">SHARE WITH PLAYERS</p>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              :class="form.shared_with_players ? 'bg-primary' : 'bg-muted border border-border'"
              @click="form.shared_with_players = !form.shared_with_players"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                :class="form.shared_with_players ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </button>
          </div>

          <template v-if="form.shared_with_players">
            <p class="font-fell text-[11px] text-muted-foreground italic">Reveal fields to players:</p>
            <div class="space-y-1">
              <label
                v-for="f in PLAYER_FIELDS"
                :key="f.key"
                class="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  class="rounded border-border accent-primary"
                  :checked="form.player_visible_fields.includes(f.key)"
                  @change="toggleVisibleField(f.key)"
                />
                <span class="font-fell text-xs text-foreground">{{ f.label }}</span>
              </label>
            </div>
          </template>
        </div>

        <!-- Monster link -->
        <div class="border border-border rounded-lg p-3 space-y-2">
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">MONSTER LINK</p>
          <EntityCombobox
            :model-value="form.linked_monster_id ?? ''"
            :options="allMonsters ?? []"
            placeholder="Search monsters…"
            @update:model-value="onMonsterLinked($event || null)"
          />
          <p v-if="form.linked_monster_id" class="font-fell text-[11px] text-muted-foreground italic">
            Monster data was imported. Edit fields above to override.
          </p>
          <button
            v-if="npc?.id && !form.linked_monster_id"
            type="button"
            :disabled="isPromoting"
            class="w-full py-1.5 font-cinzel text-xs font-semibold tracking-wider border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            @click="promoteToMonster"
          >
            {{ isPromoting ? 'Promoting…' : 'Promote to Monster' }}
          </button>
          <RouterLink
            v-if="form.linked_monster_id"
            :to="`/monsters/${form.linked_monster_id}`"
            class="block text-center py-1 font-fell text-xs text-primary hover:underline"
          >
            View in Bestiary →
          </RouterLink>
        </div>

        <!-- Tags -->
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">TAGS</p>
          <TagInput v-model="form.tags" />
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
              <EntityCombobox
                :model-value="form.location_id ?? ''"
                :options="locationOptions"
                placeholder="— none —"
                @update:model-value="form.location_id = $event || null"
              >
                <template #option="{ opt }">
                  <span :style="{ paddingLeft: `${(opt as any).depth * 12}px` }">{{ opt.name }}</span>
                </template>
              </EntityCombobox>
            </div>
            <div v-if="npc?.id" class="sm:col-span-2">
              <label class="field-label">Factions</label>
              <NpcFactionsSection :npc-id="npc.id" />
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
              <RichTextEditor v-model="form.appearance" placeholder="Physical description, clothing, distinguishing features…" min-height="100px" />
            </div>
            <div>
              <label class="field-label">Personality</label>
              <RichTextEditor v-model="form.personality" placeholder="Traits, mannerisms, ideals, bonds, flaws…" min-height="100px" />
            </div>
            <div>
              <label class="field-label">Backstory</label>
              <RichTextEditor v-model="form.backstory" placeholder="History, origin, formative events…" min-height="140px" />
            </div>
            <div class="border border-burgundy-700/50 rounded-md p-3 bg-burgundy-900/20">
              <label class="field-label">🔐 DM Secret</label>
              <RichTextEditor v-model="form.secret" placeholder="Hidden motivations, true identity, dark secret…" min-height="100px" />
            </div>
            <div>
              <label class="field-label">DM Notes</label>
              <RichTextEditor v-model="form.notes" placeholder="Session notes, loose threads…" min-height="100px" />
            </div>
            <div v-if="form.shared_with_players">
              <label class="field-label">Party Notes <span class="font-fell font-normal normal-case text-muted-foreground">(visible to all players)</span></label>
              <RichTextEditor v-model="form.party_notes" placeholder="What the party knows about this NPC…" min-height="100px" />
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

        <!-- Relationships -->
        <NpcRelationsSection v-if="npc?.id" :npc-id="npc.id" />

        <!-- Inventory -->
        <NpcInventorySection v-if="npc?.id" :npc-id="npc.id" />
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
import { ref, reactive, computed } from 'vue'
import RichTextEditor from '@/components/common/RichTextEditor.vue'
import TagInput from '@/components/common/TagInput.vue'
import { useRouter } from 'vue-router'
import { ScrollText } from 'lucide-vue-next'
import ImageUpload from '@/components/common/ImageUpload.vue'
import { useCreateNpc, useUpdateNpc, useDeleteNpc } from '@/composables/useNpcs'
import { useLocationTree } from '@/composables/useLocations'
import { useAllMonsters, useCreateMonster } from '@/composables/useMonsters'
import { useCreateScriptoriumDocument } from '@/composables/useScriptorium'
import { formatNpcForScriptorium } from '@/lib/scriptoriumImport'
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES, getNpcTemplate } from '@/data/npcTemplates'
import TraitSection from '@/components/npcs/TraitSection.vue'
import NpcRelationsSection from '@/components/npcs/NpcRelationsSection.vue'
import NpcInventorySection from '@/components/npcs/NpcInventorySection.vue'
import NpcFactionsSection from '@/components/factions/NpcFactionsSection.vue'
import type { Npc, NpcInsert, NpcStatus, NpcRelationship, StatBlock } from '@/types/npc.types'
import { useCampaignStore } from '@/stores/campaign'
import EntityCombobox from '@/components/common/EntityCombobox.vue'
import { STAT_BLOCK_ABILITIES, abilityModifier, skillsToString, skillsToRecord } from '@/lib/utils'

const { confirm, notify } = useConfirm();
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
const ABILITIES = STAT_BLOCK_ABILITIES
const PLAYER_FIELDS = [
  { key: 'portrait',     label: 'Portrait' },
  { key: 'name',         label: 'Name' },
  { key: 'status',       label: 'Alive / Dead status' },
  { key: 'race',         label: 'Race' },
  { key: 'occupation',   label: 'Occupation' },
  { key: 'relationship', label: 'Relationship (ally/enemy…)' },
  { key: 'location',     label: 'Location' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ npc?: Npc | null }>()

// ── Store + mutations ─────────────────────────────────────────────────────────

const router = useRouter()
const { locationOptions } = useLocationTree()
const { data: allMonsters } = useAllMonsters()
const { mutateAsync: createNpc, isPending: isCreating } = useCreateNpc()
const { mutateAsync: updateNpc, isPending: isUpdating } = useUpdateNpc()
const { mutateAsync: deleteNpc } = useDeleteNpc()
const { mutateAsync: createMonster } = useCreateMonster()
const isPromoting = ref(false)
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument()
const campaign = useCampaignStore()
const isSaving = computed(() => isCreating.value || isUpdating.value)
const isSendingToScriptorium = ref(false)

async function sendToScriptorium() {
  if (!props.npc) return
  isSendingToScriptorium.value = true
  try {
    const importData = formatNpcForScriptorium(props.npc)
    const doc = await createScriptoriumDoc(importData)
    // Link the NPC back to the new doc
    await updateNpc({ id: props.npc.id, update: { scriptorium_doc_id: doc.id } })
    router.push(`/scriptorium/${doc.id}`)
  } finally {
    isSendingToScriptorium.value = false
  }
}

async function promoteToMonster() {
  if (!props.npc) return
  isPromoting.value = true
  try {
    const sb = props.npc.stat_block
    const monster = await createMonster({
      name: props.npc.name,
      monster_type: 'humanoid',
      size: 'medium',
      alignment: props.npc.alignment ?? 'unaligned',
      habitat: null,
      source: null,
      tags: [...props.npc.tags],
      image_url: props.npc.portrait_url,
      card_art_url: props.npc.card_art_url,
      portrait_focal_point: props.npc.portrait_focal_point ?? null,
      description: null,
      notes: props.npc.notes,
      stat_block: sb ? { ...sb } : {
        armor_class: 10,
        hit_points: '4 (1d8)',
        speed: '30 ft.',
        str: 10, dex: 10, con: 10,
        int: 10, wis: 10, cha: 10,
        challenge_rating: '0',
      },
    })
    form.linked_monster_id = monster.id
    await updateNpc({ id: props.npc.id, update: { linked_monster_id: monster.id } })
    router.push(`/monsters/${monster.id}`)
  } finally {
    isPromoting.value = false
  }
}

function onMonsterLinked(monsterId: string | null) {
  form.linked_monster_id = monsterId
  if (!monsterId) return
  const m = (allMonsters.value ?? []).find(x => x.id === monsterId)
  if (!m) return

  // Populate identity fields if blank
  if (!form.name)        form.name = m.name
  if (!form.alignment)   form.alignment = m.alignment ?? null
  if (!form.tags.length) form.tags = [...m.tags]

  // Portrait — only fill if none set
  if (!form.portrait_url && m.image_url) {
    form.portrait_url = m.image_url
    form.portrait_focal_point = m.portrait_focal_point ?? null
  }
  if (!form.card_art_url && m.card_art_url) {
    form.card_art_url = m.card_art_url
  }

  // Stat block — import monster stat block and enable it
  const msb = m.stat_block
  hasStatBlock.value = true
  Object.assign(statBlock, {
    armor_class:        msb.armor_class,
    hit_points:         msb.hit_points,
    speed:              msb.speed,
    str: msb.str, dex: msb.dex, con: msb.con,
    int: msb.int, wis: msb.wis, cha: msb.cha,
    challenge_rating:   msb.challenge_rating,
    skills:             skillsToString(msb.skills),
    senses:             msb.senses ?? '',
    languages:          msb.languages ?? '',
    damage_resistances: msb.damage_resistances ?? '',
    damage_immunities:  msb.damage_immunities ?? '',
    condition_immunities: msb.condition_immunities ?? '',
    special_abilities:  msb.special_abilities ? [...msb.special_abilities] : [],
    actions:            msb.actions ? [...msb.actions] : [],
    legendary_actions:  msb.legendary_actions ? [...msb.legendary_actions] : [],
  })
}

// ── Form state ────────────────────────────────────────────────────────────────

const form = reactive<NpcInsert>({
  name: props.npc?.name ?? '',
  race: props.npc?.race ?? null,
  class: props.npc?.class ?? null,
  alignment: props.npc?.alignment ?? null,
  age: props.npc?.age ?? null,
  occupation: props.npc?.occupation ?? null,
  location_id: props.npc?.location_id ?? null,
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
  linked_monster_id: props.npc?.linked_monster_id ?? null,
  scriptorium_doc_id: props.npc?.scriptorium_doc_id ?? null,
  campaign_id: campaign.activeCampaignId,
  card_art_url: props.npc?.card_art_url ?? null,
  portrait_focal_point: props.npc?.portrait_focal_point ?? null,
  shared_with_players: props.npc?.shared_with_players ?? false,
  player_visible_fields: [...(props.npc?.player_visible_fields ?? [])],
  party_notes: props.npc?.party_notes ?? null,
})

function toggleVisibleField(key: string) {
  const idx = form.player_visible_fields.indexOf(key)
  if (idx === -1) form.player_visible_fields.push(key)
  else form.player_visible_fields.splice(idx, 1)
}

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

const modifier = abilityModifier

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


// ── Save / Delete ─────────────────────────────────────────────────────────────

function buildStatBlock(): StatBlock | null {
  if (!hasStatBlock.value) return null
  const skillsRecord = skillsToRecord(statBlock.skills)
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
    location_id: form.location_id || null,
    affiliation: form.affiliation || null,
    appearance: form.appearance || null,
    personality: form.personality || null,
    backstory: form.backstory || null,
    secret: form.secret || null,
    notes: form.notes || null,
    stat_block: buildStatBlock(),
  }
  try {
    if (props.npc?.id) {
      await updateNpc({ id: props.npc.id, update: payload })
    } else {
      await createNpc(payload)
    }
    router.push('/npcs')
  } catch {
    notify('Failed to save NPC. Please try again.')
  }
}

async function confirmDelete() {
  if (!props.npc?.id) return
  if (!await confirm(`Delete ${props.npc.name}? This cannot be undone.`)) return
  try {
    await deleteNpc(props.npc.id)
    router.push('/npcs')
  } catch {
    notify('Failed to delete NPC. Please try again.')
  }
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

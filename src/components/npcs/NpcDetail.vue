<template>
  <form id="npc-detail-form" @submit.prevent="save">

    <!-- Reveal fields (visible when NPC is shared with anyone) -->
    <div
      v-if="npc?.id && form.player_visible_to.length > 0"
      class="mb-4 border border-primary/20 rounded-lg px-4 py-3 bg-primary/5 space-y-3"
    >
      <p class="font-cinzel text-[10px] font-semibold tracking-widest text-muted-foreground">REVEALED FIELDS</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
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
      <div class="pt-1">
        <p class="font-cinzel text-[10px] font-semibold tracking-widest text-muted-foreground mb-2">PARTY NOTES</p>
        <PlayerNotesWidget entity-type="npc" :entity-id="npc.id" placeholder="Notes visible to the whole party…" />
      </div>
      <div class="pt-1">
        <p class="font-cinzel text-[10px] font-semibold tracking-widest text-muted-foreground mb-2">PC CONNECTION NOTES</p>
        <p class="font-fell text-[11px] text-muted-foreground/60 italic mb-2">Per-player notes visible only to the relevant PC.</p>
        <NpcPcNotesSection :npc-id="npc.id" />
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 lg:items-start">
      <!-- ── Left: portrait + meta ────────────────────────────────── -->
      <div class="space-y-4 lg:sticky lg:top-0 lg:pb-4">
        <!-- Portrait (tabbed: True Form / Alter Ego) -->
        <div class="flex flex-col gap-0">
          <div class="flex border-b border-border">
            <button
              v-for="tab in (['true-form', 'alter-ego'] as const)"
              :key="tab"
              type="button"
              class="px-3 py-1.5 font-cinzel text-[11px] font-semibold tracking-wider border-b-2 transition-colors"
              :class="artTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'"
              @click="artTab = tab"
            >{{ tab === 'true-form' ? 'True Form' : 'Alter Ego' }}</button>
          </div>
          <ImageUpload
            v-if="artTab === 'true-form'"
            :model-value="form.portrait_url || null"
            :focal-point="form.portrait_focal_point"
            bucket="npc-portraits"
            show-focal-point
            @update:model-value="form.portrait_url = $event ?? ''"
            @update:focal-point="form.portrait_focal_point = $event"
          />
          <ImageUpload
            v-else
            :model-value="form.disguise_portrait_url || null"
            :focal-point="form.disguise_portrait_focal_point"
            bucket="npc-portraits"
            show-focal-point
            @update:model-value="form.disguise_portrait_url = $event ?? ''"
            @update:focal-point="form.disguise_portrait_focal_point = $event"
          />
        </div>

        <!-- Party Stance (was RELATIONSHIP) -->
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">PARTY STANCE</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
            <button
              v-for="r in REL_OPTIONS" :key="r.value" type="button"
              class="py-1.5 rounded border font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :style="form.relationship === r.value ? { borderColor: r.color, backgroundColor: r.color + '22', color: r.color } : {}"
              :class="form.relationship !== r.value ? 'border-border text-muted-foreground hover:border-primary/40' : ''"
              @click="form.relationship = r.value"
            >{{ r.label }}</button>
          </div>
        </div>

        <!-- Status -->
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">STATUS</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
            <button
              v-for="s in STATUS_OPTIONS" :key="s.value" type="button"
              class="py-1.5 rounded border font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :style="form.status === s.value ? { borderColor: s.color, backgroundColor: s.color + '22', color: s.color } : {}"
              :class="form.status !== s.value ? 'border-border text-muted-foreground hover:border-primary/40' : ''"
              @click="form.status = s.value"
            >{{ s.label }}</button>
          </div>
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
            <div class="sm:col-span-2">
              <label class="field-label">Disguise Name <span class="font-normal text-muted-foreground/60">(alter ego)</span></label>
              <input
                v-model="form.disguise_name"
                placeholder="Melisande the Miller's Wife…"
                class="field-input"
              />
            </div>
            <div>
              <label class="field-label">Species</label>
              <input v-model="form.race" placeholder="Human, Elf, Tiefling…" class="field-input" />
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

        <!-- NPC Connections (was Relationships) -->
        <NpcRelationsSection v-if="npc?.id" :npc-id="npc.id" />

        <!-- Tab bar: Lore | Inventory | Combat -->
        <div>
          <div class="flex gap-0 border-b border-border mb-5">
            <button
              v-for="tab in TABS" :key="tab.key"
              type="button"
              class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider border-b-2 transition-colors -mb-px"
              :class="activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'"
              @click="activeTab = tab.key"
            >{{ tab.label }}</button>
          </div>

          <!-- Lore tab -->
          <div v-if="activeTab === 'lore'" class="space-y-3">
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
            <div>
              <label class="field-label">DM Notes</label>
              <RichTextEditor v-model="form.notes" placeholder="Session notes, secrets, loose threads…" min-height="100px" />
            </div>
          </div>

          <!-- Inventory tab -->
          <div v-else-if="activeTab === 'inventory'">
            <NpcInventorySection v-if="npc?.id" :npc-id="npc.id" :npc-name="npc.name" />
            <p v-else class="font-fell text-sm text-muted-foreground italic">Save the NPC first to manage inventory.</p>
          </div>

          <!-- Combat tab -->
          <div v-else-if="activeTab === 'combat'" class="space-y-4">
            <!-- Monster link + template — two ways to populate the stat block -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- From template -->
              <div class="border border-border rounded-lg p-3 space-y-2">
                <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">FROM TEMPLATE</p>
                <select class="field-input" @change="applyTemplate(($event.target as HTMLSelectElement).value)">
                  <option value="">— Custom / blank —</option>
                  <optgroup v-for="cat in templateCategories" :key="cat" :label="cat">
                    <option v-for="t in templatesByCategory(cat)" :key="t.id" :value="t.id">
                      {{ t.name }} (CR {{ t.stat_block.challenge_rating }})
                    </option>
                  </optgroup>
                </select>
              </div>

              <!-- From Bestiary (monster link) -->
              <div class="border border-border rounded-lg p-3 space-y-2">
                <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">FROM BESTIARY</p>
                <EntityCombobox
                  :model-value="form.linked_monster_id ?? ''"
                  :options="allMonsters ?? []"
                  placeholder="Search monsters…"
                  @update:model-value="onMonsterLinked($event || null)"
                />
                <p v-if="form.linked_monster_id" class="font-fell text-[11px] text-muted-foreground italic">
                  Monster data imported. Edit fields to override.
                </p>
                <div class="flex items-center gap-2">
                  <button
                    v-if="npc?.id && !form.linked_monster_id"
                    type="button"
                    :disabled="isPromoting"
                    class="flex-1 py-1.5 font-cinzel text-xs font-semibold tracking-wider border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                    @click="promoteToMonster"
                  >
                    {{ isPromoting ? 'Promoting…' : 'Promote to Monster' }}
                  </button>
                  <RouterLink
                    v-if="form.linked_monster_id"
                    :to="`/monsters/${form.linked_monster_id}`"
                    class="font-fell text-xs text-primary hover:underline"
                  >
                    View in Bestiary →
                  </RouterLink>
                </div>
              </div>
            </div>

            <!-- Include stat block toggle -->
            <div class="flex items-center justify-between">
              <p class="font-cinzel text-sm font-bold text-foreground">Stat Block</p>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="hasStatBlock" type="checkbox" class="w-4 h-4 rounded border-border accent-primary" />
                <span class="font-fell text-sm text-foreground">Include stat block</span>
              </label>
            </div>
            <div class="gold-divider" />

            <div v-if="hasStatBlock" class="space-y-4">
              <!-- Core stats -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label class="field-label">Armor Class</label>
                  <input v-model.number="statBlock.armor_class" type="number" min="0" class="field-input" />
                </div>
                <div>
                  <label class="field-label">Hit Points</label>
                  <DiceExprInput
                    :model-value="extractDice(statBlock.hit_points) || null"
                    placeholder="8d8+16"
                    @update:model-value="statBlock.hit_points = $event ?? ''"
                  />
                </div>
                <div class="col-span-full">
                  <label class="field-label">Speed</label>
                  <div class="grid grid-cols-5 gap-2 mt-1">
                    <div v-for="sp in SPEED_TYPES" :key="sp.key" class="flex flex-col items-center gap-1">
                      <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">{{ sp.label }}</span>
                      <!-- Fly: left-edge hover toggle embedded in the box -->
                      <div v-if="sp.key === 'fly'"
                        class="relative w-full rounded-md overflow-hidden border border-border bg-muted focus-within:ring-1 focus-within:ring-ring">
                        <button type="button"
                          class="absolute inset-y-0 left-0 w-4 transition-colors flex items-center justify-center"
                          :class="speedObj.hover && speedObj.fly ? 'bg-primary/70' : 'bg-border/50 hover:bg-border/80'"
                          :title="!speedObj.fly ? 'Set a fly speed to enable hover' : speedObj.hover ? 'Hover on — click to disable' : 'Hover off — click to enable'"
                          @click="speedObj.fly && (speedObj.hover = !speedObj.hover)"
                        >
                          <Wind class="w-2.5 h-2.5 shrink-0"
                            :class="speedObj.hover && speedObj.fly ? 'text-primary-foreground' : 'text-muted-foreground/60'" />
                        </button>
                        <input :value="speedObj.fly ?? ''" type="number" step="5" min="0" placeholder="—"
                          class="speed-input w-full bg-transparent pl-6 pr-8 py-1.5 font-fell text-sm text-foreground text-center placeholder:text-muted-foreground/40 focus:outline-none"
                          @input="setSpeed('fly', ($event.target as HTMLInputElement).value)" />
                        <span class="absolute inset-y-0 right-1.5 flex items-center pointer-events-none font-cinzel text-[10px] text-muted-foreground">ft.</span>
                      </div>
                      <!-- Other speeds: standard -->
                      <div v-else class="relative w-full">
                        <input :value="speedObj[sp.key] ?? ''" type="number" step="5" min="0" placeholder="—"
                          class="field-input speed-input w-full text-center"
                          @input="setSpeed(sp.key, ($event.target as HTMLInputElement).value)" />
                        <span class="absolute inset-y-0 right-1.5 flex items-center pointer-events-none font-cinzel text-[10px] text-muted-foreground">ft.</span>
                      </div>
                    </div>
                  </div>
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
                  <label class="field-label">Saving Throws</label>
                  <input v-model="statBlock.saving_throws" placeholder="Con +5, Wis +3" class="field-input" />
                </div>
                <div>
                  <label class="field-label">Proficiency Bonus</label>
                  <input v-model="statBlock.proficiency_bonus" type="number" min="0" placeholder="2" class="field-input" />
                </div>
                <div>
                  <label class="field-label">Skills</label>
                  <input v-model="statBlock.skills" placeholder="Perception +4, Stealth +6" class="field-input" />
                </div>
                <div>
                  <label class="field-label">Senses</label>
                  <input v-model="statBlock.senses" placeholder="Darkvision 60 ft., passive Perception 14" class="field-input" />
                </div>
                <div>
                  <label class="field-label">Damage Vulnerabilities</label>
                  <input v-model="statBlock.damage_vulnerabilities" class="field-input" placeholder="bludgeoning" />
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
              <SpellcastingSection
                v-model="statBlock.spellcasting"
                :ability-scores="{ int: statBlock.int, wis: statBlock.wis, cha: statBlock.cha }"
                :proficiency-bonus="statBlock.proficiency_bonus ? Number(statBlock.proficiency_bonus) : null"
                :challenge-rating="statBlock.challenge_rating"
              />
              <TraitSection v-model="statBlock.actions" label="Actions" />
              <TraitSection v-model="statBlock.bonus_actions" label="Bonus Actions" />
              <TraitSection v-model="statBlock.reactions" label="Reactions" />
              <TraitSection v-model="statBlock.legendary_actions" label="Legendary Actions" />
              <TraitSection v-model="statBlock.lair_actions" label="Lair Actions" />
            </div>
          </div>
        </div>

      </div>
    </div>
  </form>

  <NpcGenerateDialog
    v-if="showGenerateDialog"
    @close="showGenerateDialog = false"
    @generated="onAiGenerated"
  />

  <PaywallModal v-model="showPaywall" resource="npcs" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
import { ref, reactive, computed, watch, watchEffect } from 'vue'
import { Wind } from 'lucide-vue-next'
import { parseSpeed, speedToString } from '@/lib/utils'
import type { SpeedBlock } from '@/lib/utils'
import RichTextEditor from '@/components/common/RichTextEditor.vue'
import TagInput from '@/components/common/TagInput.vue'
import { useRouter } from 'vue-router'
import NpcGenerateDialog from '@/ai/NpcGenerateDialog.vue'
import { toTiptapJson } from '@/ai/useNpcGeneration'
import type { NpcAiGenerated } from '@/ai/types'
import ImageUpload from '@/components/common/ImageUpload.vue'
import { useCreateNpc, useUpdateNpc, useDeleteNpc } from '@/composables/useNpcs'
import { useCampaignMessages } from '@/composables/useCampaignMessages'
import { useUiStore } from '@/stores/ui'
import { useLocationTree } from '@/composables/useLocations'
import { useAllMonsters, useCreateMonster } from '@/composables/useMonsters'
import { useCreateScriptoriumDocument } from '@/composables/useScriptorium'
import { formatNpcForScriptorium } from '@/lib/scriptoriumImport'
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES, getNpcTemplate } from '@/data/npcTemplates'
import TraitSection from '@/components/npcs/TraitSection.vue'
import SpellcastingSection from '@/components/common/SpellcastingSection.vue'
import NpcRelationsSection from '@/components/npcs/NpcRelationsSection.vue'
import NpcPcNotesSection from '@/components/npcs/NpcPcNotesSection.vue'
import NpcInventorySection from '@/components/npcs/NpcInventorySection.vue'
import NpcFactionsSection from '@/components/factions/NpcFactionsSection.vue'
import type { Npc, NpcInsert, NpcStatus, NpcRelationship, StatBlock } from '@/types/npc.types'
import { useCampaignStore } from '@/stores/campaign'
import EntityCombobox from '@/components/common/EntityCombobox.vue'
import DiceExprInput from '@/components/common/DiceExprInput.vue'
import PlayerNotesWidget from '@/components/common/PlayerNotesWidget.vue'
import { STAT_BLOCK_ABILITIES, abilityModifier, skillsToString, skillsToRecord } from '@/lib/utils'
import PaywallModal from '@/components/common/PaywallModal.vue'
import { isQuotaExceeded } from '@/lib/quotaError'

function extractDice(val: string): string {
  const m = val.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : val;
}

const { confirm, notify } = useConfirm();
const showPaywall = ref(false);

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'lore',      label: 'Lore' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'combat',    label: 'Combat' },
] as const
type TabKey = typeof TABS[number]['key']

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
  { key: 'race',         label: 'Species' },
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
const ui = useUiStore()
const { sendNarrativeEvent } = useCampaignMessages()
const isPromoting = ref(false)
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument()
const campaign = useCampaignStore()
const isSaving = computed(() => isCreating.value || isUpdating.value)
const isSendingToScriptorium = ref(false)

// ── UI state ──────────────────────────────────────────────────────────────────

const activeTab = ref<TabKey>('lore')
const showGenerateDialog = ref(false)
const artTab = ref<'true-form' | 'alter-ego'>(
  props.npc?.disguise_name || props.npc?.disguise_portrait_url ? 'alter-ego' : 'true-form'
)

const aiApiKey = computed(() => campaign.decryptedApiKey)

function onAiGenerated(result: NpcAiGenerated) {
  showGenerateDialog.value = false
  form.name        = result.name
  form.race        = result.race || null
  form.alignment   = result.alignment || null
  form.age         = result.age || null
  form.occupation  = result.occupation || null
  form.status      = result.status
  form.relationship = result.relationship
  form.tags        = [...result.tags]
  form.appearance  = result.appearance  ? toTiptapJson(result.appearance)  : null
  form.personality = result.personality ? toTiptapJson(result.personality) : null
  form.backstory   = result.backstory   ? toTiptapJson(result.backstory)   : null
  form.notes       = result.notes       ? toTiptapJson(result.notes)       : null
  if (result.portrait_url) {
    form.portrait_url = result.portrait_url
    form.portrait_focal_point = null
  }
  if (result.disguise_portrait_url) {
    form.disguise_portrait_url = result.disguise_portrait_url
    form.disguise_portrait_focal_point = null
    artTab.value = 'alter-ego'
  }
  if (result.disguise_name) {
    form.disguise_name = result.disguise_name
  }
  // Jump to Lore tab so the DM can see the filled fields
  activeTab.value = 'lore'
}

async function sendToScriptorium() {
  if (!props.npc) return
  isSendingToScriptorium.value = true
  try {
    const locationName = props.npc.location_id
      ? (locationOptions.value.find((l) => l.id === props.npc!.location_id)?.name ?? null)
      : null
    const importData = formatNpcForScriptorium(props.npc, locationName)
    const doc = await createScriptoriumDoc(importData)
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
  if (!monsterId) { form.linked_monster_id = null; return }
  const m = (allMonsters.value ?? []).find(x => x.id === monsterId)
  if (!m) return
  // SRD monsters don't have UUID rows — import their data as a template but don't link
  form.linked_monster_id = m.is_srd ? null : monsterId

  if (!form.name)        form.name = m.name
  if (!form.alignment)   form.alignment = m.alignment ?? null
  if (!form.tags.length) form.tags = [...m.tags]

  if (!form.portrait_url && m.image_url) {
    form.portrait_url = m.image_url
    form.portrait_focal_point = m.portrait_focal_point ?? null
  }

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
    damage_vulnerabilities: msb.damage_vulnerabilities ?? '',
    damage_resistances: msb.damage_resistances ?? '',
    damage_immunities:  msb.damage_immunities ?? '',
    condition_immunities: msb.condition_immunities ?? '',
    special_abilities:  msb.special_abilities ? [...msb.special_abilities] : [],
    actions:            msb.actions ? [...msb.actions] : [],
    bonus_actions:      msb.bonus_actions ? [...msb.bonus_actions] : [],
    reactions:          msb.reactions ? [...msb.reactions] : [],
    legendary_actions:  msb.legendary_actions ? [...msb.legendary_actions] : [],
    lair_actions:       msb.lair_actions ? [...msb.lair_actions] : [],
    spellcasting:       msb.spellcasting ?? null,
  })
}

// ── Form state ────────────────────────────────────────────────────────────────

const form = reactive<NpcInsert>({
  name: props.npc?.name ?? '',
  race: props.npc?.race ?? null,
  alignment: props.npc?.alignment ?? null,
  age: props.npc?.age ?? null,
  occupation: props.npc?.occupation ?? null,
  location_id: props.npc?.location_id ?? null,
  appearance: props.npc?.appearance ?? null,
  personality: props.npc?.personality ?? null,
  backstory: props.npc?.backstory ?? null,
  notes: props.npc?.notes ?? null,
  status: props.npc?.status ?? 'alive',
  relationship: props.npc?.relationship ?? 'neutral',
  portrait_url: props.npc?.portrait_url ?? null,
  disguise_name: props.npc?.disguise_name ?? null,
  disguise_portrait_url: props.npc?.disguise_portrait_url ?? null,
  disguise_portrait_focal_point: props.npc?.disguise_portrait_focal_point ?? null,
  is_revealed: props.npc?.is_revealed ?? false,
  tags: [...(props.npc?.tags ?? [])],
  stat_block: props.npc?.stat_block ?? null,
  linked_monster_id: props.npc?.linked_monster_id ?? null,
  scriptorium_doc_id: props.npc?.scriptorium_doc_id ?? null,
  campaign_id: campaign.activeCampaignId,
  portrait_focal_point: props.npc?.portrait_focal_point ?? null,
  player_visible_fields: [...(props.npc?.player_visible_fields ?? [])],
  player_visible_to: props.npc?.player_visible_to ?? [],
})

// Sync sharing fields if the prop updates after mount (e.g. list popover saved first)
watch(() => props.npc?.player_visible_to, (val) => {
  form.player_visible_to = val ?? []
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
  proficiency_bonus: string
  saving_throws: string
  skills: string
  damage_resistances: string
  damage_immunities: string
  condition_immunities: string
  senses: string
  languages: string
  damage_vulnerabilities: string
  special_abilities: StatBlock['special_abilities']
  actions: StatBlock['actions']
  bonus_actions: StatBlock['bonus_actions']
  reactions: StatBlock['reactions']
  legendary_actions: StatBlock['legendary_actions']
  lair_actions: StatBlock['lair_actions']
  spellcasting: StatBlock['spellcasting'] | null
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
  proficiency_bonus: String(props.npc?.stat_block?.proficiency_bonus ?? ''),
  saving_throws: props.npc?.stat_block?.saving_throws ?? '',
  skills: skillsToString(props.npc?.stat_block?.skills),
  damage_vulnerabilities: props.npc?.stat_block?.damage_vulnerabilities ?? '',
  damage_resistances: props.npc?.stat_block?.damage_resistances ?? '',
  damage_immunities: props.npc?.stat_block?.damage_immunities ?? '',
  condition_immunities: props.npc?.stat_block?.condition_immunities ?? '',
  senses: props.npc?.stat_block?.senses ?? '',
  languages: props.npc?.stat_block?.languages ?? '',
  special_abilities: props.npc?.stat_block?.special_abilities ? [...props.npc.stat_block.special_abilities] : [],
  actions: props.npc?.stat_block?.actions ? [...props.npc.stat_block.actions] : [],
  bonus_actions: props.npc?.stat_block?.bonus_actions ? [...props.npc.stat_block.bonus_actions] : [],
  reactions: props.npc?.stat_block?.reactions ? [...props.npc.stat_block.reactions] : [],
  legendary_actions: props.npc?.stat_block?.legendary_actions ? [...props.npc.stat_block.legendary_actions] : [],
  lair_actions: props.npc?.stat_block?.lair_actions ? [...props.npc.stat_block.lair_actions] : [],
  spellcasting: props.npc?.stat_block?.spellcasting ?? null,
})

// Speed structured editor state — parsed from statBlock.speed on init,
// kept in sync so buildStatBlock() always gets the right string.
const speedObj = reactive<SpeedBlock>(parseSpeed(statBlock.speed))
watchEffect(() => {
  statBlock.speed = speedToString(speedObj)
})

const SPEED_TYPES = [
  { key: 'walk',   label: 'Walk'   },
  { key: 'fly',    label: 'Fly'    },
  { key: 'swim',   label: 'Swim'   },
  { key: 'climb',  label: 'Climb'  },
  { key: 'burrow', label: 'Burrow' },
] as const

function setSpeed(key: 'walk' | 'fly' | 'swim' | 'climb' | 'burrow', val: string) {
  speedObj[key] = val === '' ? undefined : parseInt(val, 10)
  if (key === 'fly' && !speedObj.fly) speedObj.hover = undefined
}

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
  // Sync speedObj from template before watchEffect re-serializes it
  const parsed = parseSpeed(sb.speed)
  speedObj.walk = parsed.walk; speedObj.fly = parsed.fly; speedObj.swim = parsed.swim
  speedObj.climb = parsed.climb; speedObj.burrow = parsed.burrow; speedObj.hover = parsed.hover
  Object.assign(statBlock, {
    armor_class: sb.armor_class,
    hit_points: sb.hit_points,
    str: sb.str, dex: sb.dex, con: sb.con,
    int: sb.int, wis: sb.wis, cha: sb.cha,
    challenge_rating: sb.challenge_rating,
    proficiency_bonus: String(sb.proficiency_bonus ?? ''),
    saving_throws: sb.saving_throws ?? '',
    skills: skillsToString(sb.skills),
    damage_resistances: sb.damage_resistances ?? '',
    damage_immunities: sb.damage_immunities ?? '',
    condition_immunities: sb.condition_immunities ?? '',
    senses: sb.senses ?? '',
    languages: sb.languages ?? '',
    special_abilities: sb.special_abilities ? [...sb.special_abilities] : [],
    actions: sb.actions ? [...sb.actions] : [],
    legendary_actions: sb.legendary_actions ? [...sb.legendary_actions] : [],
    spellcasting: sb.spellcasting ?? null,
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
    ...(statBlock.proficiency_bonus ? { proficiency_bonus: Number(statBlock.proficiency_bonus) } : {}),
    ...(statBlock.saving_throws ? { saving_throws: statBlock.saving_throws } : {}),
    ...(Object.keys(skillsRecord).length ? { skills: skillsRecord } : {}),
    ...(statBlock.damage_vulnerabilities ? { damage_vulnerabilities: statBlock.damage_vulnerabilities } : {}),
    ...(statBlock.damage_resistances ? { damage_resistances: statBlock.damage_resistances } : {}),
    ...(statBlock.damage_immunities ? { damage_immunities: statBlock.damage_immunities } : {}),
    ...(statBlock.condition_immunities ? { condition_immunities: statBlock.condition_immunities } : {}),
    ...(statBlock.senses ? { senses: statBlock.senses } : {}),
    ...(statBlock.languages ? { languages: statBlock.languages } : {}),
    ...(statBlock.special_abilities?.length ? { special_abilities: statBlock.special_abilities } : {}),
    ...(statBlock.actions?.length ? { actions: statBlock.actions } : {}),
    ...(statBlock.bonus_actions?.length ? { bonus_actions: statBlock.bonus_actions } : {}),
    ...(statBlock.reactions?.length ? { reactions: statBlock.reactions } : {}),
    ...(statBlock.legendary_actions?.length ? { legendary_actions: statBlock.legendary_actions } : {}),
    ...(statBlock.lair_actions?.length ? { lair_actions: statBlock.lair_actions } : {}),
    ...(statBlock.spellcasting?.entries?.length ? { spellcasting: statBlock.spellcasting } : {}),
  }
}

async function save() {
  const payload: NpcInsert = {
    ...form,
    race: form.race || null,
    alignment: form.alignment || null,
    age: form.age || null,
    occupation: form.occupation || null,
    location_id: form.location_id || null,
    appearance: form.appearance || null,
    personality: form.personality || null,
    backstory: form.backstory || null,
    notes: form.notes || null,
    stat_block: buildStatBlock(),
    player_visible_to: form.player_visible_to,
  }
  try {
    // DM Prep/Play mode (#133): detect a "reveal" — NPC goes from unseen by
    // any player to visible to at least one. Fire the narrative event AFTER
    // the save succeeds so players don't see a ghost entry on network error.
    // Transition rule: old count 0 → new count ≥ 1 triggers; adding more
    // players to an already-visible NPC is silent (they already know it
    // exists).
    const wasHidden = (props.npc?.player_visible_to?.length ?? 0) === 0;
    const isNowVisible = form.player_visible_to.length > 0;
    const becameVisible = wasHidden && isNowVisible;

    if (props.npc?.id) {
      // Exclude campaign_id: it must not be overwritten on update (could be null
      // if activeCampaignId hasn't loaded yet, severing the campaign link).
      const { campaign_id: _cid, ...updatePayload } = payload;
      await updateNpc({ id: props.npc.id, update: updatePayload })
    } else {
      const created = await createNpc(payload)
      // Stay on the detail page after create so faction/relation links can be added immediately
      router.push(`/npcs/${created.id}`)
    }

    if (becameVisible && ui.dmMode === 'play' && form.name.trim()) {
      // Fire-and-forget — chat failure must not block the save navigation.
      void sendNarrativeEvent(`You encounter ${form.name.trim()}.`)
    }

    if (props.npc?.id) router.push('/npcs')
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    notify('Failed to save NPC. Please try again.')
  }
}

async function confirmDelete() {
  if (!props.npc?.id) return
  if (!await confirm(`Delete ${props.npc.name}? This cannot be undone.`)) return
  try {
    await deleteNpc(props.npc)
    router.push('/npcs')
  } catch {
    notify('Failed to delete NPC. Please try again.')
  }
}

defineExpose({
  isSaving,
  isSendingToScriptorium,
  aiApiKey,
  showGenerateDialog,
  form,
  sendToScriptorium,
  confirmDelete,
})
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
.speed-input { -moz-appearance: textfield; }
.speed-input::-webkit-outer-spin-button,
.speed-input::-webkit-inner-spin-button { appearance: none; }
</style>

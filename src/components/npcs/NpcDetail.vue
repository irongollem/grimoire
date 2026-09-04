<template>
  <!-- Mobile edit layer (<md): own app bar + stacked cards + save bar. Drives
       the same reactive form/statBlock and handlers that live in this file. -->
  <NpcEditMobile
    v-if="isMobile"
    :form="form"
    :stat-block="statBlock"
    :has-stat-block="hasStatBlock"
    :art-tab="artTab"
    :location-options="locationOptions"
    :all-monsters="allMonsters ?? []"
    :npc="npc"
    :is-new="!npc"
    :is-saving="isSaving"
    :is-sending-to-scriptorium="isSendingToScriptorium"
    :is-ai-enabled="isAiEnabled"
    @save="save"
    @cancel="onMobileCancel"
    @delete="confirmDelete"
    @generate="showGenerateDialog = true"
    @scriptorium="sendToScriptorium"
    @apply-template="applyTemplate"
    @link-monster="onMonsterLinked"
    @update:has-stat-block="hasStatBlock = $event"
    @update:art-tab="artTab = $event"
  />

  <form v-else id="npc-detail-form" class="max-w-full min-w-0" @submit.prevent="save">

    <!--
      Notes the party can read, shown once this NPC is revealed to someone.

      These used to be a slot inside `RevealedFieldsPanel`, which also drew the
      "which fields do players see" checkboxes. Those checkboxes are now the
      "what" half of the reveal control in the header, next to the audience they
      apply to. The notes stayed behind: they are prose the DM writes, and a
      rich-text editor does not belong inside a popover.
    -->
    <div
      v-if="npc?.id && form.player_visible_to.length"
      class="mb-4 space-y-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <div>
        <p class="font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground mb-2">PARTY NOTES</p>
        <PlayerNotesWidget entity-type="npc" :entity-id="npc.id" placeholder="Notes visible to the whole party…" />
      </div>
      <div>
        <p class="font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground mb-2">PC CONNECTION NOTES</p>
        <p class="text-caption text-muted-foreground/60 italic mb-2">Per-player notes visible only to the relevant PC.</p>
        <NpcPcNotesSection :npc-id="npc.id" />
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-[13.75rem_1fr] gap-6 lg:items-start min-w-0 max-w-full">
      <!-- ── Left: portrait + meta ────────────────────────────────── -->
      <NpcSidebar
        :art-tab="artTab"
        :npc-id="npc?.id"
        :portrait-url="form.portrait_url"
        :portrait-focal-point="form.portrait_focal_point"
        :disguise-portrait-url="form.disguise_portrait_url"
        :disguise-portrait-focal-point="form.disguise_portrait_focal_point"
        :relationship="form.relationship"
        :status="form.status"
        :tags="form.tags"
        :ai-context="aiContext"
        @update:art-tab="artTab = $event"
        @update:portrait-url="form.portrait_url = $event"
        @update:portrait-focal-point="form.portrait_focal_point = $event"
        @update:disguise-portrait-url="form.disguise_portrait_url = $event"
        @update:disguise-portrait-focal-point="form.disguise_portrait_focal_point = $event"
        @update:relationship="form.relationship = $event"
        @update:status="form.status = $event"
        @update:tags="form.tags = $event"
      />

      <!-- ── Right: form sections ──────────────────────────────────── -->
      <div class="space-y-7 min-w-0">

        <!-- Identity -->
        <NpcIdentitySection
          :npc-id="npc?.id ?? null"
          :name="form.name"
          :disguise-name="form.disguise_name"
          :race="form.race"
          :alignment="form.alignment"
          :age="form.age"
          :occupation="form.occupation"
          :location-id="form.location_id"
          :location-options="locationOptions"
          @update:name="form.name = $event"
          @update:disguise-name="form.disguise_name = $event"
          @update:race="form.race = $event"
          @update:alignment="form.alignment = $event"
          @update:age="form.age = $event"
          @update:occupation="form.occupation = $event"
          @update:location-id="form.location_id = $event"
        />

        <!-- NPC Connections (was Relationships) -->
        <NpcRelationsSection v-if="npc?.id" :npc-id="npc.id" />

        <!-- Tab bar: Lore | Inventory | Combat -->
        <div>
          <TabBar :tabs="TABS_BAR" v-model="activeTab" class="mb-5" />

          <!-- Lore tab -->
          <NpcLoreTab
            v-if="activeTab === 'lore'"
            :npc-name="form.name"
            :appearance="form.appearance"
            :personality="form.personality"
            :backstory="form.backstory"
            :notes="form.notes"
            @update:appearance="form.appearance = $event"
            @update:personality="form.personality = $event"
            @update:backstory="form.backstory = $event"
            @update:notes="form.notes = $event"
          />

          <!-- Inventory tab -->
          <div v-else-if="activeTab === 'inventory'">
            <NpcInventorySection v-if="npc?.id" :npc-id="npc.id" :npc-name="getNpcDisplayName(npc)" />
            <p v-else class="text-body text-muted-foreground italic">Save the NPC first to manage inventory.</p>
          </div>

          <!-- Combat tab -->
          <div v-else-if="activeTab === 'combat'" class="space-y-4">
            <!-- Monster link + template — two ways to populate the stat block -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- From template -->
              <div class="border border-border rounded-lg p-3 space-y-2">
                <p class="text-label-lg font-semibold text-muted-foreground">FROM TEMPLATE</p>
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
                <p class="text-label-lg font-semibold text-muted-foreground">FROM BESTIARY</p>
                <EntityCombobox
                  :model-value="form.linked_monster_id ?? ''"
                  :options="allMonsters ?? []"
                  placeholder="Search monsters…"
                  @update:model-value="onMonsterLinked($event || null)"
                />
                <p v-if="form.linked_monster_id" class="text-caption text-muted-foreground italic">
                  Monster data imported. Edit fields to override.
                </p>
                <div class="flex items-center gap-2">
                  <button
                    v-if="npc?.id && !form.linked_monster_id"
                    type="button"
                    :disabled="isPromoting"
                    class="flex-1 py-1.5 text-label-lg font-semibold border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                    @click="promoteToMonster"
                  >
                    {{ isPromoting ? 'Promoting…' : 'Promote to Monster' }}
                  </button>
                  <RouterLink
                    v-if="form.linked_monster_id"
                    :to="`/monsters/${form.linked_monster_id}`"
                    class="text-caption text-primary hover:underline"
                  >
                    View in Bestiary →
                  </RouterLink>
                </div>
              </div>
            </div>

            <!-- Include stat block toggle -->
            <div class="flex items-center justify-between">
              <p class="font-cinzel text-sm font-bold text-foreground">Stat Block</p>
              <AppCheckbox v-model="hasStatBlock" label="Include stat block" />
            </div>
            <div class="gold-divider" />

            <div v-if="hasStatBlock">
              <StatBlockEditor :sb="statBlock" show-legendary show-lair />
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
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import NpcGenerateDialog from '@/ai/NpcGenerateDialog.vue'
import { toTiptapJson } from '@/ai/useNpcGeneration'
import { markEdited } from '@/ai/provenance'
import { deepEqual } from '@/lib/utils'
import type { NpcAiGenerated } from '@/ai/types'
import { useCreateNpc, useUpdateNpc, useDeleteNpc } from '@/composables/npcs/useNpcs'
import { useCampaignMessages } from '@/composables/campaign/useCampaignMessages'
import { useUiStore } from '@/stores/ui'
import { useLocationTree } from '@/composables/locations/useLocations'
import { useAllMonsters, useCreateMonster } from '@/composables/monsters/useMonsters'
import { useCreateScriptoriumDocument } from '@/composables/scriptorium/useScriptorium'
import { formatNpcForScriptorium } from '@/lib/scriptorium/scriptoriumImport'
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES, getNpcTemplate } from '@/data/npcTemplates'
import NpcRelationsSection from '@/components/npcs/NpcRelationsSection.vue'
import NpcPcNotesSection from '@/components/npcs/NpcPcNotesSection.vue'
import NpcInventorySection from '@/components/npcs/NpcInventorySection.vue'
import NpcLoreTab from '@/components/npcs/NpcLoreTab.vue'
import NpcIdentitySection from '@/components/npcs/NpcIdentitySection.vue'
import NpcSidebar from '@/components/npcs/NpcSidebar.vue'
import { buildEntityContext, toPlainText } from '@/ai/utils'
import NpcEditMobile from '@/components/npcs/NpcEditMobile.vue'
import type { Npc, NpcInsert, StatBlock } from '@/types/npc.types'
import { useCampaignStore } from '@/stores/campaign'
import EntityCombobox from '@/components/common/EntityCombobox.vue'
import PlayerNotesWidget from '@/components/common/PlayerNotesWidget.vue'
import PaywallModal from '@/components/common/PaywallModal.vue'
import { isQuotaExceeded } from '@/lib/quotaError'
import { getNpcDisplayName, getNpcPlayerFacingName, NPC_UNNAMED_IN_PROSE } from '@/lib/npcDisplay'
import TabBar from '@/components/common/TabBar.vue'
import StatBlockEditor from '@/components/common/StatBlockEditor.vue'

const { confirm, notify } = useConfirm();
const showPaywall = ref(false);

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'lore',      label: 'Lore' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'combat',    label: 'Combat' },
] as const
type TabKey = typeof TABS[number]['key']
const TABS_BAR = TABS.map(t => ({ id: t.key, label: t.label }))


// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ npc?: Npc | null }>()

// Mobile (<md) renders NpcEditMobile instead of the desktop grid form. Desktop
// markup is unchanged and only conditionally rendered (v-if on the <form>).
const isMobile = useMediaQuery('(max-width: 767px)')

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
const isAiEnabled = computed(() => campaign.isAiEnabled)

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
  form.ai_provenance = result.ai_provenance ?? null
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
      // The NPC it was promoted from belongs to this campaign, so the stat
      // block does too.
      campaign_id: campaign.activeCampaignId,
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
  form.linked_monster_id = m.is_shared ? null : monsterId

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
    skills:             msb.skills ? { ...msb.skills } : undefined,
    senses:             msb.senses,
    languages:          msb.languages,
    damage_vulnerabilities: msb.damage_vulnerabilities,
    damage_resistances: msb.damage_resistances,
    damage_immunities:  msb.damage_immunities,
    condition_immunities: msb.condition_immunities,
    special_abilities:  msb.special_abilities ? [...msb.special_abilities] : [],
    actions:            msb.actions ? [...msb.actions] : [],
    bonus_actions:      msb.bonus_actions ? [...msb.bonus_actions] : [],
    reactions:          msb.reactions ? [...msb.reactions] : [],
    legendary_actions:  msb.legendary_actions ? [...msb.legendary_actions] : [],
    lair_actions:       msb.lair_actions ? [...msb.lair_actions] : [],
    spellcasting:       msb.spellcasting,
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
  relationship: props.npc?.relationship ?? 'unknown',
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
  ai_provenance: props.npc?.ai_provenance ?? null,
})

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    [form.race, form.occupation].filter(Boolean).join(', '),
    toPlainText(form.appearance),
    toPlainText(form.personality),
  ]),
)

// Sync sharing fields if the prop updates after mount (e.g. list popover saved first)
watch(() => props.npc?.player_visible_to, (val) => {
  form.player_visible_to = val ?? []
})

// ── Stat block ────────────────────────────────────────────────────────────────

const hasStatBlock = ref(!!props.npc?.stat_block)

const statBlock = reactive<StatBlock>({
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
  proficiency_bonus: props.npc?.stat_block?.proficiency_bonus,
  saving_throws: props.npc?.stat_block?.saving_throws,
  skills: props.npc?.stat_block?.skills ? { ...props.npc.stat_block.skills } : undefined,
  damage_vulnerabilities: props.npc?.stat_block?.damage_vulnerabilities,
  damage_resistances: props.npc?.stat_block?.damage_resistances,
  damage_immunities: props.npc?.stat_block?.damage_immunities,
  condition_immunities: props.npc?.stat_block?.condition_immunities,
  senses: props.npc?.stat_block?.senses,
  languages: props.npc?.stat_block?.languages,
  special_abilities: props.npc?.stat_block?.special_abilities ? [...props.npc.stat_block.special_abilities] : [],
  actions: props.npc?.stat_block?.actions ? [...props.npc.stat_block.actions] : [],
  bonus_actions: props.npc?.stat_block?.bonus_actions ? [...props.npc.stat_block.bonus_actions] : [],
  reactions: props.npc?.stat_block?.reactions ? [...props.npc.stat_block.reactions] : [],
  legendary_actions: props.npc?.stat_block?.legendary_actions ? [...props.npc.stat_block.legendary_actions] : [],
  lair_actions: props.npc?.stat_block?.lair_actions ? [...props.npc.stat_block.lair_actions] : [],
  spellcasting: props.npc?.stat_block?.spellcasting,
})

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
    proficiency_bonus: sb.proficiency_bonus,
    saving_throws: sb.saving_throws,
    skills: sb.skills ? { ...sb.skills } : undefined,
    damage_resistances: sb.damage_resistances,
    damage_immunities: sb.damage_immunities,
    condition_immunities: sb.condition_immunities,
    senses: sb.senses,
    languages: sb.languages,
    special_abilities: sb.special_abilities ? [...sb.special_abilities] : [],
    actions: sb.actions ? [...sb.actions] : [],
    legendary_actions: sb.legendary_actions ? [...sb.legendary_actions] : [],
    spellcasting: sb.spellcasting,
  })
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

function buildStatBlock(): StatBlock | null {
  if (!hasStatBlock.value) return null
  return {
    armor_class: statBlock.armor_class,
    hit_points: statBlock.hit_points,
    speed: statBlock.speed,
    str: statBlock.str, dex: statBlock.dex, con: statBlock.con,
    int: statBlock.int, wis: statBlock.wis, cha: statBlock.cha,
    challenge_rating: statBlock.challenge_rating,
    ...(statBlock.proficiency_bonus ? { proficiency_bonus: statBlock.proficiency_bonus } : {}),
    ...(statBlock.saving_throws ? { saving_throws: statBlock.saving_throws } : {}),
    ...(statBlock.skills && Object.keys(statBlock.skills).length ? { skills: statBlock.skills } : {}),
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
  // Material edit detection (#606): only the fields a DM (or the AI generator)
  // actually writes narrative/mechanical content into — tags, portraits, location
  // and the monster link are excluded per the "moves/tags/image" carve-outs.
  const contentChanged = !!props.npc && (
    form.name !== props.npc.name ||
    form.race !== props.npc.race ||
    form.alignment !== props.npc.alignment ||
    form.age !== props.npc.age ||
    form.occupation !== props.npc.occupation ||
    form.status !== props.npc.status ||
    form.relationship !== props.npc.relationship ||
    form.disguise_name !== props.npc.disguise_name ||
    !deepEqual(form.appearance, props.npc.appearance) ||
    !deepEqual(form.personality, props.npc.personality) ||
    !deepEqual(form.backstory, props.npc.backstory) ||
    !deepEqual(form.notes, props.npc.notes) ||
    !deepEqual(buildStatBlock(), props.npc.stat_block)
  );
  if (contentChanged) form.ai_provenance = markEdited(form.ai_provenance);

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

    let savedNpcId = props.npc?.id ?? null;
    if (props.npc?.id) {
      // Exclude campaign_id: it must not be overwritten on update (could be null
      // if activeCampaignId hasn't loaded yet, severing the campaign link).
      const { campaign_id: _cid, ...updatePayload } = payload;
      await updateNpc({ id: props.npc.id, update: updatePayload })
    } else {
      const created = await createNpc(payload)
      savedNpcId = created.id;
      // Stay on the detail page after create so faction/relation links can be added immediately
      router.push(`/npcs/${created.id}`)
    }

    if (becameVisible && ui.dmMode === 'play') {
      // The announced name is the projection's, not the draft's: an NPC saved
      // with an unrevealed alter ego is announced under its cover, and one
      // whose "Name" field the DM left unticked is announced under none. The
      // old wording used `form.name` and posted the true name in both cases.
      const announced = getNpcPlayerFacingName({
        ...form,
        name: form.name.trim() || null,
      }) ?? NPC_UNNAMED_IN_PROSE
      // Fire-and-forget — chat failure must not block the save navigation.
      void sendNarrativeEvent(`You encounter ${announced}.`, savedNpcId ?? undefined)
    }

    // Back to the list, which is the confirmation that the save landed. On
    // tablet and up the NPC's own path *is* the list — the grid with this
    // sheet open over it — so it doubles as a look at what was just saved.
    // A phone has no such layer: `/npcs/:id` there is a full-screen takeover,
    // which would be staying on the detail page, so it gets the plain list.
    if (props.npc?.id) router.push(isMobile.value ? '/npcs' : `/npcs/${props.npc.id}`)
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

// Mobile-only cancel: return to the read view for an existing NPC, or the list
// for a brand-new one (desktop uses the PageHeader View/Edit toggle instead).
function onMobileCancel() {
  if (props.npc?.id) router.push(`/npcs/${props.npc.id}`)
  else router.push('/npcs')
}

defineExpose({
  isSaving,
  isSendingToScriptorium,
  aiApiKey,
  isAiEnabled,
  showGenerateDialog,
  form,
  sendToScriptorium,
  confirmDelete,
})
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.speed-input { -moz-appearance: textfield; }
.speed-input::-webkit-outer-spin-button,
.speed-input::-webkit-inner-spin-button { appearance: none; }
</style>

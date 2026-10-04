<template>
  <DraftConflictNotice :fields="conflictLabels" :on-discard="reset" />

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
    @copy-to-campaign="openCopy"
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
        <p class="text-label font-semibold text-muted-foreground mb-2">PARTY NOTES</p>
        <PlayerNotesWidget entity-type="npc" :entity-id="npc.id" placeholder="Notes visible to the whole party…" />
      </div>
      <div>
        <p class="text-label font-semibold text-muted-foreground mb-2">PC CONNECTION NOTES</p>
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
        :cutout-url="form.cutout_url"
        :disguise-portrait-url="form.disguise_portrait_url"
        :disguise-portrait-focal-point="form.disguise_portrait_focal_point"
        :relationship="form.relationship"
        :status="form.status"
        :tags="form.tags"
        :ai-context="aiContext"
        @update:art-tab="artTab = $event"
        @update:portrait-url="form.portrait_url = $event"
        @update:portrait-focal-point="form.portrait_focal_point = $event"
        @update:cutout-url="form.cutout_url = $event"
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
                  <option value="">Custom / blank</option>
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
              <p class="text-heading-sm font-bold text-foreground">Stat Block</p>
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
    :visible="showGenerateDialog"
    @close="showGenerateDialog = false"
    @generated="onAiGenerated"
  />

  <PaywallModal v-model="showPaywall" resource="npcs" />
  <PaywallModal v-model="showScriptoriumPaywall" resource="scriptorium_documents" />
  <PaywallModal v-model="showMonsterPaywall" resource="monsters" />

  <CopyToCampaignDialog
    v-if="props.npc"
    :open="copyOpen"
    table="npcs"
    :ids="copyIds"
    label="NPC"
    @close="copyOpen = false"
    @copied="onCopied"
    @quota-exceeded="onQuotaExceeded"
  />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useIsMobile } from '@/composables/useBreakpoint'
import NpcGenerateDialog from '@/ai/NpcGenerateDialog.vue'
import { toTiptapJson } from '@/ai/useNpcGeneration'
import { markEdited } from '@/ai/provenance'
import { deepEqual } from '@/lib/utils'
import { useRecordDraft, cloneDraftValue } from '@/composables/useRecordDraft'
import DraftConflictNotice from '@/components/common/DraftConflictNotice.vue'
import type { NpcAiGenerated } from '@/ai/types'
import { useCreateNpc, useUpdateNpc, useDeleteNpc } from '@/composables/npcs/useNpcs'
import { useCampaignMessages } from '@/composables/campaign/useCampaignMessages'
import { useChatSendFailure } from '@/composables/campaign/chatSendErrors'
import { useUiStore } from '@/stores/ui'
import { useLocationTree } from '@/composables/locations/useLocations'
import { useCreateMonster } from '@/composables/monsters/useMonsters'
import { useMonsterIndex } from '@/composables/monsters/useMonsterIndex'
import { useMonstersByIds } from '@/composables/monsters/useMonstersByIds'
import { useCreateScriptoriumDocument } from '@/composables/scriptorium/useScriptorium'
import { formatNpcForScriptorium } from '@/lib/scriptorium/scriptoriumImport'
import { buildEntityEmbedDocumentContent } from '@/lib/scriptorium/entityEmbeds'
import { NPC_TEMPLATES, NPC_TEMPLATE_CATEGORIES, getNpcTemplate } from '@/data/npcTemplates'
import NpcRelationsSection from '@/components/npcs/NpcRelationsSection.vue'
import NpcPcNotesSection from '@/components/npcs/NpcPcNotesSection.vue'
import NpcInventorySection from '@/components/npcs/NpcInventorySection.vue'
import NpcLoreTab from '@/components/npcs/NpcLoreTab.vue'
import NpcIdentitySection from '@/components/npcs/NpcIdentitySection.vue'
import NpcSidebar from '@/components/npcs/NpcSidebar.vue'
import type { NpcArtTab } from '@/components/npcs/npcArtTabs'
import { buildEntityContext, toPlainText } from '@/ai/utils'
import NpcEditMobile from '@/components/npcs/NpcEditMobile.vue'
import type { Npc, NpcInsert, StatBlock } from '@/types/npc.types'
import type { Monster } from '@/types/monster.types'
import { useCampaignStore } from '@/stores/campaign'
import EntityCombobox from '@/components/common/EntityCombobox.vue'
import PlayerNotesWidget from '@/components/common/PlayerNotesWidget.vue'
import PaywallModal from '@/components/common/PaywallModal.vue'
import CopyToCampaignDialog from '@/components/common/CopyToCampaignDialog.vue'
import { useCopyEntityToCampaign } from '@/composables/campaign/useCopyEntityToCampaign'
import { isQuotaExceeded } from '@/lib/quotaError'
import { getNpcDisplayName, getNpcPlayerFacingName, NPC_UNNAMED_IN_PROSE } from '@/lib/npcDisplay'
import TabBar from '@/components/common/TabBar.vue'
import StatBlockEditor from '@/components/common/StatBlockEditor.vue'

const { confirm, notify } = useConfirm();
const showPaywall = ref(false);
const showScriptoriumPaywall = ref(false);
const showMonsterPaywall = ref(false);

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
const isMobile = useIsMobile()

// ── Store + mutations ─────────────────────────────────────────────────────────

const router = useRouter()
const { locationOptions } = useLocationTree()
const { data: allMonsters } = useMonsterIndex()
// A pick needs the full stat block, which the picker's slim index lacks: the
// picked id is read as a row and applied once it arrives.
const pickedMonsterId = ref<string | null>(null)
const { data: pickedMonsters } = useMonstersByIds(() => [pickedMonsterId.value])
const { mutateAsync: createNpc, isPending: isCreating } = useCreateNpc()
const { mutateAsync: updateNpc, isPending: isUpdating } = useUpdateNpc()
const { mutateAsync: deleteNpc } = useDeleteNpc()
const { mutateAsync: createMonster } = useCreateMonster()
const ui = useUiStore()
const { sendNarrativeEvent } = useCampaignMessages()
const { reportChatFailure } = useChatSendFailure()
const isPromoting = ref(false)
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument()
const campaign = useCampaignStore()
const isSaving = computed(() => isCreating.value || isUpdating.value)
const isSendingToScriptorium = ref(false)

// ── UI state ──────────────────────────────────────────────────────────────────

const activeTab = ref<TabKey>('lore')
const showGenerateDialog = ref(false)
const artTab = ref<NpcArtTab>(
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
    // The document is a live link, not a one-time HTML snapshot (#915 story 3):
    // its content is a heading + entityEmbed node, so editing the NPC later
    // updates the book. The generated document travels with the NPC's own
    // campaign scope (#915 story 1).
    const doc = await createScriptoriumDoc({
      ...importData,
      content: buildEntityEmbedDocumentContent('npc', props.npc.id),
      campaign_id: props.npc.campaign_id,
    })
    await updateNpc({ id: props.npc.id, update: { scriptorium_doc_id: doc.id } })
    router.push(`/scriptorium/${doc.id}`)
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showScriptoriumPaywall.value = true; return }
    notify('Failed to send to Scriptorium. Please try again.')
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
      cutout_url: props.npc.cutout_url,
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
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showMonsterPaywall.value = true; return }
    notify('Failed to promote to monster. Please try again.')
  } finally {
    isPromoting.value = false
  }
}

function onMonsterLinked(monsterId: string | null) {
  if (!monsterId) { pickedMonsterId.value = null; form.linked_monster_id = null; return }
  pickedMonsterId.value = monsterId
}

watch([pickedMonsterId, pickedMonsters], ([id, rows]) => {
  if (!id) return
  const m = rows.get(id)
  if (!m) return
  pickedMonsterId.value = null
  applyMonster(m)
})

function applyMonster(m: Monster) {
  const monsterId = m.id
  // SRD monsters don't have UUID rows — import their data as a template but don't link
  form.linked_monster_id = m.is_shared ? null : monsterId

  if (!form.name)        form.name = m.name
  if (!form.alignment)   form.alignment = m.alignment ?? null
  if (!form.tags.length) form.tags = [...m.tags]

  if (!form.portrait_url && m.image_url) {
    form.portrait_url = m.image_url
    form.portrait_focal_point = m.portrait_focal_point ?? null
  }
  // The cutout fills its own gap: only when the NPC has none and the monster
  // brings one, so linking never wipes a cutout the DM already set (#917).
  if (!form.cutout_url && m.cutout_url) form.cutout_url = m.cutout_url

  const msb = m.stat_block
  hasStatBlock.value = true
  Object.assign(statBlock.value, {
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

// The stat block and its "include" toggle live in the draft beside the NPC's
// own columns, so the row builder below is a pure function of the draft and
// useRecordDraft can tell which columns the DM actually touched (#946).
type NpcDraft = NpcInsert & { statBlock: StatBlock; hasStatBlock: boolean }

function toStatBlockDraft(sb: StatBlock | null | undefined): StatBlock {
  return {
    armor_class: sb?.armor_class ?? 10,
    hit_points: sb?.hit_points ?? '4 (1d8)',
    speed: sb?.speed ?? '30 ft.',
    str: sb?.str ?? 10,
    dex: sb?.dex ?? 10,
    con: sb?.con ?? 10,
    int: sb?.int ?? 10,
    wis: sb?.wis ?? 10,
    cha: sb?.cha ?? 10,
    challenge_rating: sb?.challenge_rating ?? '0',
    proficiency_bonus: sb?.proficiency_bonus,
    saving_throws: cloneDraftValue(sb?.saving_throws),
    skills: sb?.skills ? { ...sb.skills } : undefined,
    damage_vulnerabilities: sb?.damage_vulnerabilities,
    damage_resistances: sb?.damage_resistances,
    damage_immunities: sb?.damage_immunities,
    condition_immunities: sb?.condition_immunities,
    senses: sb?.senses,
    languages: sb?.languages,
    special_abilities: sb?.special_abilities ? [...sb.special_abilities] : [],
    actions: sb?.actions ? [...sb.actions] : [],
    bonus_actions: sb?.bonus_actions ? [...sb.bonus_actions] : [],
    reactions: sb?.reactions ? [...sb.reactions] : [],
    legendary_actions: sb?.legendary_actions ? [...sb.legendary_actions] : [],
    lair_actions: sb?.lair_actions ? [...sb.lair_actions] : [],
    spellcasting: cloneDraftValue(sb?.spellcasting),
  }
}

function toNpcDraft(npc: Npc | null): NpcDraft {
  return {
    name: npc?.name ?? '',
    race: npc?.race ?? null,
    alignment: npc?.alignment ?? null,
    age: npc?.age ?? null,
    occupation: npc?.occupation ?? null,
    location_id: npc?.location_id ?? null,
    appearance: cloneDraftValue(npc?.appearance ?? null),
    personality: cloneDraftValue(npc?.personality ?? null),
    backstory: cloneDraftValue(npc?.backstory ?? null),
    notes: cloneDraftValue(npc?.notes ?? null),
    status: npc?.status ?? 'alive',
    relationship: npc?.relationship ?? 'unknown',
    portrait_url: npc?.portrait_url ?? null,
    cutout_url: npc?.cutout_url ?? null,
    disguise_name: npc?.disguise_name ?? null,
    disguise_portrait_url: npc?.disguise_portrait_url ?? null,
    disguise_portrait_focal_point: cloneDraftValue(npc?.disguise_portrait_focal_point ?? null),
    is_revealed: npc?.is_revealed ?? false,
    tags: [...(npc?.tags ?? [])],
    // Never edited directly: save() builds stat_block from statBlock/hasStatBlock.
    stat_block: null,
    linked_monster_id: npc?.linked_monster_id ?? null,
    scriptorium_doc_id: npc?.scriptorium_doc_id ?? null,
    campaign_id: campaign.activeCampaignId,
    portrait_focal_point: cloneDraftValue(npc?.portrait_focal_point ?? null),
    player_visible_fields: [...(npc?.player_visible_fields ?? [])],
    player_visible_to: [...(npc?.player_visible_to ?? [])],
    ai_provenance: cloneDraftValue(npc?.ai_provenance ?? null),
    statBlock: toStatBlockDraft(npc?.stat_block),
    hasStatBlock: !!npc?.stat_block,
  }
}

// The draft merges fresh server data into fields the DM has not touched, so a
// stale cached NPC (or a reveal saved from the list popover) cannot be written
// back over a newer one. Sharing edits made elsewhere arrive here the same way.
const { draft: form, changes, commit, reset, conflicts } = useRecordDraft({
  source: () => props.npc,
  identity: (npc: Npc) => npc.id,
  toDraft: toNpcDraft,
})

const CONFLICT_LABELS: Partial<Record<keyof NpcDraft, string>> = {
  name: 'Name', race: 'Race', alignment: 'Alignment', age: 'Age', occupation: 'Occupation',
  location_id: 'Location', appearance: 'Appearance', personality: 'Personality',
  backstory: 'Backstory', notes: 'Notes', status: 'Status', relationship: 'Relationship',
  portrait_url: 'Portrait', cutout_url: 'Cutout', disguise_name: 'Alter ego name',
  disguise_portrait_url: 'Alter ego portrait', tags: 'Tags', linked_monster_id: 'Linked monster',
  player_visible_to: 'Revealed to', player_visible_fields: 'Revealed fields',
  statBlock: 'Stat block', hasStatBlock: 'Stat block',
}
const conflictLabels = computed(() => [
  ...new Set(conflicts.value.map((key) => CONFLICT_LABELS[key]).filter((l): l is string => !!l)),
])

// Writable views onto the draft for the stat block, which the stat block
// editor and the mobile layer take as their own props. Computed, not a captured
// reference: a merge can replace draft.statBlock whole.
const statBlock = computed(() => form.statBlock)
const hasStatBlock = computed({
  get: () => form.hasStatBlock,
  set: (value: boolean) => { form.hasStatBlock = value },
})

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    [form.race, form.occupation].filter(Boolean).join(', '),
    toPlainText(form.appearance),
    toPlainText(form.personality),
  ]),
)

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
  Object.assign(statBlock.value, {
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

function buildStatBlock(d: NpcDraft): StatBlock | null {
  if (!d.hasStatBlock) return null
  const sb = d.statBlock
  return {
    armor_class: sb.armor_class,
    hit_points: sb.hit_points,
    speed: sb.speed,
    str: sb.str, dex: sb.dex, con: sb.con,
    int: sb.int, wis: sb.wis, cha: sb.cha,
    challenge_rating: sb.challenge_rating,
    ...(sb.proficiency_bonus ? { proficiency_bonus: sb.proficiency_bonus } : {}),
    ...(sb.saving_throws ? { saving_throws: sb.saving_throws } : {}),
    ...(sb.skills && Object.keys(sb.skills).length ? { skills: sb.skills } : {}),
    ...(sb.damage_vulnerabilities ? { damage_vulnerabilities: sb.damage_vulnerabilities } : {}),
    ...(sb.damage_resistances ? { damage_resistances: sb.damage_resistances } : {}),
    ...(sb.damage_immunities ? { damage_immunities: sb.damage_immunities } : {}),
    ...(sb.condition_immunities ? { condition_immunities: sb.condition_immunities } : {}),
    ...(sb.senses ? { senses: sb.senses } : {}),
    ...(sb.languages ? { languages: sb.languages } : {}),
    ...(sb.special_abilities?.length ? { special_abilities: sb.special_abilities } : {}),
    ...(sb.actions?.length ? { actions: sb.actions } : {}),
    ...(sb.bonus_actions?.length ? { bonus_actions: sb.bonus_actions } : {}),
    ...(sb.reactions?.length ? { reactions: sb.reactions } : {}),
    ...(sb.legendary_actions?.length ? { legendary_actions: sb.legendary_actions } : {}),
    ...(sb.lair_actions?.length ? { lair_actions: sb.lair_actions } : {}),
    ...(sb.spellcasting?.entries?.length ? { spellcasting: sb.spellcasting } : {}),
  }
}

// The NPC row for a draft. Pure: useRecordDraft runs it over the draft and over
// the server copy to find the columns the DM changed.
function buildPayload(d: NpcDraft): NpcInsert {
  const { statBlock: _sb, hasStatBlock: _has, ...columns } = d
  return {
    ...columns,
    race: d.race || null,
    alignment: d.alignment || null,
    age: d.age || null,
    occupation: d.occupation || null,
    location_id: d.location_id || null,
    appearance: d.appearance || null,
    personality: d.personality || null,
    backstory: d.backstory || null,
    notes: d.notes || null,
    // A cleared image comes back from the image block as "", which is not a
    // picture; store it as none.
    portrait_url: d.portrait_url || null,
    cutout_url: d.cutout_url || null,
    disguise_portrait_url: d.disguise_portrait_url || null,
    stat_block: buildStatBlock(d),
    player_visible_to: d.player_visible_to,
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
    !deepEqual(buildStatBlock(form), props.npc.stat_block)
  );
  if (contentChanged) form.ai_provenance = markEdited(form.ai_provenance);

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
      // Only the columns the DM changed. Exclude campaign_id: it must not be
      // overwritten on update (could be null if activeCampaignId hasn't loaded
      // yet, severing the campaign link).
      const { campaign_id: _cid, ...updatePayload } = changes(buildPayload)
      if (Object.keys(updatePayload).length > 0) {
        await updateNpc({ id: props.npc.id, update: updatePayload })
      }
      commit()
    } else {
      const created = await createNpc(buildPayload(form))
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
      sendNarrativeEvent(`You encounter ${announced}.`, savedNpcId ?? undefined).catch((e) => reportChatFailure(e, 'announce the encounter in the chat'))
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

// ── Copy to campaign (#885) ─────────────────────────────────────────────────
// npcs carries the enforce_quota trigger, so a rejected insert reopens the
// same showPaywall this file already mounts for its own create flow (matches
// MonsterDetail.vue's reuse of one showPaywall ref for both purposes).
const { copyOpen, copyIds, openCopy, onCopied, onQuotaExceeded } = useCopyEntityToCampaign({
  entity: () => props.npc,
  noun: 'NPC',
  onQuotaExceeded: () => {
    showPaywall.value = true
  },
})

defineExpose({
  isSaving,
  isSendingToScriptorium,
  aiApiKey,
  isAiEnabled,
  showGenerateDialog,
  form,
  sendToScriptorium,
  confirmDelete,
  openCopy,
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

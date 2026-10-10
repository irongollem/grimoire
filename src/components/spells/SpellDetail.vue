<template>
  <!-- ── Advisor Modal (new spells wizard) ──────────────────────────────────── -->
  <SpellLevelAdvisorModal
    :open="advisorModalOpen"
    :adv="adv"
    :school="school"
    :adv-result="advResult"
    :school-tip="schoolTip"
    :ref-spells="refSpells"
    @skip="skipAdvisorModal"
    @apply="applyAdvisorFromModal"
    @update:school="school = $event as SpellSchool"
  />

  <div class="flex flex-col gap-6">
    <!-- ── Header actions ─────────────────────────────────────────────────── -->
    <SpellDetailHeader
      :has-spell="!!spell"
      :is-shared="isShared"
      :is-ai-enabled="isAiEnabled"
      :is-saving="isSaving"
      :is-deleting="isDeleting"
      :is-sending-to-scriptorium="isSendingToScriptorium"
      :can-save="!!name.trim()"
      @generate="showGenerateDialog = true"
      @send-to-scriptorium="sendToScriptorium"
      @copy-to-campaign="openCopy"
      @delete="confirmDelete"
      @save="save"
      @cancel="cancel"
    />

    <p v-if="saveError" class="text-destructive text-body">{{ saveError }}</p>
    <DraftConflictNotice v-if="!isShared" :fields="conflictLabels" :on-discard="reset" />

    <div class="grid grid-cols-1 xl:grid-cols-[13.75rem_1fr_16.25rem] gap-6">
      <!-- ── Portrait + Source ─────────────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        <EntityImageBlock
          bucket="spell-images"
          :folder-prefix="artFolderPrefix"
          :model-value="imageUrl || null"
          show-focal-point
          :focal-point="imageFocalPoint"
          ai-kind="spell"
          :ai-target-id="props.spell?.id"
          :ai-context="aiContext"
          @update:model-value="onImageUrlUpdate($event)"
          @update:focal-point="onImageFocalUpdate($event)"
        />
        <div class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">Source</span>
          <div
            v-if="props.spell?.open5e_import"
            class="bg-muted/30 border border-border rounded-md px-3 py-2 text-body text-muted-foreground italic"
          >
            <a
              v-if="props.spell.source_url"
              :href="props.spell.source_url"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground hover:underline transition-colors"
            >{{ spellSourceLabel(source, props.spell.source_title) }}</a>
            <span v-else>{{ spellSourceLabel(source, props.spell.source_title) }}</span>
          </div>
          <AppInput
            v-else
            v-model="source"
            placeholder="e.g. Homebrew, PHB, XGtE…"
            tone="card"
            size="body"
          />
        </div>

        <!-- Scope -->
        <CampaignScopeField v-if="!isShared" v-model="campaignId" />
      </div>

      <!-- ── Core spell fields ──────────────────────────────────────────── -->
      <div v-if="!isShared" class="flex flex-col gap-4">
        <!-- Name -->
        <label>
          <span class="sr-only">Spell name</span>
          <AppInput
            v-model="name"
            placeholder="Spell name…"
            tone="card"
            size="heading"
          />
        </label>

        <!-- Level + School row -->
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-label-lg text-muted-foreground uppercase">Level</span>
            <AppSelect v-model.number="level" size="lg">
              <option :value="0">Cantrip (0)</option>
              <option v-for="n in 9" :key="n" :value="n">{{ spellLevelLabel(n) }}</option>
            </AppSelect>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-label-lg text-muted-foreground uppercase">School</span>
            <AppSelect v-model="school" size="lg" class="capitalize">
              <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
            </AppSelect>
          </label>
        </div>

        <!-- Casting Time, Range, Duration, Concentration, Ritual -->
        <SpellTimingSection
          :casting-time="castingTime"
          :casting-time-custom="castingTimeCustom"
          :range="range"
          :range-custom="rangeCustom"
          :duration="duration"
          :duration-custom="durationCustom"
          :concentration="concentration"
          :ritual="ritual"
          @update:casting-time="castingTime = $event"
          @update:casting-time-custom="castingTimeCustom = $event"
          @update:range="range = $event"
          @update:range-custom="rangeCustom = $event"
          @update:duration="duration = $event"
          @update:duration-custom="durationCustom = $event"
          @update:concentration="concentration = $event"
          @update:ritual="ritual = $event"
        />

        <!-- Components -->
        <SpellComponentsSection
          :components="components"
          :material="material"
          @update:components="components = $event"
          @update:material="material = $event"
        />

        <!-- Mechanics -->
        <SpellMechanicsSection
          :attack-type="attackType"
          :save-attribute="saveAttribute"
          :save-effect="saveEffect"
          :damage-rolls="damageRolls"
          :healing-dice="healingDice"
          :target-description="targetDescription"
          :aoe-shape="aoeShape"
          :aoe-size="aoeSize"
          :condition-inflicted="conditionInflicted"
          :school="school"
          @update:attack-type="attackType = $event"
          @update:save-attribute="saveAttribute = $event"
          @update:save-effect="saveEffect = $event"
          @update:damage-rolls="damageRolls = $event"
          @update:healing-dice="healingDice = $event"
          @update:target-description="targetDescription = $event"
          @update:aoe-shape="aoeShape = $event"
          @update:aoe-size="aoeSize = $event"
          @update:condition-inflicted="conditionInflicted = $event"
        />

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">Description</span>
          <RichTextEditor
            v-model="description"
            placeholder="Describe the spell's effects…"
            size="md"
          />
        </div>

        <!-- At Higher Levels -->
        <div class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">At Higher Levels <span class="normal-case font-fell font-normal text-muted-foreground">(optional)</span></span>
          <textarea
            v-model="higherLevels"
            rows="2"
            placeholder="e.g. When cast using a 3rd-level slot or higher, the damage increases by 1d6 for each slot level above 2nd. Or: you can target one additional creature for each slot level above 1st…"
            class="bg-card border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>

        <!-- Tags -->
        <div class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">Tags</span>
          <TagInput v-model="tags" />
        </div>
      </div>

      <!-- ── Right: Classes + Advisor ────────────────────────────────────── -->
      <div v-if="!isShared" class="flex flex-col gap-4">
        <!-- Class list -->
        <SpellClassesSection
          :classes="classes"
          @update:classes="classes = $event"
        />

        <!-- Spell Level Advisor -->
        <SpellLevelAdvisorPanel
          :open="advisorOpen"
          :highlighted="advisorPanelHighlighted"
          :is-new="isNew"
          :adv="adv"
          :adv-result="advResult"
          :school-tip="schoolTip"
          :ref-spells="refSpells"
          :show-table="showTable"
          @toggle="advisorOpen = !advisorOpen"
          @apply="applyAdvisor"
          @toggle-table="showTable = !showTable"
        />
      </div>
    </div>
  </div>

  <!-- AI generation dialog -->
  <SpellGenerateDialog
    :visible="showGenerateDialog && isAiEnabled"
    @close="showGenerateDialog = false"
    @generated="onAiGenerated"
  />

  <!-- Copy to campaign (#598) -->
  <CopyToCampaignDialog
    v-if="props.spell"
    :open="copyOpen"
    table="spells"
    :ids="copyIds"
    label="spell"
    @close="copyOpen = false"
    @copied="onCopied"
  />

  <PaywallModal v-model="showScriptoriumPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { useToast } from "@/composables/useToast";
import { isQuotaExceeded } from "@/lib/quotaError";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { ref, computed, reactive, watch, toRefs } from "vue";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { useRouter } from "vue-router";
import { useIsMobile } from "@/composables/useBreakpoint";
import SpellGenerateDialog from "@/ai/SpellGenerateDialog.vue";
import SpellLevelAdvisorModal from "./SpellLevelAdvisorModal.vue";
import SpellLevelAdvisorPanel from "./SpellLevelAdvisorPanel.vue";
import SpellComponentsSection from "./SpellComponentsSection.vue";
import SpellMechanicsSection from "./SpellMechanicsSection.vue";
import SpellClassesSection from "./SpellClassesSection.vue";
import SpellTimingSection from "./SpellTimingSection.vue";
import SpellDetailHeader from "./SpellDetailHeader.vue";
import { spellInsertFromAi } from "@/ai/spellAiAdapter";
import type { SpellAiGenerated } from "@/ai/types";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
import { useRecordDraft, cloneDraftValue } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import { useCampaignStore } from "@/stores/campaign";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import CopyToCampaignDialog from "@/components/common/overlays/CopyToCampaignDialog.vue";
import EntityImageBlock from "@/components/common/entity/EntityImageBlock.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import TagInput from "@/components/common/controls/TagInput.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useCopyEntityToCampaign } from "@/composables/campaign/useCopyEntityToCampaign";
import { SPELL_SCHOOLS, spellLevelLabel, spellSourceLabel } from "@/types/spell.types";
import type { Spell, SpellSchool } from "@/types/spell.types";
import { useCreateSpell, useUpdateSpell, useDeleteSpell } from "@/composables/spells/useSpells";
import { useUpsertLibrarySpellArt } from "@/composables/library/useLibrarySpellArt";
import { useCreateScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { formatSpellForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import { buildEntityEmbedDocumentContent } from "@/lib/scriptorium/entityEmbeds";
import {
  adviseLevelRange,
  REFERENCE_SPELLS,
  SCHOOL_DESIGN_TIPS,
} from "@/lib/spells/spellAdvisor";
import type {
  EffectType,
  EffectIntensity,
  TargetingMode,
  SaveType,
  DurationTier,
} from "@/lib/spells/spellAdvisor";
import { parseDamageExpression, type DamageRoll } from "@/lib/dice/dice";

const props = defineProps<{ spell: Spell | null; isShared?: boolean }>();
const router = useRouter();
const isMobile = useIsMobile();

const campaignStore = useCampaignStore();
const { activeCampaignId } = storeToRefs(campaignStore);
const { mutateAsync: upsertLibraryArt } = useUpsertLibrarySpellArt();
const isShared = computed(() => !!props.isShared);
// An admin's edit to a shared library row is the canonical art, and canonical art
// lives under srd/, never a user folder (CLAUDE.md storage convention, #952).
const auth = useAuthStore();
const artFolderPrefix = computed(() => (isShared.value && auth.isAppAdmin ? "srd" : undefined));

// ── Copy to campaign (#598) ──────────────────────────────────────────────────
const { copyOpen, copyIds, openCopy, onCopied } = useCopyEntityToCampaign({
  entity: () => props.spell,
  noun: "spell",
});

// Scope: null = every campaign, set = exclusive to that campaign. Editing an
// existing spell keeps its stored scope, including a stored null — which
// `spell ? spell.campaign_id : …` preserves. Chaining `??`
// instead (`spell?.campaign_id ?? activeCampaignId.value`) would be
// wrong: an existing global spell's campaign_id is legitimately null, and
// `??` can't distinguish that from "no spell yet", so it would silently
// re-scope the spell into whichever campaign happens to be active next time
// someone opens and saves it — and most spells are global today (#596). A
// new spell (no spell) defaults to the active campaign instead of
// "every campaign" by accident — global is still available via
// CampaignScopeField, just no longer the silent default. No active campaign
// is a genuine "nothing to scope to yet" case.
//
// Every editable field lives in one draft, so the row builder below is a pure
// function of it and useRecordDraft sends only what this edit changed (#946).
function toDraft(spell: Spell | null) {
  return {
    name: spell?.name ?? "",
    level: spell?.level ?? 1,
    school: (spell?.school ?? "evocation") as SpellSchool,
    castingTime: spell?.casting_time ?? "Action",
    castingTimeCustom: spell?.casting_time_custom ?? "",
    range: spell?.range ?? "60 ft.",
    rangeCustom: spell?.range_custom ?? "",
    duration: spell?.duration ?? "Instantaneous",
    durationCustom: spell?.duration_custom ?? "",
    concentration: spell?.concentration ?? false,
    ritual: spell?.ritual ?? false,
    components: [...(spell?.components ?? [])] as string[],
    material: spell?.material ?? "",
    description: spell?.description ?? "",
    higherLevels: spell?.higher_levels ?? "",
    classes: [...(spell?.classes ?? [])] as string[],
    source: spell?.source ?? "",
    imageUrl: spell?.image_url ?? "",
    imageFocalPoint: spell?.image_focal_point ?? null,
    aiProvenance: (spell?.ai_provenance ?? null) as AiProvenance | null,
    tags: [...(spell?.tags ?? [])],
    campaignId: (spell ? spell.campaign_id : activeCampaignId.value ?? null) as string | null,
    attackType: spell?.attack_type ?? "",
    saveAttribute: spell?.save_attribute ?? "",
    saveEffect: spell?.save_effect ?? "",
    damageRolls: cloneDraftValue(spell?.damage_rolls ?? []) as DamageRoll[],
    healingDice: spell?.healing_dice ?? "",
    targetDescription: spell?.target_description ?? "",
    aoeShape: spell?.aoe_shape ?? "",
    aoeSize: spell?.aoe_size ?? "",
    conditionInflicted: spell?.condition_inflicted ?? "",
  };
}
type SpellDraft = ReturnType<typeof toDraft>;

// A shared library spell's art arrives after mount through the prop; the draft
// merges it in for every field the user has not touched (art edits on a shared
// spell go to the art table, never into the draft).
const { draft, conflicts, changes, commit, reset } = useRecordDraft({
  source: () => props.spell,
  identity: (spell) => spell.id,
  toDraft,
});
const {
  name, level, school, castingTime, castingTimeCustom, range, rangeCustom,
  duration, durationCustom, concentration, ritual, components, material,
  description, higherLevels, classes, source, imageUrl, imageFocalPoint,
  aiProvenance, tags, campaignId, attackType, saveAttribute, saveEffect,
  damageRolls, healingDice, targetDescription, aoeShape, aoeSize,
  conditionInflicted,
} = toRefs(draft);

const CONFLICT_LABELS: Record<keyof SpellDraft, string> = {
  name: "Name",
  level: "Level",
  school: "School",
  castingTime: "Casting Time",
  castingTimeCustom: "Casting Time",
  range: "Range",
  rangeCustom: "Range",
  duration: "Duration",
  durationCustom: "Duration",
  concentration: "Concentration",
  ritual: "Ritual",
  components: "Components",
  material: "Material",
  description: "Description",
  higherLevels: "At Higher Levels",
  classes: "Classes",
  source: "Source",
  imageUrl: "Image",
  imageFocalPoint: "Image focus",
  aiProvenance: "AI provenance",
  tags: "Tags",
  campaignId: "Campaign",
  attackType: "Attack type",
  saveAttribute: "Save",
  saveEffect: "Save",
  damageRolls: "Damage",
  healingDice: "Healing",
  targetDescription: "Target",
  aoeShape: "Area",
  aoeSize: "Area",
  conditionInflicted: "Condition",
};
const conflictLabels = computed(() => [...new Set(conflicts.value.map((k) => CONFLICT_LABELS[k]))]);

const aiContext = computed(() =>
  buildEntityContext([
    name.value,
    `${level.value === 0 ? "cantrip" : `level ${level.value}`} ${school.value} spell`,
    toPlainText(description.value),
  ]),
);

function onImageUrlUpdate(url: string | null) {
  if (isShared.value) upsertLibraryArt({ entry_id: props.spell!.id, image_url: url });
  else imageUrl.value = url ?? "";
}
function onImageFocalUpdate(pt: { x: number; y: number } | null) {
  if (isShared.value) upsertLibraryArt({ entry_id: props.spell!.id, portrait_focal_point: pt });
  else imageFocalPoint.value = pt;
}

// ── Advisor state ─────────────────────────────────────────────────────────────
const isNew = !props.spell;
const advisorModalOpen = ref(isNew); // modal wizard for new spells
const advisorOpen = ref(false); // sidebar panel (collapsed by default)
const advisorPanelHighlighted = ref(false);
const showTable = ref(false);

const adv = reactive({
  effectType: "damage" as EffectType,
  effectIntensity: "moderate" as EffectIntensity,
  damageDice: "",
  targetingMode: "single" as TargetingMode,
  saveType: "save_for_half" as SaveType,
  durationTier: "instantaneous" as DurationTier,
  requiresConcentration: false,
  hasSecondaryEffect: false,
  isRitual: false,
});

const schoolTip = computed(() => SCHOOL_DESIGN_TIPS[school.value] ?? null);
const refSpells = computed(() => {
  const level =
    advResult.value.suggestedMin +
    Math.floor((advResult.value.suggestedMax - advResult.value.suggestedMin) / 2);
  return REFERENCE_SPELLS[Math.max(0, Math.min(9, level))] ?? null;
});

const advResult = computed(() => adviseLevelRange(adv));

function applyAdvisor() {
  if (!advResult.value) return;

  // Level
  const mid =
    advResult.value.suggestedMin +
    Math.floor((advResult.value.suggestedMax - advResult.value.suggestedMin) / 2);
  level.value = Math.max(0, Math.min(9, mid));

  // Dice → mechanics fields
  if (adv.effectType === "damage") {
    if (adv.damageDice) damageRolls.value = parseDamageExpression(adv.damageDice);
    healingDice.value = "";
  } else if (adv.effectType === "healing") {
    healingDice.value = adv.damageDice;
    damageRolls.value = [];
  } else {
    damageRolls.value = [];
    healingDice.value = "";
  }

  // Targeting → AoE shape + size hints (only for AoE modes)
  if (adv.targetingMode === "aoe_small") {
    if (!aoeShape.value) aoeShape.value = "cone";
  } else if (adv.targetingMode === "aoe_medium") {
    if (!aoeShape.value) aoeShape.value = "sphere";
    if (!aoeSize.value) aoeSize.value = "20-foot radius";
  } else if (adv.targetingMode === "aoe_large") {
    if (!aoeShape.value) aoeShape.value = "sphere";
    if (!aoeSize.value) aoeSize.value = "30-foot radius";
  } else {
    // Non-AoE targeting — clear AoE fields
    aoeShape.value = "";
    aoeSize.value = "";
  }

  // IconSave/attack type
  if (adv.saveType === "automatic") {
    attackType.value = "automatic";
    saveAttribute.value = "";
    saveEffect.value = "";
  } else if (adv.saveType === "attack_roll") {
    attackType.value = "ranged_spell";
    saveAttribute.value = "";
    saveEffect.value = "";
  } else if (adv.saveType === "save_negates") {
    attackType.value = "save";
    saveEffect.value = "negates";
  } else if (adv.saveType === "save_for_half") {
    attackType.value = "save";
    saveEffect.value = "half";
  }

  // Concentration + ritual
  concentration.value = adv.requiresConcentration;
  ritual.value = adv.isRitual;
}

function skipAdvisorModal() {
  advisorModalOpen.value = false;
}

function applyAdvisorFromModal() {
  applyAdvisor();
  advisorModalOpen.value = false;
  // Briefly highlight the sidebar panel so the user knows where the advisor went
  setTimeout(() => {
    advisorPanelHighlighted.value = true;
    setTimeout(() => {
      advisorPanelHighlighted.value = false;
    }, 1200);
  }, 250);
}

// Sync concentration checkbox → advisor
watch(concentration, (val) => {
  adv.requiresConcentration = val;
});
watch(ritual, (val) => {
  adv.isRitual = val;
});

// Pre-fill advisor from mechanics fields when it opens
watch(advisorOpen, (open) => {
  if (!open) return;
  if (damageRolls.value.length) {
    adv.effectType = "damage";
    adv.damageDice = damageRolls.value
      .map((r) => (r.type ? `${r.dice} ${r.type}` : r.dice))
      .join(" + ");
  }
  if (healingDice.value) {
    adv.effectType = "healing";
    adv.damageDice = healingDice.value;
  }
  if (aoeShape.value) {
    adv.targetingMode =
      aoeSize.value && parseInt(aoeSize.value) >= 30
        ? "aoe_large"
        : aoeSize.value && parseInt(aoeSize.value) >= 15
          ? "aoe_medium"
          : "aoe_small";
  }
  if (attackType.value === "automatic") adv.saveType = "automatic";
  else if (attackType.value === "ranged_spell" || attackType.value === "melee_spell")
    adv.saveType = "attack_roll";
  else if (attackType.value === "save") {
    adv.saveType = saveEffect.value === "negates" ? "save_negates" : "save_for_half";
  }
});

// ── Save / Delete ─────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateSpell();
const { mutateAsync: update } = useUpdateSpell();
const { mutateAsync: deleteSpell } = useDeleteSpell();
const isSaving = ref(false);
const isDeleting = ref(false);
const saveError = ref("");

function buildPayload(d: SpellDraft) {
  return {
    name: d.name.trim(),
    level: d.level,
    school: d.school,
    casting_time: d.castingTime,
    casting_time_custom:
      d.castingTime === "Special" || d.castingTime === "Reaction"
        ? d.castingTimeCustom || null
        : null,
    range: d.range,
    range_custom: d.range === "Special" ? d.rangeCustom || null : null,
    duration: d.duration,
    duration_custom: d.duration === "Special" ? d.durationCustom || null : null,
    concentration: d.concentration,
    ritual: d.ritual,
    components: d.components,
    material: d.components.includes("M") ? d.material || null : null,
    description: d.description,
    higher_levels: d.higherLevels || null,
    classes: d.classes,
    tags: d.tags,
    campaign_id: d.campaignId,
    source: d.source || null,
    image_url: d.imageUrl || null,
    image_focal_point: d.imageFocalPoint,
    attack_type: d.attackType || null,
    save_attribute: d.attackType === "save" ? d.saveAttribute || null : null,
    save_effect: d.attackType === "save" ? d.saveEffect || null : null,
    damage_rolls: d.damageRolls.length ? d.damageRolls : null,
    healing_dice: d.healingDice || null,
    target_description: d.targetDescription || null,
    aoe_shape: d.aoeShape || null,
    aoe_size: d.aoeSize || null,
    condition_inflicted: d.conditionInflicted || null,
    ai_provenance: d.aiProvenance,
  };
}

async function save() {
  if (!name.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    if (props.spell) {
      // Material edit detection (#606): tags, image art and the campaign-only
      // scope toggle are excluded per the "moves/tags/image" carve-outs.
      const contentChanged =
        name.value !== props.spell.name ||
        level.value !== props.spell.level ||
        school.value !== props.spell.school ||
        castingTime.value !== props.spell.casting_time ||
        castingTimeCustom.value !== (props.spell.casting_time_custom ?? "") ||
        range.value !== props.spell.range ||
        rangeCustom.value !== (props.spell.range_custom ?? "") ||
        duration.value !== props.spell.duration ||
        durationCustom.value !== (props.spell.duration_custom ?? "") ||
        concentration.value !== props.spell.concentration ||
        ritual.value !== props.spell.ritual ||
        !deepEqual(components.value, props.spell.components) ||
        material.value !== (props.spell.material ?? "") ||
        !deepEqual(description.value, props.spell.description) ||
        higherLevels.value !== (props.spell.higher_levels ?? "") ||
        !deepEqual(classes.value, props.spell.classes) ||
        source.value !== (props.spell.source ?? "") ||
        attackType.value !== (props.spell.attack_type ?? "") ||
        saveAttribute.value !== (props.spell.save_attribute ?? "") ||
        saveEffect.value !== (props.spell.save_effect ?? "") ||
        !deepEqual(damageRolls.value, props.spell.damage_rolls ?? []) ||
        healingDice.value !== (props.spell.healing_dice ?? "") ||
        targetDescription.value !== (props.spell.target_description ?? "") ||
        aoeShape.value !== (props.spell.aoe_shape ?? "") ||
        aoeSize.value !== (props.spell.aoe_size ?? "") ||
        conditionInflicted.value !== (props.spell.condition_inflicted ?? "");
      if (contentChanged) aiProvenance.value = markEdited(aiProvenance.value);
      // Only the columns this edit changed, so a stale cached copy cannot write
      // untouched fields back at old values (#946).
      const changed = changes(buildPayload);
      if (Object.keys(changed).length > 0) {
        await update({ id: props.spell.id, update: changed });
        commit();
      }
      // Desktop lands on the sheet over the spellbook (a child route of the
      // list, so it is landing on the list); a phone has no modal, so it goes
      // to the plain list.
      router.push(isMobile.value ? "/spells" : `/spells/${props.spell.id}`);
    } else {
      // Import provenance and scaling come only from an import; a hand-made spell
      // starts without them, and the builder stays pure over the draft.
      const created = await create({
        ...buildPayload(draft),
        source_title: null,
        source_url: null,
        open5e_import: false,
        higher_level_damage: null,
        higher_level_healing: null,
      });
      router.push(`/spells/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    isSaving.value = false;
  }
}

/** Leave the editor unsaved: back to the sheet for an existing spell, else the list. */
function cancel() {
  if (props.spell) router.replace(`/spells/${props.spell.id}`);
  else router.push("/spells");
}

async function confirmDelete() {
  if (!props.spell || !confirm(`Delete "${props.spell.name}"? This cannot be undone.`)) return;
  isDeleting.value = true;
  try {
    router.push("/spells");
    await deleteSpell(props.spell);
  } finally {
    isDeleting.value = false;
  }
}

// ── AI generation ─────────────────────────────────────────────────────────────
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const showGenerateDialog = ref(false);

function onAiGenerated(result: SpellAiGenerated) {
  showGenerateDialog.value = false;
  // Reuse the adapter so dialog-fill matches what the side-panel "Generate
  // and create" path produces — single source of truth for AI → Spell mapping.
  const ins = spellInsertFromAi(result);
  name.value = ins.name;
  level.value = ins.level;
  school.value = ins.school;
  castingTime.value = ins.casting_time;
  castingTimeCustom.value = ins.casting_time_custom ?? "";
  range.value = ins.range;
  rangeCustom.value = ins.range_custom ?? "";
  duration.value = ins.duration;
  durationCustom.value = ins.duration_custom ?? "";
  concentration.value = ins.concentration;
  ritual.value = ins.ritual;
  components.value = [...ins.components];
  material.value = ins.material ?? "";
  description.value = ins.description;
  higherLevels.value = ins.higher_levels ?? "";
  classes.value = [...ins.classes];
  source.value = ins.source ?? "";
  tags.value = [...ins.tags];
  attackType.value = ins.attack_type ?? "";
  saveAttribute.value = ins.save_attribute ?? "";
  saveEffect.value = ins.save_effect ?? "";
  damageRolls.value = ins.damage_rolls ?? [];
  healingDice.value = ins.healing_dice ?? "";
  targetDescription.value = ins.target_description ?? "";
  aoeShape.value = ins.aoe_shape ?? "";
  aoeSize.value = ins.aoe_size ?? "";
  conditionInflicted.value = ins.condition_inflicted ?? "";
  if (ins.image_url) {
    imageUrl.value = ins.image_url;
    imageFocalPoint.value = null;
  }
  aiProvenance.value = ins.ai_provenance ?? null;
  // Skip the level advisor wizard when AI populated us — DM can re-open it.
  advisorModalOpen.value = false;
}

// ── Send to Scriptorium ───────────────────────────────────────────────────────
const { mutateAsync: createDoc } = useCreateScriptoriumDocument();
const isSendingToScriptorium = ref(false);
const showScriptoriumPaywall = ref(false);
const toast = useToast();

async function sendToScriptorium() {
  if (!props.spell) return;
  isSendingToScriptorium.value = true;
  try {
    const data = formatSpellForScriptorium(props.spell);
    // Live link, not a one-time snapshot (#915 story 3). The generated
    // document travels with the spell's own campaign scope (#915 story 1).
    const doc = await createDoc({
      ...data,
      content: buildEntityEmbedDocumentContent("spell", props.spell.id),
      campaign_id: props.spell.campaign_id,
    });
    router.push(`/scriptorium/${doc.id}`);
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showScriptoriumPaywall.value = true; return; }
    toast.error(toast.fromError(e));
  } finally {
    isSendingToScriptorium.value = false;
  }
}
</script>

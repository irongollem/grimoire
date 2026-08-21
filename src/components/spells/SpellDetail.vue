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
      @delete="confirmDelete"
      @save="save"
    />

    <p v-if="saveError" class="text-destructive text-body">{{ saveError }}</p>

    <div class="grid grid-cols-1 xl:grid-cols-[13.75rem_1fr_16.25rem] gap-6">
      <!-- ── Portrait + Source ─────────────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        <EntityImageBlock
          bucket="spell-images"
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

        <!-- Campaign-only flag -->
        <div
          v-if="!isShared && campaignStore.activeCampaignId"
          class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1"
        >
          <AppCheckbox
            :model-value="campaignId === campaignStore.activeCampaignId"
            label="Campaign-only"
            @update:model-value="toggleCampaignSpecific"
          />
          <p class="text-caption text-muted-foreground italic">
            Restrict this spell to <strong>{{ campaignStore.activeCampaign?.name }}</strong>.
            It won't appear in other campaigns.
          </p>
        </div>
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
              <option v-for="n in 9" :key="n" :value="n">{{ n }}{{ levelSuffix(n) }}-Level</option>
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
    v-if="showGenerateDialog && isAiEnabled"
    @close="showGenerateDialog = false"
    @generated="onAiGenerated"
  />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, reactive, watch } from "vue";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { useRouter } from "vue-router";
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
import { useCampaignStore } from "@/stores/campaign";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { SPELL_SCHOOLS, spellSourceLabel } from "@/types/spell.types";
import type { Spell, SpellSchool } from "@/types/spell.types";
import { useCreateSpell, useUpdateSpell, useDeleteSpell } from "@/composables/useSpells";
import { useUpsertLibrarySpellArt } from "@/composables/useLibrarySpellArt";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatSpellForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import {
  adviseLevelRange,
  REFERENCE_SPELLS,
  SCHOOL_DESIGN_TIPS,
} from "@/lib/spellAdvisor";
import type {
  EffectType,
  EffectIntensity,
  TargetingMode,
  SaveType,
  DurationTier,
} from "@/lib/spellAdvisor";
import { parseDamageExpression, type DamageRoll } from "@/lib/dice/dice";

const props = defineProps<{ spell: Spell | null; isShared?: boolean }>();
const router = useRouter();

const { mutateAsync: upsertLibraryArt } = useUpsertLibrarySpellArt();
const isShared = computed(() => !!props.isShared);

// ── Core fields ───────────────────────────────────────────────────────────────
const name = ref(props.spell?.name ?? "");
const level = ref(props.spell?.level ?? 1);
const school = ref<SpellSchool>(props.spell?.school ?? "evocation");
const castingTime = ref(props.spell?.casting_time ?? "Action");
const castingTimeCustom = ref(props.spell?.casting_time_custom ?? "");
const range = ref(props.spell?.range ?? "60 ft.");
const rangeCustom = ref(props.spell?.range_custom ?? "");
const duration = ref(props.spell?.duration ?? "Instantaneous");
const durationCustom = ref(props.spell?.duration_custom ?? "");
const concentration = ref(props.spell?.concentration ?? false);
const ritual = ref(props.spell?.ritual ?? false);
const components = ref<string[]>(props.spell?.components ?? []);
const material = ref(props.spell?.material ?? "");
const description = ref(props.spell?.description ?? "");
const higherLevels = ref(props.spell?.higher_levels ?? "");
const classes = ref<string[]>(props.spell?.classes ?? []);
const source = ref(props.spell?.source ?? "");
const imageUrl = ref(props.spell?.image_url ?? "");
const imageFocalPoint = ref(props.spell?.image_focal_point ?? null);
const aiProvenance = ref<AiProvenance | null>(props.spell?.ai_provenance ?? null);

const aiContext = computed(() =>
  buildEntityContext([
    name.value,
    `${level.value === 0 ? "cantrip" : `level ${level.value}`} ${school.value} spell`,
    toPlainText(description.value),
  ]),
);
const tags = ref<string[]>(props.spell?.tags ?? []);
// Campaign-only flag: null = universal/library spell, set = exclusive to that campaign.
const campaignId = ref<string | null>(props.spell?.campaign_id ?? null);

// When SRD art loads asynchronously, sync art fields from the updated prop
watch(
  () => props.spell,
  (s) => {
    if (isShared.value && s) {
      imageUrl.value = s.image_url ?? "";
      imageFocalPoint.value = s.image_focal_point ?? null;
    }
  },
);

function onImageUrlUpdate(url: string | null) {
  if (isShared.value) upsertLibraryArt({ entry_id: props.spell!.id, image_url: url });
  else imageUrl.value = url ?? "";
}
function onImageFocalUpdate(pt: { x: number; y: number } | null) {
  if (isShared.value) upsertLibraryArt({ entry_id: props.spell!.id, portrait_focal_point: pt });
  else imageFocalPoint.value = pt;
}

// ── Mechanics ─────────────────────────────────────────────────────────────────
const attackType = ref(props.spell?.attack_type ?? "");
const saveAttribute = ref(props.spell?.save_attribute ?? "");
const saveEffect = ref(props.spell?.save_effect ?? "");
const damageRolls = ref<DamageRoll[]>(props.spell?.damage_rolls ?? []);
const healingDice = ref(props.spell?.healing_dice ?? "");
const targetDescription = ref(props.spell?.target_description ?? "");
const aoeShape = ref(props.spell?.aoe_shape ?? "");
const aoeSize = ref(props.spell?.aoe_size ?? "");
const conditionInflicted = ref(props.spell?.condition_inflicted ?? "");
function levelSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
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

function buildPayload() {
  return {
    name: name.value.trim(),
    level: level.value,
    school: school.value,
    casting_time: castingTime.value,
    casting_time_custom:
      castingTime.value === "Special" || castingTime.value === "Reaction"
        ? castingTimeCustom.value || null
        : null,
    range: range.value,
    range_custom: range.value === "Special" ? rangeCustom.value || null : null,
    duration: duration.value,
    duration_custom: duration.value === "Special" ? durationCustom.value || null : null,
    concentration: concentration.value,
    ritual: ritual.value,
    components: components.value,
    material: components.value.includes("M") ? material.value || null : null,
    description: description.value,
    higher_levels: higherLevels.value || null,
    classes: classes.value,
    tags: tags.value,
    campaign_id: campaignId.value,
    source: source.value || null,
    source_title: props.spell?.source_title ?? null,
    source_url: props.spell?.source_url ?? null,
    open5e_import: props.spell?.open5e_import ?? false,
    image_url: imageUrl.value || null,
    image_focal_point: imageFocalPoint.value,
    attack_type: attackType.value || null,
    save_attribute: attackType.value === "save" ? saveAttribute.value || null : null,
    save_effect: attackType.value === "save" ? saveEffect.value || null : null,
    damage_rolls: damageRolls.value.length ? damageRolls.value : null,
    healing_dice: healingDice.value || null,
    target_description: targetDescription.value || null,
    aoe_shape: aoeShape.value || null,
    aoe_size: aoeSize.value || null,
    condition_inflicted: conditionInflicted.value || null,
    higher_level_damage: props.spell?.higher_level_damage ?? null,
    higher_level_healing: props.spell?.higher_level_healing ?? null,
    ai_provenance: aiProvenance.value,
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
      await update({ id: props.spell.id, update: buildPayload() });
      router.push("/spells");
    } else {
      const created = await create(buildPayload());
      router.replace(`/spells/${created.id}?edit=true`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    isSaving.value = false;
  }
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
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);

function toggleCampaignSpecific() {
  const id = campaignStore.activeCampaignId;
  if (!id) return;
  campaignId.value = campaignId.value === id ? null : id;
}
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

async function sendToScriptorium() {
  if (!props.spell) return;
  isSendingToScriptorium.value = true;
  try {
    const data = formatSpellForScriptorium(props.spell);
    const doc = await createDoc(data);
    router.push(`/scriptorium/${doc.id}`);
  } finally {
    isSendingToScriptorium.value = false;
  }
}
</script>

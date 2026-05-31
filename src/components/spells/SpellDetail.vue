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

  <!-- Mobile edit layer (<md): app bar + stacked section cards + save bar.
       Renders only on mobile; desktop uses the multi-column form below,
       byte-identical to before. SpellDetail's own refs stay the single source
       of truth — this layer mutates them via props-down / emit-up. -->
  <SpellEditMobile
    v-if="isMobile"
    :name="name"
    :level="level"
    :school="school"
    :casting-time="castingTime"
    :casting-time-custom="castingTimeCustom"
    :range="range"
    :range-custom="rangeCustom"
    :duration="duration"
    :duration-custom="durationCustom"
    :concentration="concentration"
    :ritual="ritual"
    :components="components"
    :material="material"
    :description="description"
    :higher-levels="higherLevels"
    :classes="classes"
    :tags="tags"
    :is-srd="isSrd"
    :is-new="isNew"
    :is-saving="isSaving"
    :is-deleting="isDeleting"
    :is-sending-to-scriptorium="isSendingToScriptorium"
    :is-ai-enabled="isAiEnabled"
    :can-save="!!name.trim()"
    @save="save"
    @cancel="onCancel"
    @delete="confirmDelete"
    @generate="showGenerateDialog = true"
    @scriptorium="sendToScriptorium"
    @update:name="name = $event"
    @update:level="level = $event"
    @update:school="school = $event"
    @update:casting-time="castingTime = $event"
    @update:casting-time-custom="castingTimeCustom = $event"
    @update:range="range = $event"
    @update:range-custom="rangeCustom = $event"
    @update:duration="duration = $event"
    @update:duration-custom="durationCustom = $event"
    @update:concentration="concentration = $event"
    @update:ritual="ritual = $event"
    @update:components="components = $event"
    @update:material="material = $event"
    @update:description="description = $event"
    @update:higher-levels="higherLevels = $event"
    @update:classes="classes = $event"
    @update:tags="tags = $event"
  />

  <div v-else class="flex flex-col gap-6">
    <!-- ── Header actions ─────────────────────────────────────────────────── -->
    <SpellDetailHeader
      :has-spell="!!spell"
      :is-srd="isSrd"
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

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <div class="grid grid-cols-1 xl:grid-cols-[220px_1fr_260px] gap-6">
      <!-- ── Portrait + Source ─────────────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        <EntityImageBlock
          bucket="spell-images"
          :model-value="imageUrl || null"
          show-focal-point
          :focal-point="imageFocalPoint"
          @update:model-value="onImageUrlUpdate($event)"
          @update:focal-point="onImageFocalUpdate($event)"
        />
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Source</span>
          <div
            v-if="props.spell?.open5e_import"
            class="bg-muted/30 border border-border rounded-md px-3 py-2 font-fell text-sm text-muted-foreground italic"
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
          <input
            v-else
            v-model="source"
            placeholder="e.g. Homebrew, PHB, XGtE…"
            class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Campaign-only flag -->
        <div
          v-if="!isSrd && campaignStore.activeCampaignId"
          class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1"
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              :checked="campaignId === campaignStore.activeCampaignId"
              class="rounded"
              @change="toggleCampaignSpecific"
            />
            <span class="font-fell text-sm text-foreground">Campaign-only</span>
          </label>
          <p class="font-fell text-xs text-muted-foreground italic">
            Restrict this spell to <strong>{{ campaignStore.activeCampaign?.name }}</strong>.
            It won't appear in other campaigns.
          </p>
        </div>
      </div>

      <!-- ── Core spell fields ──────────────────────────────────────────── -->
      <div v-if="!isSrd" class="flex flex-col gap-4">
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
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Description</span>
          <RichTextEditor
            v-model="description"
            placeholder="Describe the spell's effects…"
            min-height="200px"
          />
        </div>

        <!-- At Higher Levels -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">At Higher Levels <span class="normal-case font-fell font-normal text-muted-foreground">(optional)</span></span>
          <textarea
            v-model="higherLevels"
            rows="2"
            placeholder="e.g. When cast using a 3rd-level slot or higher, the damage increases by 1d6 for each slot level above 2nd. Or: you can target one additional creature for each slot level above 1st…"
            class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>

        <!-- Tags -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Tags</span>
          <TagInput v-model="tags" />
        </div>
      </div>

      <!-- ── Right: Classes + Advisor ────────────────────────────────────── -->
      <div v-if="!isSrd" class="flex flex-col gap-4">
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
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import SpellGenerateDialog from "@/ai/SpellGenerateDialog.vue";
import SpellLevelAdvisorModal from "./SpellLevelAdvisorModal.vue";
import SpellLevelAdvisorPanel from "./SpellLevelAdvisorPanel.vue";
import SpellComponentsSection from "./SpellComponentsSection.vue";
import SpellMechanicsSection from "./SpellMechanicsSection.vue";
import SpellClassesSection from "./SpellClassesSection.vue";
import SpellTimingSection from "./SpellTimingSection.vue";
import SpellDetailHeader from "./SpellDetailHeader.vue";
import SpellEditMobile from "./SpellEditMobile.vue";
import { spellInsertFromAi } from "@/ai/spellAiAdapter";
import type { SpellAiGenerated } from "@/ai/types";
import { useCampaignStore } from "@/stores/campaign";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import { SPELL_SCHOOLS, spellSourceLabel } from "@/types/spell.types";
import type { Spell, SpellSchool } from "@/types/spell.types";
import { useCreateSpell, useUpdateSpell, useDeleteSpell } from "@/composables/useSpells";
import { useUpsertSrdSpellArt } from "@/composables/useSrdSpellArt";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatSpellForScriptorium } from "@/lib/scriptoriumImport";
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
import { parseDamageExpression, type DamageRoll } from "@/lib/dice";

const props = defineProps<{ spell: Spell | null; isSrd?: boolean }>();
const router = useRouter();

const { mutateAsync: upsertSrdArt } = useUpsertSrdSpellArt();
const isSrd = computed(() => !!props.isSrd);

// Mobile edit layer (<md) — desktop keeps the multi-column form, byte-identical.
const isMobile = useMediaQuery("(max-width: 767px)");

// Cancel from the mobile edit bar: back to the spell's read view, or to the
// list for a new spell. (Desktop uses the View toggle in SpellDetailView.)
function onCancel() {
  if (props.spell) router.replace(`/spells/${props.spell.id}`);
  else router.push("/spells");
}

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
const tags = ref<string[]>(props.spell?.tags ?? []);
// Campaign-only flag: null = universal/library spell, set = exclusive to that campaign.
const campaignId = ref<string | null>(props.spell?.campaign_id ?? null);

// When SRD art loads asynchronously, sync art fields from the updated prop
watch(
  () => props.spell,
  (s) => {
    if (isSrd.value && s) {
      imageUrl.value = s.image_url ?? "";
      imageFocalPoint.value = s.image_focal_point ?? null;
    }
  },
);

function onImageUrlUpdate(url: string | null) {
  if (isSrd.value) upsertSrdArt({ srd_id: props.spell!.id, image_url: url });
  else imageUrl.value = url ?? "";
}
function onImageFocalUpdate(pt: { x: number; y: number } | null) {
  if (isSrd.value) upsertSrdArt({ srd_id: props.spell!.id, portrait_focal_point: pt });
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

// ── IconSave / Delete ─────────────────────────────────────────────────────────────
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
  };
}

async function save() {
  if (!name.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    if (props.spell) {
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

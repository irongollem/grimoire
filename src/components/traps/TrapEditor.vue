<template>
  <div>
    <!-- Action bar -->
    <div class="flex flex-wrap items-center justify-end gap-2 mb-4">
      <AppButton
        v-if="!isNew"
        variant="destructive"
        size="md"
        label="Delete"
        :icon="IconDelete"
        @click="deleteTrap"
      />
      <AppButton
        v-if="!isNew"
        variant="subtle"
        size="md"
        label="Cancel"
        @click="onCancel"
      />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconSave"
        :disabled="saving || !form.name.trim()"
        :label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
        @click="save"
      />
    </div>

    <div class="flex flex-col gap-4 max-w-2xl">
      <!-- Image + Identity -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Identity</span>
        </div>
        <div class="p-4 flex gap-4">
          <div class="shrink-0 w-28">
            <ImageUpload
              :model-value="form.image_url"
              :focal-point="form.image_focal_point"
              aspect="square"
              show-focal-point
              bucket="trap-images"
              @update:model-value="form.image_url = $event"
              @update:focal-point="form.image_focal_point = $event"
            />
          </div>
          <div class="flex-1 grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Name</label>
              <AppInput v-model="form.name" size="lg" placeholder="Trap name…" class="font-bold" />
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Type</label>
              <AppSelect v-model="form.trap_type" size="body" block>
                <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
              </AppSelect>
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">CR</label>
              <div class="flex items-center gap-2">
                <AppSelect v-model="form.cr" size="body" class="flex-1 min-w-0">
                  <option :value="null">—</option>
                  <option v-for="cr in CR_LIST" :key="cr" :value="cr">{{ cr }}</option>
                </AppSelect>
                <span v-if="crXp" class="text-label text-muted-foreground whitespace-nowrap">{{ crXp }} XP</span>
                <AppButton
                  variant="link"
                  size="inline-xs"
                  :icon="IconGenerate"
                  label="Suggest"
                  tooltip="Open CR advisor"
                  class="shrink-0 whitespace-nowrap"
                  @click="showAdvisor = true"
                />
              </div>
            </div>
            <div class="col-span-2">
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Tags</label>
              <TagInput v-model="form.tags" />
            </div>
            <div class="col-span-2">
              <CampaignScopeField v-model="form.campaign_id" />
            </div>
          </div>
        </div>
      </div>

      <!-- Mechanics -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Mechanics</span>
        </div>
        <div class="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Trigger</label>
            <AppSelect v-model="form.trigger_type" size="body" block>
              <option :value="null">—</option>
              <option v-for="t in TRAP_TRIGGERS" :key="t" :value="t">{{ t }}</option>
            </AppSelect>
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Detection DC</label>
            <AppInput v-model.number="form.detection_dc" type="number" size="body" min="1" max="30" placeholder="15" />
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Disarm DC</label>
            <AppInput v-model.number="form.disarm_dc" type="number" size="body" min="1" max="30" placeholder="15" />
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Reset</label>
            <AppSelect v-model="form.reset_type" size="body" block>
              <option v-for="r in TRAP_RESET_TYPES" :key="r" :value="r">{{ r }}</option>
            </AppSelect>
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Trap HP</label>
            <AppInput v-model.number="form.trap_hp" type="number" size="body" min="1" placeholder="—" />
          </div>
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Trap AC</label>
            <AppInput v-model.number="form.trap_ac" type="number" size="body" min="1" max="30" placeholder="—" />
          </div>
          <div class="col-span-2 sm:col-span-3">
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Damage Immunities</label>
            <TagInput v-model="form.damage_immunities" :suggestions="[...DAMAGE_TYPES]" placeholder="Add immunity…" />
          </div>
        </div>
      </div>

      <!-- Effect -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Effect</span>
        </div>
        <div class="p-4 space-y-3">
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Effect Description</label>
            <AppInput
              v-model="form.effect_description"
              size="body"
              placeholder="The trap fires a poisoned dart at the nearest creature…"
            />
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Attack Bonus</label>
              <AppInput v-model.number="form.attack_bonus" type="number" size="body" placeholder="+5" />
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Save Type</label>
              <AppSelect v-model="form.save_type" size="body" block>
                <option :value="null">—</option>
                <option v-for="s in TRAP_SAVE_TYPES" :key="s" :value="s">{{ s }}</option>
              </AppSelect>
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Save DC</label>
              <AppInput v-model.number="form.save_dc" type="number" size="body" min="1" max="30" placeholder="15" />
            </div>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-label-lg font-semibold text-muted-foreground">Damage</label>
              <AppButton variant="link" size="inline-xs" label="+ Add" @click="addDamageEntry" />
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="(entry, i) in form.damage_entries" :key="i" class="flex items-center gap-2">
                <DiceExprInput v-model="entry.dice" placeholder="1d6" compact class="w-28 shrink-0" />
                <AppSelect v-model="entry.type" size="body" class="flex-1 min-w-0 capitalize">
                  <option value="">—</option>
                  <option v-for="d in DAMAGE_TYPES" :key="d" :value="d" class="capitalize">{{ d }}</option>
                </AppSelect>
                <AppButton
                  variant="ghost"
                  size="icon-xs"
                  class="shrink-0 hover:text-destructive"
                  :icon="IconClose"
                  @click="form.damage_entries.splice(i, 1)"
                />
              </div>
              <p v-if="!form.damage_entries.length" class="text-caption text-muted-foreground italic">No damage — add a component above.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
        </div>
        <div class="p-3">
          <RichTextEditor v-model="form.description" placeholder="Flavor text, lore, appearance…" min-height="120px" />
        </div>
      </div>

      <!-- DM Notes -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">DM Notes</span>
        </div>
        <div class="p-3">
          <RichTextEditor v-model="form.notes" placeholder="Private notes, encounter ideas, variants…" min-height="100px" />
        </div>
      </div>
    </div>

    <!-- CR Advisor Modal -->
    <Teleport to="body">
      <div
        v-if="showAdvisor"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click.self="showAdvisor = false"
        @keydown.escape="showAdvisor = false"
      >
        <div class="w-full max-w-lg bg-card border border-border rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider">CR Advisor</h2>
            <AppButton variant="ghost" size="icon-sm" :icon="IconClose" tooltip="Close" aria-label="Close" @click="showAdvisor = false" />
          </div>
          <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-2">Primary Effect</label>
              <div class="grid grid-cols-5 gap-1.5">
                <AppButton
                  v-for="cat in EFFECT_CATEGORIES"
                  :key="cat.value"
                  variant="subtle"
                  size="xs"
                  :label="cat.label"
                  :active="advisorInputs.effectCategory === cat.value"
                  @click="advisorInputs.effectCategory = cat.value"
                />
              </div>
            </div>
            <div v-if="advisorInputs.effectCategory === 'damage'">
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Damage Dice</label>
              <DiceExprInput v-model="advisorInputs.damageDice" placeholder="2d10+3" />
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-2">Area of Effect</label>
              <div class="grid grid-cols-3 gap-1.5">
                <AppButton
                  v-for="opt in TARGETING_OPTIONS"
                  :key="opt.value"
                  variant="subtle"
                  size="xs"
                  :label="opt.label"
                  :active="advisorInputs.targeting === opt.value"
                  @click="advisorInputs.targeting = opt.value"
                />
              </div>
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-2">DC Difficulty (highest of detection / save)</label>
              <div class="grid grid-cols-4 gap-1.5">
                <AppButton
                  v-for="opt in DC_TIER_OPTIONS"
                  :key="opt.value"
                  variant="subtle"
                  size="xs"
                  :label="opt.label"
                  :active="advisorInputs.dcTier === opt.value"
                  @click="advisorInputs.dcTier = opt.value"
                />
              </div>
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-2">Secondary Effect</label>
              <div class="grid grid-cols-5 gap-1.5">
                <AppButton
                  v-for="opt in SECONDARY_OPTIONS"
                  :key="opt.value"
                  variant="subtle"
                  size="xs"
                  :label="opt.label"
                  :active="advisorInputs.secondaryEffect === opt.value"
                  @click="advisorInputs.secondaryEffect = opt.value"
                />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Reset</label>
                <AppSelect v-model="advisorInputs.resetType" size="body" block>
                  <option v-for="r in TRAP_RESET_TYPES" :key="r" :value="r">{{ r }}</option>
                </AppSelect>
              </div>
              <div class="flex items-end pb-1">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" v-model="advisorInputs.isInstantDeath" class="accent-primary" />
                  <span class="text-body text-foreground">Save-or-die mechanic</span>
                </label>
              </div>
            </div>
            <div v-if="advisorResult" class="rounded-lg border border-border bg-muted/20 p-4 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="text-label-lg font-semibold text-muted-foreground">SUGGESTED CR</span>
                <span class="text-title font-bold text-primary">{{ advisorResult.suggestedCr }}</span>
              </div>
              <div class="text-label text-muted-foreground">
                Range: CR {{ advisorResult.suggestedMin }} – {{ advisorResult.suggestedMax }}
                <span v-if="CR_XP[advisorResult.suggestedCr]" class="ml-2">({{ CR_XP[advisorResult.suggestedCr] }} XP)</span>
              </div>
              <ul class="flex flex-col gap-1">
                <li v-for="(factor, i) in advisorResult.factors" :key="i" class="text-caption text-muted-foreground flex items-start gap-1.5">
                  <span class="text-primary mt-0.5">·</span>{{ factor }}
                </li>
              </ul>
              <div class="border-t border-border pt-3">
                <div class="text-label text-muted-foreground mb-2">REFERENCE BENCHMARKS</div>
                <div class="flex flex-col gap-1">
                  <div
                    v-for="bench in CR_TRAP_BENCHMARKS.slice(0, 5)"
                    :key="bench.cr"
                    class="flex items-start gap-2 text-caption"
                    :class="bench.cr === advisorResult.suggestedCr ? 'text-primary font-semibold' : 'text-muted-foreground'"
                  >
                    <span class="font-cinzel shrink-0 w-6">{{ bench.cr }}</span>
                    <span class="shrink-0 w-28">{{ bench.label }}</span>
                    <span class="italic">{{ bench.examples }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <AppButton variant="ghost" size="md" label="Cancel" @click="showAdvisor = false" />
            <AppButton
              v-if="advisorResult"
              variant="primary"
              size="md"
              :icon="IconCheck"
              :label="`Use CR ${advisorResult.suggestedCr}`"
              @click="applyCr"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { IconCheck, IconClose, IconDelete, IconGenerate, IconSave } from '@/lib/icons';
import { useCreateTrap, useUpdateTrap, useDeleteTrap } from "@/composables/useTraps";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import {
  TRAP_TYPES,
  TRAP_TRIGGERS,
  TRAP_RESET_TYPES,
  TRAP_SAVE_TYPES,
  CR_LIST,
} from "@/types/trap.types";
import type { Trap, DamageEntry } from "@/types/trap.types";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
import { DAMAGE_TYPES } from "@/types/damage.types";
import { CR_XP } from "@/types/encounter.types";
import { adviseCr, CR_TRAP_BENCHMARKS } from "@/lib/trapAdvisor";
import type {
  TrapEffectCategory,
  TrapTargeting,
  TrapDcTier,
  TrapSecondaryEffect,
} from "@/lib/trapAdvisor";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagInput from "@/components/common/TagInput.vue";
import CampaignScopeField from "@/components/common/CampaignScopeField.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";

const props = defineProps<{ trap: Trap | null; isNew: boolean }>();

const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const { activeCampaignId } = storeToRefs(useCampaignStore());

const createMut = useCreateTrap();
const updateMut = useUpdateTrap();
const deleteMut = useDeleteTrap();
const saving = ref(false);

// ── Form state ─────────────────────────────────────────────────────────────

const blankForm = () => ({
  name: "",
  trap_type: "Mechanical" as const,
  cr: null as string | null,
  // New traps default to the active campaign; existing ones keep whatever
  // scope they already have (#597) — this only matters for the pre-load
  // (isNew) case, since the watch below overwrites it from `t.campaign_id`.
  campaign_id: (activeCampaignId.value ?? null) as string | null,
  trigger_type: null as string | null,
  detection_dc: null as number | null,
  disarm_dc: null as number | null,
  effect_description: null as string | null,
  attack_bonus: null as number | null,
  save_type: null as string | null,
  save_dc: null as number | null,
  damage_entries: [] as DamageEntry[],
  reset_type: "None" as const,
  trap_hp: null as number | null,
  trap_ac: null as number | null,
  damage_immunities: ["poison", "psychic"] as string[],
  image_url: null as string | null,
  image_focal_point: null as { x: number; y: number } | null,
  tags: [] as string[],
  description: null as string | null,
  notes: null as string | null,
  ai_provenance: null as AiProvenance | null,
});

const form = ref(blankForm());

watch(
  () => props.trap,
  (t) => {
    if (t)
      Object.assign(form.value, {
        name: t.name,
        trap_type: t.trap_type,
        cr: t.cr,
        campaign_id: t.campaign_id,
        trigger_type: t.trigger_type,
        detection_dc: t.detection_dc,
        disarm_dc: t.disarm_dc,
        effect_description: t.effect_description,
        attack_bonus: t.attack_bonus,
        save_type: t.save_type,
        save_dc: t.save_dc,
        damage_entries: t.damage_entries ? t.damage_entries.map((e) => ({ ...e })) : [],
        reset_type: t.reset_type,
        trap_hp: t.trap_hp,
        trap_ac: t.trap_ac,
        damage_immunities: [...(t.damage_immunities ?? ["poison", "psychic"])],
        image_url: t.image_url,
        image_focal_point: t.image_focal_point,
        tags: [...(t.tags ?? [])],
        description: t.description
          ? typeof t.description === "string" ? t.description : JSON.stringify(t.description)
          : null,
        notes: t.notes
          ? typeof t.notes === "string" ? t.notes : JSON.stringify(t.notes)
          : null,
        ai_provenance: t.ai_provenance ?? null,
      });
  },
  { immediate: true },
);

const crXp = computed(() => (form.value.cr ? CR_XP[form.value.cr] : null));

function addDamageEntry() {
  form.value.damage_entries.push({ dice: "", type: "" });
}

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    if (props.isNew) {
      await createMut.mutateAsync({ ...form.value } as Parameters<typeof createMut.mutateAsync>[0]);
    } else {
      // Material edit detection (#606): damage immunities (a tag-style
      // field), portrait art, tags and campaign scope are excluded per the
      // "moves/tags/image" carve-outs.
      const t = props.trap!;
      const contentChanged =
        form.value.name !== t.name ||
        form.value.trap_type !== t.trap_type ||
        form.value.cr !== t.cr ||
        form.value.trigger_type !== t.trigger_type ||
        form.value.detection_dc !== t.detection_dc ||
        form.value.disarm_dc !== t.disarm_dc ||
        form.value.effect_description !== t.effect_description ||
        form.value.attack_bonus !== t.attack_bonus ||
        form.value.save_type !== t.save_type ||
        form.value.save_dc !== t.save_dc ||
        !deepEqual(form.value.damage_entries, t.damage_entries) ||
        form.value.reset_type !== t.reset_type ||
        form.value.trap_hp !== t.trap_hp ||
        form.value.trap_ac !== t.trap_ac ||
        form.value.description !== t.description ||
        form.value.notes !== t.notes;
      if (contentChanged) form.value.ai_provenance = markEdited(form.value.ai_provenance);

      await updateMut.mutateAsync({ id: props.trap!.id, update: { ...form.value } as Parameters<typeof updateMut.mutateAsync>[0]["update"] });
    }
    router.push({ path: "/dungeon-craft", query: { tab: "traps" } });
  } finally {
    saving.value = false;
  }
}

async function deleteTrap() {
  const ok = await confirm(`Delete "${form.value.name}"? This cannot be undone.`, {
    title: "Delete Trap",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await deleteMut.mutateAsync(props.trap!);
  router.push({ path: "/dungeon-craft", query: { tab: "traps" } });
}

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}

// ── CR Advisor ─────────────────────────────────────────────────────────────

const showAdvisor = ref(false);

const EFFECT_CATEGORIES: { value: TrapEffectCategory; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "condition", label: "Condition" },
  { value: "terrain", label: "Terrain" },
  { value: "alarm", label: "Alarm" },
  { value: "death", label: "Death" },
];

const TARGETING_OPTIONS: { value: TrapTargeting; label: string }[] = [
  { value: "single", label: "Single target" },
  { value: "area_small", label: "Small area (≤3)" },
  { value: "area_large", label: "Large area (4+)" },
];

const DC_TIER_OPTIONS: { value: TrapDcTier; label: string }[] = [
  { value: "low", label: "Low (≤12)" },
  { value: "moderate", label: "Mod (13–16)" },
  { value: "high", label: "High (17–20)" },
  { value: "extreme", label: "Extreme (21+)" },
];

const SECONDARY_OPTIONS: { value: TrapSecondaryEffect; label: string }[] = [
  { value: "none", label: "None" },
  { value: "minor_condition", label: "Minor condition" },
  { value: "major_condition", label: "Major condition" },
  { value: "ongoing_damage", label: "Ongoing damage" },
  { value: "barrier", label: "Barrier / split" },
];

const advisorInputs = reactive({
  effectCategory: "damage" as TrapEffectCategory,
  damageDice: "",
  targeting: "single" as TrapTargeting,
  dcTier: "moderate" as TrapDcTier,
  resetType: "None" as "None" | "Manual" | "Automatic",
  secondaryEffect: "none" as TrapSecondaryEffect,
  isInstantDeath: false,
});

watch(showAdvisor, (open) => {
  if (!open) return;
  advisorInputs.damageDice = form.value.damage_entries.map((e) => e.dice).join("+") ?? "";
  advisorInputs.resetType = form.value.reset_type;
  const maxDc = Math.max(
    form.value.detection_dc ?? 0,
    form.value.disarm_dc ?? 0,
    form.value.save_dc ?? 0,
  );
  advisorInputs.dcTier =
    maxDc >= 21 ? "extreme" : maxDc >= 17 ? "high" : maxDc >= 13 ? "moderate" : "low";
});

const advisorResult = computed(() =>
  adviseCr({
    ...advisorInputs,
    trapHp: form.value.trap_hp,
    trapAc: form.value.trap_ac,
  }),
);

function applyCr() {
  if (!advisorResult.value) return;
  form.value.cr = advisorResult.value.suggestedCr;
  showAdvisor.value = false;
}
</script>

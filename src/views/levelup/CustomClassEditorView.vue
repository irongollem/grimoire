<template>
  <PageHeader
    :title="isNew ? 'New Class' : (form.class_name || 'Custom Class')"
    description="Design your custom class — features, proficiencies, and level progression"
  >
    <template v-if="isNew || isEditing" #actions>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
      <button
        type="button"
        :disabled="saving || !canSave"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <IconSave class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
    </template>

    <CustomClassSheet v-if="!isNew && !isEditing && existing" :cls="existing" />

    <div v-else class="max-w-2xl mx-auto space-y-6">
      <p v-if="saveError" class="font-fell text-sm text-destructive">{{ saveError }}</p>

      <!-- ── Section 1: Identity ────────────────────────────────────────────── -->
      <section class="rounded-lg border border-border bg-card p-4 space-y-4">
        <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Identity</h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1.5">HIT DIE</label>
            <select
              v-model.number="form.hit_die"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option :value="6">d6</option>
              <option :value="8">d8</option>
              <option :value="10">d10</option>
              <option :value="12">d12</option>
            </select>
          </div>

          <div>
            <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1.5">PRIMARY ABILITY</label>
            <input
              v-model="form.primary_ability"
              placeholder="e.g. Strength or Dexterity"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1.5">SUBCLASS-GRANTING LEVEL</label>
            <input
              v-model.number="form.subclass_level"
              type="number"
              min="1"
              max="20"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label class="block font-cinzel text-2xs tracking-wider text-muted-foreground mb-1.5">CAMPAIGN SCOPE</label>
            <select
              v-model="campaignScope"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All my campaigns</option>
              <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- ── Section 2: Proficiencies ───────────────────────────────────────── -->
      <CustomClassProficienciesPanel
        :saving-throws="form.saving_throws"
        :armor-proficiencies="form.armor_proficiencies"
        :weapon-proficiencies="form.weapon_proficiencies"
        @update:saving-throws="form.saving_throws = $event"
        @update:armor-proficiencies="form.armor_proficiencies = $event"
        @update:weapon-proficiencies="form.weapon_proficiencies = $event"
      />

      <!-- ── Section 3: Features per level ─────────────────────────────────── -->
      <CustomClassFeaturesPerLevel
        :features="form.features"
        :all-feature-options="allFeatureOptions"
        @update:features="form.features = $event"
      />

      <!-- ── Section 4: ASI levels ──────────────────────────────────────────── -->
      <section class="rounded-lg border border-border bg-card p-4 space-y-4">
        <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Ability Score Increase Levels</h2>
        <p class="font-fell text-sm text-muted-foreground">Levels at which this class gains an Ability Score Improvement.</p>

        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="lvl in form.asi_levels"
            :key="lvl"
            class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-cinzel text-xs text-primary"
          >
            {{ lvl }}
            <button
              type="button"
              class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none"
              @click="removeAsi(lvl)"
            >×</button>
          </span>
        </div>

        <div class="flex items-center gap-2">
          <select
            v-model="addAsiLevel"
            class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>Level…</option>
            <option v-for="n in 20" :key="n" :value="n" :disabled="form.asi_levels.includes(n)">{{ n }}</option>
          </select>
          <button
            type="button"
            :disabled="!addAsiLevel"
            class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
            @click="addAsi"
          >
            <IconAdd class="h-3 w-3" />
            Add Ability Score Increase level
          </button>
        </div>
      </section>

      <!-- ── Section 5: Spellcasting ─────────────────────────────────────────── -->
      <CustomClassSpellSlots
        :is-spellcaster="form.isSpellcaster"
        :spell-slots="form.spell_slots"
        :spells-known="form.spells_known"
        :cantrips-known="form.cantrips_known"
        :slot-recovery="form.slot_recovery"
        :caster-type="form.caster_type"
        :prepared-ability="form.prepared_ability"
        :prepared-divisor="form.prepared_divisor"
        @update:is-spellcaster="form.isSpellcaster = $event"
        @update:spell-slots="form.spell_slots = $event"
        @update:spells-known="form.spells_known = $event"
        @update:cantrips-known="form.cantrips_known = $event"
        @update:slot-recovery="form.slot_recovery = $event"
        @update:caster-type="form.caster_type = $event"
        @update:prepared-ability="form.prepared_ability = $event"
        @update:prepared-divisor="form.prepared_divisor = $event"
      />

      <!-- ── Section 6: Wizard steps ────────────────────────────────────────── -->
      <CustomClassStepsEditor
        :steps="form.steps"
        :all-feature-options="allFeatureOptions"
        @update:steps="form.steps = $event"
      />

      <!-- ── Section 7: Resource pools ─────────────────────────────────────── -->
      <CustomClassResources
        :resources="form.resources"
        @update:resources="form.resources = $event"
      />
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import { IconAdd, IconDelete, IconSave } from '@/lib/icons';
import { useCustomClass, useCreateCustomClass, useUpdateCustomClass, useDeleteCustomClass } from "@/composables/useCustomClasses";
import CustomClassSheet from "@/components/levelup/CustomClassSheet.vue";
import CustomClassProficienciesPanel from "@/components/levelup/CustomClassProficienciesPanel.vue";
import CustomClassFeaturesPerLevel from "@/components/levelup/CustomClassFeaturesPerLevel.vue";
import CustomClassSpellSlots from "@/components/levelup/CustomClassSpellSlots.vue";
import CustomClassStepsEditor from "@/components/levelup/CustomClassStepsEditor.vue";
import CustomClassResources from "@/components/levelup/CustomClassResources.vue";
import { useAllFeatures } from "@/composables/useFeatures";
import { useCampaigns } from "@/composables/useCampaigns";
import type { CustomStep, CustomResource, HitDie, CasterType, PreparedAbility } from "@/levelup/customTypes";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "custom-class-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}

const { data: existing } = useCustomClass(id);
const { data: campaignList } = useCampaigns();
const campaigns = computed(() => campaignList.value ?? []);
const { data: allFeatures } = useAllFeatures();

const { mutateAsync: create } = useCreateCustomClass();
const { mutateAsync: update } = useUpdateCustomClass();
const { mutateAsync: del } = useDeleteCustomClass();

// ── Feature lookup helpers ────────────────────────────────────────────────────

const allFeatureOptions = computed(() =>
  (allFeatures.value ?? []).map(f => ({ id: f.id, name: f.name })),
);

// ── Form state ────────────────────────────────────────────────────────────────

function emptySlotGrid(): number[][] {
  return Array.from({ length: 20 }, () => Array(9).fill(0));
}

interface FormState {
  class_name: string;
  hit_die: HitDie;
  primary_ability: string;
  saving_throws: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  subclass_level: number;
  features: Record<string, string[]>;
  asi_levels: number[];
  isSpellcaster: boolean;
  spell_slots: number[][];
  spells_known: number[] | null;
  cantrips_known: number[] | null;
  slot_recovery: "short" | "long";
  caster_type: CasterType;
  prepared_ability: PreparedAbility | null;
  prepared_divisor: number | null;
  steps: CustomStep[];
  resources: CustomResource[];
}

const form = ref<FormState>({
  class_name: "",
  hit_die: 8,
  primary_ability: "",
  saving_throws: [],
  armor_proficiencies: [],
  weapon_proficiencies: [],
  subclass_level: 3,
  features: {},
  asi_levels: [4, 8, 12, 16, 19],
  isSpellcaster: false,
  spell_slots: emptySlotGrid(),
  spells_known: null,
  cantrips_known: null,
  slot_recovery: "long",
  caster_type: "none",
  prepared_ability: "wis",
  prepared_divisor: 1,
  steps: [],
  resources: [],
});

const campaignScope = ref<string>("all");

watch(existing, (val) => {
  if (!val) return;
  const raw = JSON.parse(JSON.stringify(val)) as typeof val;
  // Normalise slot grid: ensure 20 rows × 9 columns even if DB had partial data
  const rawSlots = (raw.spell_slots ?? null) as number[][] | null;
  const slotGrid = rawSlots
    ? Array.from({ length: 20 }, (_, i) => {
        const row = rawSlots[i] ?? [];
        return Array.from({ length: 9 }, (_, j) => row[j] ?? 0);
      })
    : emptySlotGrid();
  form.value = {
    class_name: raw.class_name,
    hit_die: raw.hit_die as HitDie,
    primary_ability: raw.primary_ability ?? "",
    saving_throws: raw.saving_throws,
    armor_proficiencies: raw.armor_proficiencies,
    weapon_proficiencies: raw.weapon_proficiencies,
    subclass_level: raw.subclass_level,
    features: raw.features,
    asi_levels: [...raw.asi_levels].sort((a, b) => a - b),
    isSpellcaster: rawSlots !== null,
    spell_slots: slotGrid,
    spells_known: (raw.spells_known as number[] | null) ?? null,
    cantrips_known: (raw.cantrips_known as number[] | null) ?? null,
    slot_recovery: (raw.slot_recovery as "short" | "long") ?? "long",
    caster_type: (raw.caster_type as CasterType) !== "none" ? (raw.caster_type as CasterType) : rawSlots !== null ? "prepared" : "none",
    prepared_ability: raw.prepared_ability ?? "wis",
    prepared_divisor: raw.prepared_divisor ?? 1,
    steps: raw.steps.map((s) => ({ ...s, step_type: s.step_type ?? "text_pick" })),
    resources: raw.resources,
  };
  campaignScope.value = raw.campaign_id ?? "all";
}, { immediate: true });

// ── ASI section ───────────────────────────────────────────────────────────────

const addAsiLevel = ref<number | "">("");

function addAsi() {
  if (!addAsiLevel.value || form.value.asi_levels.includes(Number(addAsiLevel.value))) return;
  form.value.asi_levels = [...form.value.asi_levels, Number(addAsiLevel.value)].sort((a, b) => a - b);
  addAsiLevel.value = "";
}

function removeAsi(level: number) {
  form.value.asi_levels = form.value.asi_levels.filter(l => l !== level);
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

const saving = ref(false);
const saveError = ref("");
const canSave = computed(() => form.value.class_name.trim() !== "");

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  saveError.value = "";
  const payload = {
    class_name: form.value.class_name.trim(),
    hit_die: form.value.hit_die,
    primary_ability: form.value.primary_ability.trim() || null,
    saving_throws: form.value.saving_throws,
    armor_proficiencies: form.value.armor_proficiencies,
    weapon_proficiencies: form.value.weapon_proficiencies,
    subclass_level: form.value.subclass_level,
    features: form.value.features,
    asi_levels: form.value.asi_levels,
    spell_slots: form.value.isSpellcaster ? form.value.spell_slots : null,
    spells_known: form.value.isSpellcaster ? (form.value.spells_known ?? null) : null,
    cantrips_known: form.value.isSpellcaster ? (form.value.cantrips_known ?? null) : null,
    slot_recovery: form.value.isSpellcaster ? form.value.slot_recovery : "long",
    caster_type: form.value.isSpellcaster ? form.value.caster_type : "none",
    prepared_ability: form.value.isSpellcaster && form.value.caster_type !== "known" ? form.value.prepared_ability : null,
    prepared_divisor: form.value.isSpellcaster && form.value.caster_type !== "known" ? form.value.prepared_divisor : null,
    steps: form.value.steps,
    resources: form.value.resources,
    source: null,
    campaign_id: campaignScope.value === "all" ? null : campaignScope.value,
  };
  try {
    if (isNew.value) {
      await create(payload);
    } else {
      await update({ id: id.value, update: payload });
    }
    void router.push("/levelup/classes");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to save.";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!confirm(`Delete "${form.value.class_name}"? This cannot be undone.`)) return;
  try {
    await del(id.value);
    void router.push("/levelup/classes");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete.";
  }
}
</script>

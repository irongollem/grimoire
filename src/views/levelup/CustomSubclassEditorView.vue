<template>
  <div class="max-w-2xl mx-auto px-4 py-6 space-y-6">
    <!-- Back + header -->
    <div class="flex items-center gap-3">
      <RouterLink
        to="/levelup/custom"
        class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
      >← Archetypes</RouterLink>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="form.subclass_name"
        placeholder="Subclass name…"
        class="flex-1 min-w-48 bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        :disabled="saving || !canSave"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>
    <p v-if="saveError" class="font-fell text-sm text-destructive">{{ saveError }}</p>

    <!-- ── Section 1: Identity ────────────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Identity</h2>

      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">DESCRIPTION</label>
        <textarea
          v-model="form.description"
          rows="3"
          placeholder="Flavour text describing this archetype…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">BASE CLASS</label>
          <select
            v-model="form.class_name"
            class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>Select class…</option>
            <option v-for="cls in CLASS_NAMES" :key="cls" :value="cls">{{ cls }}</option>
          </select>
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">CAMPAIGN SCOPE</label>
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

    <!-- ── Section 2: Features per level ─────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Features per Level</h2>
      <p class="font-fell text-sm text-muted-foreground">
        Select features from the
        <RouterLink to="/features" class="text-primary hover:underline">Abilities compendium</RouterLink>
        to grant at each level. Create custom features there first if needed.
      </p>

      <!-- Populated levels -->
      <div v-if="populatedLevels.length > 0" class="space-y-3">
        <div
          v-for="lvl in populatedLevels"
          :key="lvl"
          class="flex items-start gap-3"
        >
          <span class="font-cinzel text-xs text-primary tracking-wider w-8 pt-2 shrink-0">{{ lvl }}</span>
          <div class="flex-1 min-w-0 space-y-2">
            <!-- Chips for selected features -->
            <div v-if="(form.features[lvl.toString()] ?? []).length > 0" class="flex flex-wrap gap-1.5">
              <span
                v-for="fid in form.features[lvl.toString()]"
                :key="fid"
                class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-fell text-xs text-primary"
              >
                {{ featureNameById(fid) }}
                <button
                  type="button"
                  class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none"
                  @click="removeFeatureFromLevel(lvl, fid)"
                >×</button>
              </span>
            </div>
            <!-- Add feature combobox -->
            <EntityCombobox
              model-value=""
              :options="availableFeaturesForLevel(lvl)"
              placeholder="Add feature…"
              @update:model-value="(fid) => fid && addFeatureToLevel(lvl, fid)"
            />
          </div>
        </div>
      </div>

      <!-- Add level -->
      <div class="flex items-center gap-2 pt-1">
        <select
          v-model="addFeatureLevel"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Level…</option>
          <option v-for="n in 20" :key="n" :value="n">{{ n }}</option>
        </select>
        <button
          type="button"
          :disabled="!addFeatureLevel || populatedLevels.includes(Number(addFeatureLevel))"
          class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
          @click="addLevel"
        >
          <Plus class="h-3 w-3" />
          Add level
        </button>
      </div>
    </section>

    <!-- ── Section 3: Wizard steps ────────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Wizard Steps</h2>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-cinzel text-[10px] tracking-wider text-foreground hover:bg-muted/40 transition-colors"
          @click="addStep"
        >
          <Plus class="h-3 w-3" />
          Add step
        </button>
      </div>
      <p class="font-fell text-sm text-muted-foreground">
        Steps shown to the player in the level-up wizard at a specific level (e.g. choose a fighting style).
      </p>

      <div v-if="form.steps.length === 0" class="font-fell text-sm text-muted-foreground italic">
        No steps defined.
      </div>

      <div v-for="(step, i) in form.steps" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
        <button
          type="button"
          class="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
          @click="removeStep(i)"
        >
          <X class="h-3.5 w-3.5" />
        </button>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LEVEL</label>
            <input
              v-model.number="step.level"
              type="number"
              min="1"
              max="20"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">TYPE</label>
            <select
              v-model="step.type"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="select">Pick one (select)</option>
              <option value="append">Pick and accumulate (append)</option>
            </select>
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">OPTIONS FROM</label>
            <select
              v-model="step.step_type"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="feature_pick">Abilities compendium</option>
              <option value="spell_pick">Spellbook</option>
              <option value="text_pick">Custom text</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">KEY</label>
            <input
              v-model="step.key"
              placeholder="e.g. gloom_stalker_magic"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">PICKS (count)</label>
            <input
              v-model.number="step.count"
              type="number"
              min="1"
              placeholder="1"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LABEL (heading in wizard)</label>
          <input
            v-model="step.label"
            placeholder="e.g. Choose Gloom Stalker Magic"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">DESCRIPTION (optional hint)</label>
          <input
            v-model="step.description"
            placeholder="Optional hint shown below the heading…"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Options: feature picker for feature_pick, TagInput for others -->
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">
            OPTIONS
            <span v-if="step.step_type === 'feature_pick'" class="normal-case font-fell tracking-normal"> — pick from Abilities compendium</span>
            <span v-else class="normal-case font-fell tracking-normal"> — one per tag</span>
          </label>

          <!-- Feature picker for feature_pick steps -->
          <template v-if="step.step_type === 'feature_pick'">
            <div v-if="step.options.length > 0" class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="fid in step.options"
                :key="fid"
                class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-fell text-xs text-primary"
              >
                {{ featureNameById(fid) }}
                <button
                  type="button"
                  class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none"
                  @click="removeOptionFromStep(i, fid)"
                >×</button>
              </span>
            </div>
            <EntityCombobox
              model-value=""
              :options="availableOptionsForStep(i)"
              placeholder="Add ability option…"
              @update:model-value="(fid) => fid && addOptionToStep(i, fid)"
            />
          </template>

          <!-- TagInput for spell_pick and text_pick -->
          <TagInput
            v-else
            v-model="step.options"
            placeholder="Add option…"
          />
        </div>
      </div>
    </section>

    <!-- ── Section 4: Resource pools ─────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Resource Pools</h2>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-cinzel text-[10px] tracking-wider text-foreground hover:bg-muted/40 transition-colors"
          @click="addResource"
        >
          <Plus class="h-3 w-3" />
          Add resource
        </button>
      </div>
      <p class="font-fell text-sm text-muted-foreground">
        Tracked pools (uses, charges, etc.) that are initialised on level-up and shown on the character sheet.
      </p>

      <div v-if="form.resources.length === 0" class="font-fell text-sm text-muted-foreground italic">
        No resource pools defined.
      </div>

      <div v-for="(res, i) in form.resources" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
        <button
          type="button"
          class="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
          @click="removeResource(i)"
        >
          <X class="h-3.5 w-3.5" />
        </button>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">KEY</label>
            <input
              v-model="res.key"
              placeholder="e.g. rage_uses"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LABEL</label>
            <input
              v-model="res.label"
              placeholder="e.g. Rage Uses"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">RECHARGES ON</label>
            <select
              v-model="res.rest"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="short">Short Rest</option>
              <option value="long">Long Rest</option>
            </select>
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">SCALING</label>
            <select
              v-model="res.scaling"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="fixed">Fixed value</option>
              <option value="per_level">Per class level</option>
              <option value="table">Custom table (20 values)</option>
            </select>
          </div>
        </div>

        <!-- Fixed value -->
        <div v-if="res.scaling === 'fixed'">
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">VALUE</label>
          <input
            v-model.number="res.fixed_value"
            type="number"
            min="0"
            placeholder="e.g. 1"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Custom table -->
        <div v-if="res.scaling === 'table'">
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">VALUES PER LEVEL (1–20)</label>
          <div class="grid grid-cols-5 gap-1.5">
            <div v-for="n in 20" :key="n" class="space-y-0.5">
              <span class="block font-cinzel text-[9px] text-muted-foreground text-center">{{ n }}</span>
              <input
                :value="(res.table_values ?? [])[n - 1] ?? ''"
                type="number"
                min="0"
                class="w-full bg-muted/40 border border-border rounded px-1.5 py-1 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                @input="setTableValue(res, n - 1, ($event.target as HTMLInputElement).valueAsNumber)"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { Save, Trash2, Plus, X } from "lucide-vue-next";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useCustomSubclass, useCreateCustomSubclass, useUpdateCustomSubclass, useDeleteCustomSubclass } from "@/composables/useCustomSubclasses";
import { useAllFeatures } from "@/composables/useFeatures";
import { useCampaigns } from "@/composables/useCampaigns";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import type { CustomStep, CustomResource } from "@/levelup/customTypes";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "archetype-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: existing } = useCustomSubclass(id);
const { data: campaignList } = useCampaigns();
const campaigns = computed(() => campaignList.value ?? []);
const { data: allFeatures } = useAllFeatures();

const { mutateAsync: create } = useCreateCustomSubclass();
const { mutateAsync: update } = useUpdateCustomSubclass();
const { mutateAsync: del } = useDeleteCustomSubclass();

const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();
const CLASS_NAMES = computed(() => {
  const srd    = (systemClasses.value ?? []).map(c => c.class_name);
  const custom = (customClasses.value ?? []).map(c => c.class_name);
  return [...new Set([...srd, ...custom])].sort();
});

// ── Feature lookup helpers ────────────────────────────────────────────────────

function featureNameById(featureId: string): string {
  return allFeatures.value?.find(f => f.id === featureId)?.name ?? featureId;
}

const allFeatureOptions = computed(() =>
  (allFeatures.value ?? []).map(f => ({ id: f.id, name: f.name })),
);

function availableFeaturesForLevel(level: number) {
  const selected = new Set(form.value.features[level.toString()] ?? []);
  return allFeatureOptions.value.filter(f => !selected.has(f.id));
}

function availableOptionsForStep(stepIdx: number) {
  const selected = new Set(form.value.steps[stepIdx]?.options ?? []);
  return allFeatureOptions.value.filter(f => !selected.has(f.id));
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  class_name: string;
  subclass_name: string;
  description: string;
  features: Record<string, string[]>;
  steps: CustomStep[];
  resources: CustomResource[];
}

const form = ref<FormState>({
  class_name: "",
  subclass_name: "",
  description: "",
  features: {},
  steps: [],
  resources: [],
});

const campaignScope = ref<string>("all");

watch(existing, (val) => {
  if (!val) return;
  const raw = JSON.parse(JSON.stringify(val)) as typeof val;
  form.value = {
    class_name: raw.class_name,
    subclass_name: raw.subclass_name,
    description: raw.description ?? "",
    features: raw.features,
    steps: raw.steps.map((s) => ({
      ...s,
      step_type: s.step_type ?? "text_pick",
    })),
    resources: raw.resources,
  };
  campaignScope.value = raw.campaign_id ?? "all";
}, { immediate: true });

// ── Features section ──────────────────────────────────────────────────────────

const populatedLevels = computed<number[]>(() =>
  Object.keys(form.value.features)
    .map(Number)
    .sort((a, b) => a - b),
);

const addFeatureLevel = ref<number | "">("");

function addFeatureToLevel(level: number, featureId: string) {
  const key = level.toString();
  const current = form.value.features[key] ?? [];
  if (!current.includes(featureId)) {
    form.value.features = { ...form.value.features, [key]: [...current, featureId] };
  }
}

function removeFeatureFromLevel(level: number, featureId: string) {
  const key = level.toString();
  const next = (form.value.features[key] ?? []).filter(id => id !== featureId);
  if (next.length === 0) {
    const copy = { ...form.value.features };
    delete copy[key];
    form.value.features = copy;
  } else {
    form.value.features = { ...form.value.features, [key]: next };
  }
}

function addLevel() {
  if (!addFeatureLevel.value) return;
  const key = addFeatureLevel.value.toString();
  if (form.value.features[key] === undefined) {
    form.value.features = { ...form.value.features, [key]: [] };
  }
  addFeatureLevel.value = "";
}

// ── Steps section ─────────────────────────────────────────────────────────────

function addStep() {
  form.value.steps.push({
    level: 3,
    type: "select",
    step_type: "text_pick",
    key: "",
    label: "",
    options: [],
  });
}

function removeStep(i: number) {
  form.value.steps.splice(i, 1);
}

function addOptionToStep(stepIdx: number, featureId: string) {
  const step = form.value.steps[stepIdx];
  if (step && !step.options.includes(featureId)) {
    step.options.push(featureId);
  }
}

function removeOptionFromStep(stepIdx: number, featureId: string) {
  const step = form.value.steps[stepIdx];
  if (step) {
    step.options = step.options.filter(id => id !== featureId);
  }
}

// ── Resources section ─────────────────────────────────────────────────────────

function addResource() {
  form.value.resources.push({
    key: "",
    label: "",
    rest: "long",
    scaling: "fixed",
    fixed_value: 1,
  });
}

function removeResource(i: number) {
  form.value.resources.splice(i, 1);
}

function setTableValue(res: CustomResource, idx: number, value: number) {
  const arr = [...(res.table_values ?? Array(20).fill(0))];
  arr[idx] = isNaN(value) ? 0 : value;
  res.table_values = arr;
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

const saving = ref(false);
const saveError = ref("");

const canSave = computed(() => form.value.class_name.trim() !== "" && form.value.subclass_name.trim() !== "");

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  saveError.value = "";
  const payload = {
    class_name: form.value.class_name,
    subclass_name: form.value.subclass_name,
    source: null,
    description: form.value.description.trim() || null,
    features: form.value.features,
    steps: form.value.steps,
    resources: form.value.resources,
    campaign_id: campaignScope.value === "all" ? null : campaignScope.value,
  };
  try {
    if (isNew.value) {
      await create(payload);
    } else {
      await update({ id: id.value, update: payload });
    }
    void router.push("/levelup/custom");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to save.";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!confirm(`Delete "${form.value.subclass_name}"? This cannot be undone.`)) return;
  try {
    await del(id.value);
    void router.push("/levelup/custom");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete.";
  }
}
</script>

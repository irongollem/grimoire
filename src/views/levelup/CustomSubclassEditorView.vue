<template>
  <PageHeader
    :title="isNew ? 'New Archetype' : (form.subclass_name || 'Custom Archetype')"
    description="Define a subclass — features, resources, and progression for your custom class"
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

    <CustomSubclassSheet v-if="!isNew && !isEditing && existing" :sub="existing" />

    <div v-else class="max-w-2xl mx-auto space-y-6">
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
      <CustomClassFeaturesPerLevel
        :features="form.features"
        :all-feature-options="allFeatureOptions"
        @update:features="form.features = $event"
      />

      <!-- ── Section 3: Wizard steps ────────────────────────────────────────── -->
      <CustomClassStepsEditor
        :steps="form.steps"
        :all-feature-options="allFeatureOptions"
        @update:steps="form.steps = $event"
      />

      <!-- ── Section 4: Resource pools ─────────────────────────────────────── -->
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
import { IconDelete, IconSave } from '@/lib/icons';
import { useCustomSubclass, useCreateCustomSubclass, useUpdateCustomSubclass, useDeleteCustomSubclass } from "@/composables/useCustomSubclasses";
import CustomSubclassSheet from "@/components/levelup/CustomSubclassSheet.vue";
import CustomClassFeaturesPerLevel from "@/components/levelup/CustomClassFeaturesPerLevel.vue";
import CustomClassStepsEditor from "@/components/levelup/CustomClassStepsEditor.vue";
import CustomClassResources from "@/components/levelup/CustomClassResources.vue";
import { useAllFeatures } from "@/composables/useFeatures";
import { useCampaigns } from "@/composables/useCampaigns";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import type { CustomStep, CustomResource } from "@/levelup/customTypes";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "archetype-new");
const isEditing = computed(() => route.query.edit === "true");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}

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

const allFeatureOptions = computed(() =>
  (allFeatures.value ?? []).map(f => ({ id: f.id, name: f.name })),
);

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  class_name: string;
  subclass_name: string;
  description: string;
  features: Record<string, string[]>;
  steps: CustomStep[];
  resources: CustomResource[];
  hp_per_level: number | null;
}

const form = ref<FormState>({
  class_name: "",
  subclass_name: "",
  description: "",
  features: {},
  steps: [],
  resources: [],
  hp_per_level: null,
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
    hp_per_level: raw.hp_per_level ?? null,
  };
  campaignScope.value = raw.campaign_id ?? "all";
}, { immediate: true });

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
    hp_per_level: form.value.hp_per_level,
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

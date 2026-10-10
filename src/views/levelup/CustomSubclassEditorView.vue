<template>
  <PageHeader
    :title="isNew ? 'New Archetype' : (form.subclass_name || 'Custom Archetype')"
    description="Define a subclass: features and progression for your custom class"
  >
    <template v-if="isNew || isEditing" #actions>
      <AppButton
        v-if="!isNew"
        variant="subtle"
        size="md"
        label="Cancel"
        @click="onCancel"
      />
      <AppButton
        v-if="!isNew"
        variant="destructive"
        size="md"
        label="Delete"
        :icon="IconDelete"
        @click="remove"
      />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconSave"
        :label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
        :disabled="saving || !canSave"
        @click="save"
      />
    </template>

    <CustomSubclassSheet v-if="!isNew && !isEditing && existing" :sub="existing" />

    <div v-else class="max-w-2xl mx-auto space-y-6">
      <p v-if="saveError" class="text-body text-destructive">{{ saveError }}</p>

      <!-- ── Section 1: Identity ────────────────────────────────────────────── -->
      <section class="rounded-lg border border-border bg-card p-4 space-y-4">
        <h2 class="text-label-lg uppercase text-muted-foreground">Identity</h2>

        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1.5">ARCHETYPE NAME</label>
          <AppInput
            v-model="form.subclass_name"
            tone="card"
            size="body"
            placeholder="e.g. Circle of Ash"
          />
        </div>

        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1.5">DESCRIPTION</label>
          <RichTextEditor
            v-model="form.description"
            placeholder="Flavour text describing this archetype…"
            size="md"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-eyebrow text-muted-foreground mb-1.5">BASE CLASS</label>
            <AppSelect v-model="form.class_name" size="body" weight="normal" block>
              <option value="" disabled>Select class…</option>
              <option v-for="cls in CLASS_NAMES" :key="cls" :value="cls">{{ cls }}</option>
            </AppSelect>
          </div>

          <div>
            <label class="block text-eyebrow text-muted-foreground mb-1.5">CAMPAIGN SCOPE</label>
            <AppSelect v-model="campaignScope" size="body" weight="normal" block>
              <option value="all">All my campaigns</option>
              <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
            </AppSelect>
          </div>
        </div>
      </section>

      <!-- ── Section 2: Features per level ─────────────────────────────────── -->
      <CustomClassFeaturesPerLevel
        :features="form.features"
        :all-feature-options="allFeatureOptions"
        @update:features="form.features = $event"
      />

      <!-- ── Section 3: Granted spells per level ───────────────────────────── -->
      <SubclassSpellSection title="Granted Spells per Level" open :count="Object.keys(form.granted_spells).length">
        <template #help>
          Spells the subclass grants automatically: always prepared, and they don't count toward the
          prepared-spell limit (oath / domain / circle spells). Pick from the SRD or your
          <RouterLink to="/spells" class="text-primary hover:underline">custom spells</RouterLink>.
        </template>
        <SpellsByLevelGrid v-model="form.granted_spells" :all-spell-options="allSpellOptions" level-kind="class" />
      </SubclassSpellSection>

      <!-- ── Section 4: Spells that depend on a choice ─────────────────────── -->
      <SubclassSpellSection title="Spells by Choice" :count="Object.keys({ ...form.spell_variants, ...form.expanded_spell_variants }).length">
        <template #help>
          For grants that depend on something the character picks, like a Circle of the Land terrain.
          Name the choice, add its options, and set the spells each option grants at each class level.
        </template>
        <SubclassSpellVariants
          v-model:variants="form.spell_variants"
          v-model:expanded-variants="form.expanded_spell_variants"
          v-model:label="form.spell_variant_label"
          :all-spell-options="allSpellOptions"
        />
      </SubclassSpellSection>

      <!-- ── Section 5: Expanded spell list ────────────────────────────────── -->
      <SubclassSpellSection title="Expanded Spell List" :count="Object.keys(form.expanded_spells).length">
        <template #help>
          Spells this subclass adds to the class's spell list. The character still chooses them, and they
          count toward known spells (e.g. a Warlock patron). Grouped by spell level, not class level.
        </template>
        <SpellsByLevelGrid v-model="form.expanded_spells" :all-spell-options="allSpellOptions" level-kind="spell" />
      </SubclassSpellSection>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import PageHeader from "@/components/common/list/PageHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconDelete, IconSave } from '@/lib/icons';
import { useCustomSubclass, useCreateCustomSubclass, useUpdateCustomSubclass, useDeleteCustomSubclass } from "@/composables/rules/useCustomSubclasses";
import CustomSubclassSheet from "@/components/levelup/CustomSubclassSheet.vue";
import CustomClassFeaturesPerLevel from "@/components/levelup/CustomClassFeaturesPerLevel.vue";
import SpellsByLevelGrid from "@/components/levelup/SpellsByLevelGrid.vue";
import SubclassSpellSection from "@/components/levelup/SubclassSpellSection.vue";
import SubclassSpellVariants from "@/components/levelup/SubclassSpellVariants.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import { toPlainText } from "@/ai/utils";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import { useDmCampaigns } from "@/composables/campaign/useCampaigns";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import { markEdited } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
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
const { data: campaignList } = useDmCampaigns();
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
  granted_spells: Record<string, string[]>;
  spell_variants: Record<string, Record<string, string[]>>;
  spell_variant_label: string | null;
  expanded_spell_variants: Record<string, Record<string, string[]>>;
  expanded_spells: Record<string, string[]>;
  hp_per_level: number | null;
}

const form = ref<FormState>({
  class_name: "",
  subclass_name: "",
  description: "",
  features: {},
  granted_spells: {},
  spell_variants: {},
  spell_variant_label: null,
  expanded_spell_variants: {},
  expanded_spells: {},
  hp_per_level: null,
});

const { data: spellIndex } = useSpellIndex();
// Spells already granted resolve by id, so one outside the enabled sources still shows its name.
const { data: grantedRows } = useSpellsByIds(() => [
  ...Object.values(form.value.granted_spells).flat(),
  ...Object.values(form.value.spell_variants).flatMap(v => Object.values(v).flat()),
  ...Object.values(form.value.expanded_spells).flat(),
  ...Object.values(form.value.expanded_spell_variants).flatMap(v => Object.values(v).flat()),
]);
const allSpellOptions = computed(() => {
  const label = (s: { name: string; level: number }) =>
    s.level === 0 ? `${s.name} (cantrip)` : `${s.name} (lvl ${s.level})`;
  const options = new Map<string, { id: string; name: string }>();
  for (const s of grantedRows.value.values()) options.set(s.id, { id: s.id, name: label(s) });
  for (const s of spellIndex.value ?? []) options.set(s.id, { id: s.id, name: label(s) });
  return [...options.values()];
});

// Same default flip as CustomClassEditorView (#596): a new subclass defaults
// to the active campaign rather than "all my campaigns" by accident.
const { activeCampaignId } = storeToRefs(useCampaignStore());
const campaignScope = ref<string>(activeCampaignId.value ?? "all");

watch(existing, (val) => {
  if (!val) return;
  const raw = JSON.parse(JSON.stringify(val)) as typeof val;
  form.value = {
    class_name: raw.class_name,
    subclass_name: raw.subclass_name,
    description: raw.description ?? "",
    features: raw.features,
    granted_spells: raw.granted_spells ?? {},
    spell_variants: raw.spell_variants ?? {},
    spell_variant_label: raw.spell_variant_label ?? null,
    expanded_spell_variants: raw.expanded_spell_variants ?? {},
    expanded_spells: raw.expanded_spells ?? {},
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
  const content = {
    class_name: form.value.class_name,
    subclass_name: form.value.subclass_name,
    description: toPlainText(form.value.description).trim() ? form.value.description : null,
    features: form.value.features,
    granted_spells: form.value.granted_spells,
    spell_variants: form.value.spell_variants,
    spell_variant_label:
      Object.keys(form.value.spell_variants).length + Object.keys(form.value.expanded_spell_variants).length > 0
        ? form.value.spell_variant_label
        : null,
    expanded_spell_variants: form.value.expanded_spell_variants,
    expanded_spells: form.value.expanded_spells,
    hp_per_level: form.value.hp_per_level,
  };
  // Material edit detection: any change to the archetype's rules content means
  // a human has now authored part of an AI-generated archetype. Campaign scope
  // is a carve-out. `source` is kept as stored so a generated one stays "Grimoire:AI".
  const row = existing.value;
  const contentChanged = !!row && Object.entries(content).some(
    ([key, value]) => !deepEqual(value, row[key as keyof typeof row]),
  );
  const payload = {
    ...content,
    source: row?.source ?? null,
    ai_provenance: contentChanged ? markEdited(row?.ai_provenance) : (row?.ai_provenance ?? null),
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

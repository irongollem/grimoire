<template>
  <div class="flex flex-col gap-5 max-w-2xl">
    <!-- Name input -->
    <label>
      <span class="sr-only">Ability name</span>
      <input
        v-model="form.name"
        placeholder="Ability name…"
        class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>

    <p v-if="saveError" class="font-fell text-sm text-destructive">{{ saveError }}</p>

    <!-- Identity fields -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">TYPE</label>
        <select
          v-model="form.feature_type"
          class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option v-for="t in FEATURE_TYPES" :key="t" :value="t">{{ FEATURE_TYPE_LABELS[t] }}</option>
        </select>
      </div>

      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">SOURCE</label>
        <input
          v-model="form.source"
          placeholder="PHB, XGtE, Homebrew…"
          class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
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

    <!-- Prerequisite -->
    <div>
      <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">PREREQUISITE</label>
      <input
        v-model="form.prerequisite"
        placeholder="e.g. Dexterity 13 or higher, Proficiency with a martial weapon…"
        class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>

    <!-- Tags -->
    <div>
      <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">TAGS</label>
      <TagInput v-model="form.tags" placeholder="ranger, gloom-stalker, combat…" />
    </div>

    <!-- Description (rich text) -->
    <div>
      <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">DESCRIPTION</label>
      <RichTextEditor
        v-model="form.description"
        placeholder="Full rules text — mechanics, damage rolls, saving throws, conditions…"
        min-height="220px"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { useCreateFeature, useUpdateFeature, useDeleteFeature } from "@/composables/useFeatures";
import { useCampaigns } from "@/composables/useCampaigns";
import { FEATURE_TYPES, FEATURE_TYPE_LABELS } from "@/types/feature.types";
import type { ClassFeature } from "@/types/feature.types";

const props = defineProps<{ feature: ClassFeature | null }>();

const router = useRouter();
const { data: campaignList } = useCampaigns();
const campaigns = computed(() => campaignList.value ?? []);

const { mutateAsync: create } = useCreateFeature();
const { mutateAsync: update } = useUpdateFeature();
const { mutateAsync: del } = useDeleteFeature();

// ── Form state ────────────────────────────────────────────────────────────────

const form = ref({
  name: "",
  feature_type: "passive" as ClassFeature["feature_type"],
  source: "",
  prerequisite: "",
  tags: [] as string[],
  description: null as string | null,
});

const campaignScope = ref("all");

watch(
  () => props.feature,
  (val) => {
    if (!val) return;
    form.value = {
      name: val.name,
      feature_type: val.feature_type,
      source: val.source ?? "",
      prerequisite: val.prerequisite ?? "",
      tags: [...val.tags],
      description: val.description,
    };
    campaignScope.value = val.campaign_id ?? "all";
  },
  { immediate: true },
);

// ── Save / Delete ─────────────────────────────────────────────────────────────

const saving = ref(false);
const saveError = ref("");

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  saveError.value = "";
  const payload = {
    name: form.value.name.trim(),
    feature_type: form.value.feature_type,
    source: form.value.source.trim() || null,
    prerequisite: form.value.prerequisite.trim() || null,
    tags: form.value.tags,
    description: form.value.description,
    campaign_id: campaignScope.value === "all" ? null : campaignScope.value,
    open5e_import: props.feature?.open5e_import ?? false,
  };
  try {
    if (!props.feature) {
      await create(payload);
    } else {
      await update({ id: props.feature.id, update: payload });
    }
    void router.push("/features");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to save.";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.feature) return;
  if (!confirm(`Delete "${props.feature.name}"? This cannot be undone.`)) return;
  try {
    await del(props.feature.id);
    void router.push("/features");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete.";
  }
}

defineExpose({
  saving,
  canSave: computed(() => !saving.value && !!form.value.name.trim()),
  save,
  remove,
})
</script>

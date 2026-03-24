<template>
  <PageHeader
    :title="isNew ? 'New Rule' : (rule?.title || 'Loading…')"
    description="Custom rule, system, or table"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <form v-else class="max-w-3xl space-y-5" @submit.prevent="handleSave">
      <!-- Title -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">TITLE</label>
        <input
          v-model="form.title"
          type="text"
          placeholder="e.g. Crafting System, Icy Weather Rules…"
          required
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Category + Tags row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">CATEGORY</label>
          <select
            v-model="form.category"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">None</option>
            <option v-for="cat in RULE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">TAGS</label>
          <TagInput v-model="tags" />
        </div>
      </div>

      <!-- Player visibility -->
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="form.isPlayerVisible" class="rounded" />
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">VISIBLE TO PLAYERS</span>
        <span class="font-fell text-xs text-muted-foreground italic">— players can read this rule in their portal</span>
      </label>

      <!-- Rich text content -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">CONTENT</label>
        <RichTextEditor v-model="form.content" placeholder="Write your rule, table, or system here…" />
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3 pt-2">
        <button
          type="submit"
          :disabled="saving"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {{ saving ? "Saving…" : "Save Rule" }}
        </button>
        <RouterLink
          to="/rules"
          class="font-fell text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </RouterLink>
        <button
          v-if="!isNew"
          type="button"
          class="ml-auto font-fell text-sm text-destructive hover:opacity-80 transition-opacity"
          @click="handleDelete"
        >
          Delete
        </button>
      </div>
    </form>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import { useRoute, useRouter } from "vue-router";
import { useRule, useCreateRule, useUpdateRule, useDeleteRule } from "@/composables/useRules";
import { RULE_CATEGORIES } from "@/types/rule.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";

const route  = useRoute();
const router = useRouter();
const isNew  = computed(() => route.name === "rule-new");
const id     = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: rule, isLoading: ruleLoading } = useRule(id.value);
const isLoading = computed(() => !isNew.value && ruleLoading.value);

const createRule = useCreateRule();
const updateRule = useUpdateRule();
const deleteRule = useDeleteRule();
const { confirm } = useConfirm();
const saving = ref(false);

const form = ref({
  title: "",
  category: "" as string,
  content: null as string | null,  // RichTextEditor serializes Tiptap JSON as string
  isPlayerVisible: false,
});
const tags = ref<string[]>([]);

// Populate form when editing an existing rule
watch(rule, (r) => {
  if (!r) return;
  form.value.title           = r.title;
  form.value.category        = r.category ?? "";
  form.value.content         = r.content ? JSON.stringify(r.content) : null;
  form.value.isPlayerVisible = r.is_player_visible ?? false;
  tags.value                 = [...r.tags];
}, { immediate: true });

async function handleSave() {
  saving.value = true;
  try {
    const payload = {
      title:    form.value.title,
      category: form.value.category || null,
      content:           form.value.content ? JSON.parse(form.value.content) : null,
      is_player_visible: form.value.isPlayerVisible,
      tags:              tags.value,
    };
    if (isNew.value) {
      await createRule.mutateAsync(payload);
    } else {
      await updateRule.mutateAsync({ id: id.value, update: payload });
    }
    router.push("/rules");
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!await confirm(`Delete "${rule.value?.title}"? This cannot be undone.`)) return;
  await deleteRule.mutateAsync(id.value);
  router.push("/rules");
}
</script>

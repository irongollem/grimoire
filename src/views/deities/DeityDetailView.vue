<template>
  <PageHeader
    :title="isNew ? 'New Deity' : deity?.name || 'Loading…'"
    :description="deity?.titles ?? undefined"
  >
    <template #actions>
      <!-- View / Edit toggle (existing deities only) -->
      <template v-if="!isNew">
        <button
          v-if="!isEditing"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="startEditing"
        >
          <Pencil class="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="stopEditing"
        >
          <Eye class="h-3.5 w-3.5" />
          View
        </button>
      </template>

      <!-- View-mode: instant visibility toggle -->
      <PlayerVisibilityToggle
        v-if="!isEditing && deity?.id"
        :visible-to="deity.player_visible_to ?? []"
        @update:visible-to="revealDeity($event)"
      />

      <!-- Edit-mode actions -->
      <template v-if="isEditing && deityEditor">
        <button
          v-if="deity?.id"
          type="button"
          class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors"
          @click="deityEditor.handleDelete()"
        >
          Delete
        </button>
        <button
          type="button"
          :disabled="deityEditor.isSaving"
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="deityEditor.handleSave()"
        >
          {{ deityEditor.isSaving ? 'Saving…' : isNew ? 'Create Deity' : 'Save Changes' }}
        </button>
      </template>
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <DeityEditor
        v-if="isNew || isEditing"
        :key="deity?.id ?? 'new'"
        ref="deityEditor"
        :deity="deity ?? null"
        :is-new="isNew"
      />
      <DeitySheet
        v-else-if="deity"
        :key="deity.id"
        :deity="deity"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Pencil, Eye } from "lucide-vue-next";
import { useDeity, useUpdateDeity } from "@/composables/useDeities";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DeityEditor from "@/components/deities/DeityEditor.vue";
import DeitySheet from "@/components/deities/DeitySheet.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

const route     = useRoute();
const router    = useRouter();
const isNew     = computed(() => route.name === "deity-new");
const isEditing = computed(() => isNew.value || route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: deity, isLoading: deityLoading } = useDeity(id);
const loading = computed(() => !isNew.value && deityLoading.value);

const deityEditor = ref<InstanceType<typeof DeityEditor> | null>(null);
const updateDeity = useUpdateDeity();

async function revealDeity(playerVisibleTo: string[]) {
  if (!deity.value?.id) return;
  await updateDeity.mutateAsync({ id: deity.value.id, update: { player_visible_to: playerVisibleTo } });
}

function startEditing() {
  router.replace({ query: { ...route.query, edit: "true" } });
}
function stopEditing() {
  const q = { ...route.query };
  delete q.edit;
  router.replace({ query: q });
}
</script>

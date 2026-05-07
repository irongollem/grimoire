<template>
  <PageHeader :title="isNew ? 'New Pantheon' : pantheon?.name || 'Loading…'">
    <template #actions>
      <!-- View / Edit toggle (existing pantheons only) -->
      <template v-if="!isNew">
        <button
          v-if="!isEditing"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="startEditing"
        >
          <IconEdit class="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          @click="stopEditing"
        >
          <IconReveal class="h-3.5 w-3.5" />
          View
        </button>
      </template>

      <!-- View-mode: instant visibility toggle -->
      <PlayerVisibilityToggle
        v-if="!isEditing && pantheon?.id"
        :visible-to="pantheon.player_visible_to ?? []"
        @update:visible-to="revealPantheon($event)"
      />

      <!-- Edit-mode actions -->
      <template v-if="isEditing && pantheonEditor">
        <button
          v-if="pantheon?.id"
          type="button"
          class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors"
          @click="pantheonEditor.handleDelete()"
        >
          Delete
        </button>
        <button
          type="button"
          :disabled="pantheonEditor.isSaving"
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="pantheonEditor.handleSave()"
        >
          {{ pantheonEditor.isSaving ? 'Saving…' : isNew ? 'Create Pantheon' : 'Save Changes' }}
        </button>
      </template>
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <PantheonEditor
        v-if="isNew || isEditing"
        :key="pantheon?.id ?? 'new'"
        ref="pantheonEditor"
        :pantheon="pantheon ?? null"
        :is-new="isNew"
      />
      <PantheonSheet
        v-else-if="pantheon"
        :key="pantheon.id"
        :pantheon="pantheon"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconEdit, IconReveal } from '@/lib/icons';
import { usePantheon, useUpdatePantheon } from "@/composables/useDeities";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PantheonEditor from "@/components/pantheons/PantheonEditor.vue";
import PantheonSheet from "@/components/pantheons/PantheonSheet.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

const route     = useRoute();
const router    = useRouter();
const isNew     = computed(() => route.name === "pantheon-new");
const isEditing = computed(() => isNew.value || route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: pantheon, isLoading: pantheonLoading } = usePantheon(id);
const loading = computed(() => !isNew.value && pantheonLoading.value);

const pantheonEditor = ref<InstanceType<typeof PantheonEditor> | null>(null);
const updatePantheon = useUpdatePantheon();

async function revealPantheon(playerVisibleTo: string[]) {
  if (!pantheon.value?.id) return;
  await updatePantheon.mutateAsync({ id: pantheon.value.id, update: { player_visible_to: playerVisibleTo } });
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

<template>
  <PageHeader :title="isNew ? 'New Pantheon' : pantheon?.name || 'Loading…'">
    <template #actions>
      <!-- View / Edit toggle (existing pantheons only) -->
      <template v-if="!isNew">
        <AppButton
          v-if="!isEditing"
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          variant="subtle"
          label="Edit"
          :icon="IconEdit"
          @click="startEditing"
        />
        <AppButton
          v-else
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          variant="subtle"
          label="View"
          :icon="IconDocument"
          @click="stopEditing"
        />
      </template>

      <!-- View-mode: instant visibility toggle -->
      <PlayerVisibilityToggle
        v-if="!isEditing && pantheon?.id"
        :visible-to="pantheon.player_visible_to ?? []"
        @update:visible-to="revealPantheon($event)"
      />

      <!-- Edit-mode actions -->
      <template v-if="isEditing && pantheonEditor">
        <AppButton
          v-if="pantheon?.id"
          size="md"
          collapse-below="lg"
          collapse-label-on-mobile
          label="Delete"
          :icon="IconDelete"
          variant="destructive"
          @click="pantheonEditor.handleDelete()"
        />
        <AppButton
          size="md"
          collapse-below="lg"
          :disabled="pantheonEditor.isSaving"
          :label="pantheonEditor.isSaving ? 'Saving…' : isNew ? 'Create Pantheon' : 'Save Changes'"
          :mobile-label="pantheonEditor.isSaving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          variant="primary"
          @click="pantheonEditor.handleSave()"
        />
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
import { IconDelete, IconDocument, IconEdit } from '@/lib/icons';
import { usePantheon, useUpdatePantheon } from "@/composables/useDeities";
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
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

<template>
  <PageHeader
    :title="isNew ? 'New Deity' : deity?.name || 'Loading…'"
    :description="deity?.titles ?? undefined"
  >
    <template #actions>
      <!-- View / Edit toggle (existing deities only) -->
      <template v-if="!isNew">
        <PageHeaderAction
          v-if="!isEditing"
          label="Edit"
          :icon="IconEdit"
          @click="startEditing"
        />
        <PageHeaderAction
          v-else
          label="View"
          :icon="IconDocument"
          @click="stopEditing"
        />
      </template>

      <!-- View-mode: instant reveal -->
      <AudienceRevealControl
        v-if="!isEditing && deity?.id"
        :name="deity.name"
        :visible-to="deity.player_visible_to"
        @change="revealDeity($event)"
      />

      <!-- Edit-mode actions -->
      <template v-if="isEditing && deityEditor">
        <PageHeaderAction
          v-if="deity?.id"
          label="Delete"
          :icon="IconDelete"
          variant="destructive"
          @click="deityEditor.handleDelete()"
        />
        <PageHeaderAction
          :disabled="deityEditor.isSaving"
          :label="deityEditor.isSaving ? 'Saving…' : isNew ? 'Create Deity' : 'Save Changes'"
          :mobile-label="deityEditor.isSaving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          variant="primary"
          :collapse-label-on-mobile="false"
          @click="deityEditor.handleSave()"
        />
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
import { IconDelete, IconDocument, IconEdit } from '@/lib/icons';
import { useDeity, useUpdateDeity } from "@/composables/useDeities";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DeityEditor from "@/components/deities/DeityEditor.vue";
import DeitySheet from "@/components/deities/DeitySheet.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";

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

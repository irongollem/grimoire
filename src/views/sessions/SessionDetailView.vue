<template>
  <PageHeader :title="session ? sessionLabel(session) : 'Session'">
    <template #actions>
      <AppButton to="/sessions" variant="ghost" size="sm" :icon="IconChevronLeft" label="Sessions" />
    </template>

    <div v-if="isLoading" class="flex justify-center py-10"><LoadingSpinner /></div>
    <p v-else-if="error" role="alert" class="text-body text-destructive">
      The session log could not be read: {{ error.message }}
    </p>
    <div v-else-if="!session" class="space-y-3 py-6">
      <p class="text-body italic text-muted-foreground">That session is not in this campaign's log.</p>
      <AppButton to="/sessions" variant="outline" size="sm" label="Back to the log" />
    </div>

    <div v-else class="space-y-6">
      <SessionDetailsForm :key="session.id" :session="session" />

      <div class="grid gap-6 lg:grid-cols-2">
        <SessionNotePanel :session="session" />
        <SessionLearned :session-id="session.id" />
      </div>

      <div class="border-t pt-4">
        <AppButton variant="destructive" size="sm" label="Delete this session" @click="remove" />
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SessionDetailsForm from "@/components/sessions/SessionDetailsForm.vue";
import SessionNotePanel from "@/components/sessions/SessionNotePanel.vue";
import SessionLearned from "@/components/sessions/SessionLearned.vue";
import { useCampaignSessions, useDeleteCampaignSession } from "@/composables/sessions/useCampaignSessions";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconChevronLeft } from "@/lib/icons";
import { sessionLabel } from "@/lib/sessions/sessionLabel";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();

const { data: log, isLoading, error } = useCampaignSessions();
const deleting = useDeleteCampaignSession();

const session = computed(() => (log.value ?? []).find((s) => s.id === route.params.id) ?? null);

async function remove() {
  const target = session.value;
  if (!target) return;
  const ok = await confirm("Its note stays, without a session. What the party learned stays learned.", {
    title: `Delete ${sessionLabel(target)}?`,
    confirmLabel: "Delete session",
  });
  if (!ok) return;
  try {
    await deleting.mutateAsync(target.id);
    await router.push("/sessions");
  } catch (cause) {
    toast.error(toast.fromError(cause));
  }
}
</script>

<template>
  <SettingsSection
    title="Unused accounts"
    description="Accounts unused for 12 months get a notice; 30 days later, if still unused, they can be deleted."
  >
    <div v-if="statusQuery.isPending.value" class="py-2">
      <BannerLoader class="h-8" />
    </div>
    <div v-else-if="statusQuery.isError.value" class="text-destructive text-body">
      Failed to load the notice status.
      <AppButton variant="subtle" size="sm" label="Try again" @click="statusQuery.refetch()" />
    </div>

    <div v-else-if="status" class="space-y-5">
      <div class="space-y-3">
        <p class="text-body text-muted-foreground" data-testid="retention-pending">
          {{ pendingSentence }}
        </p>
        <p
          v-if="status.previouslyFailed > 0"
          class="text-caption text-muted-foreground"
        >
          {{ status.previouslyFailed }}
          {{ status.previouslyFailed === 1 ? "address" : "addresses" }} could not be reached before;
          {{ status.previouslyFailed === 1 ? "it is" : "they are" }} tried last.
        </p>
        <CautionNotice v-if="!status.configured" class="text-caption">
          Email is not set up (no Resend key), so nothing can be sent.
        </CautionNotice>
        <p v-if="lastRun" class="text-body text-foreground" data-testid="retention-last-run">
          Sent {{ lastRun.sent }}<template v-if="lastRun.failed > 0">, {{ lastRun.failed }} failed</template>.
        </p>
        <p v-if="sendError" role="alert" class="text-caption text-destructive">{{ sendError }}</p>
        <div class="flex flex-wrap items-center gap-3">
          <AppButton
            variant="primary"
            size="sm"
            :label="sendLabel"
            :loading="sendMutation.isPending.value"
            :disabled="!canSend"
            @click="send"
          />
          <p class="text-caption text-muted-foreground">
            Each run sends to at most {{ status.batchSize }} accounts.
          </p>
        </div>
      </div>

      <div class="space-y-3 border-t border-border pt-4">
        <p class="text-body text-muted-foreground" data-testid="retention-deletable">
          {{ deletable.length === 0 ? "No accounts are past their notice." : `${accounts(deletable.length)} past their notice.` }}
        </p>
        <ul v-if="failures.length > 0" role="alert" class="space-y-1">
          <li v-for="f in failures" :key="f" class="text-caption text-destructive">{{ f }}</li>
        </ul>
        <p v-if="progress" class="text-caption text-muted-foreground" role="status">{{ progress }}</p>
        <AppButton
          variant="tinted"
          tone="danger"
          emphasis="soft"
          size="sm"
          :label="`Delete ${accounts(deletable.length)}`"
          :loading="deleting"
          :disabled="deletable.length === 0 || deleting"
          @click="deleteAll"
        />
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
/**
 * Admin → Users. The two manual steps of the inactivity retention flow: send
 * the deletion notice to accounts unused for 12 months, then delete the ones
 * still unused 30 days after it. Neither runs on its own; a person presses the
 * button. Deletion goes one account at a time so one failure does not stop the
 * rest, and each failure is reported by name.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";
import SettingsSection from "@/components/common/settings/SettingsSection.vue";
import { accountDeletionErrorMessage } from "@/composables/account/useAccountDeletion";
import { useAdminUsers, type AdminUser } from "@/composables/admin/useAdminUsers";
import { useInactivityNoticeStatus, useSendInactivityNotice } from "@/composables/admin/useInactivityNotice";
import { useConfirm } from "@/composables/useConfirm";

const { users } = defineProps<{ users: readonly AdminUser[] }>();

const { confirm } = useConfirm();
const { deleteUser } = useAdminUsers();
const statusQuery = useInactivityNoticeStatus();
const sendMutation = useSendInactivityNotice();

const status = computed(() => statusQuery.data.value);
const lastRun = computed(() => sendMutation.data.value);
const sendError = ref<string | null>(null);
const deleting = ref(false);
const progress = ref("");
const failures = ref<string[]>([]);

const deletable = computed(() => users.filter((u) => u.retention_state === "deletable"));

function accounts(n: number): string {
  return `${n} ${n === 1 ? "account" : "accounts"}`;
}

const pendingSentence = computed(() => {
  const s = status.value;
  if (!s) return "";
  return s.pending === 0
    ? "No accounts are due a notice."
    : `${accounts(s.pending)} ${s.pending === 1 ? "is" : "are"} due a notice.`;
});

const nextBatch = computed(() => (status.value ? Math.min(status.value.pending, status.value.batchSize) : 0));
const sendLabel = computed(() => `Send ${accounts(nextBatch.value)} a notice`);
const canSend = computed(() => !!status.value && status.value.configured && status.value.pending > 0);

async function send(): Promise<void> {
  if (!canSend.value) return;
  const ok = await confirm(
    `Email ${accounts(nextBatch.value)} that their account will be deleted in 30 days unless they sign in? This cannot be undone.`,
    { title: "Send the inactivity notice?", confirmLabel: "Send", danger: false },
  );
  if (!ok) return;
  sendError.value = null;
  try {
    await sendMutation.mutateAsync();
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : "Sending failed.";
  }
}

async function deleteAll(): Promise<void> {
  const targets = [...deletable.value];
  if (targets.length === 0) return;
  const ok = await confirm(
    `Permanently delete ${accounts(targets.length)}? Each was sent a notice at least 30 days ago and has not been back. Their campaigns and everything in them are erased. This cannot be undone.`,
    { title: "Delete unused accounts", confirmLabel: `Delete ${accounts(targets.length)}`, danger: true },
  );
  if (!ok) return;
  deleting.value = true;
  failures.value = [];
  let done = 0;
  for (const target of targets) {
    progress.value = `Deleting ${done + 1} of ${targets.length}…`;
    try {
      await deleteUser.mutateAsync(target.user_id);
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      failures.value.push(`${target.email}: ${accountDeletionErrorMessage(code)}`);
    }
    done += 1;
  }
  progress.value = `Deleted ${targets.length - failures.value.length} of ${targets.length}.`;
  deleting.value = false;
}
</script>

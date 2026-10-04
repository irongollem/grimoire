<template>
  <div class="space-y-4">
    <SettingsSection
      title="Terms of Service notice"
      description="Email accounts that have not yet accepted the current Terms."
    >
      <div v-if="statusQuery.isPending.value" class="py-2">
        <BannerLoader class="h-8" />
      </div>
      <div v-else-if="statusQuery.isError.value" class="text-destructive text-body">
        Failed to load the notice status.
        <AppButton variant="subtle" size="sm" label="Try again" @click="statusQuery.refetch()" />
      </div>

      <div v-else-if="status" class="space-y-4">
        <div class="space-y-2">
          <p class="text-body text-foreground">
            Current version: <span class="font-semibold">{{ TERMS_VERSION }}</span>
          </p>
          <p class="text-caption text-muted-foreground">What's new, as accounts see it:</p>
          <ul class="flex flex-col gap-2">
            <li
              v-for="change in status.changes"
              :key="change"
              class="flex items-start gap-2 text-body text-muted-foreground"
            >
              <span class="mt-2 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
              <span>{{ change }}</span>
            </li>
          </ul>
        </div>

        <p class="text-body text-muted-foreground" data-testid="terms-counts">
          {{ countsSentence }}
        </p>

        <p
          v-if="status.previouslyFailed > 0"
          class="text-caption text-muted-foreground"
          data-testid="terms-previously-failed"
        >
          {{ status.previouslyFailed }}
          {{ status.previouslyFailed === 1 ? "address" : "addresses" }} could not be reached before;
          {{ status.previouslyFailed === 1 ? "it is" : "they are" }} tried last.
        </p>

        <CautionNotice v-if="!status.configured" class="text-caption">
          Email is not set up, so nothing can be sent. Add the Resend key to the project's
          secrets first.
        </CautionNotice>

        <p v-if="lastRun" class="text-body text-foreground" data-testid="terms-last-run">
          Sent {{ lastRun.sent }}<template v-if="lastRun.failed > 0">, {{ lastRun.failed }} failed</template>.
        </p>
        <p v-if="sendError" role="alert" class="text-caption text-destructive">
          {{ sendError }}
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <AppButton
            variant="primary"
            size="sm"
            :label="buttonLabel"
            :loading="sendMutation.isPending.value"
            :disabled="!canSend"
            @click="send"
          />
          <p v-if="status.configured && status.pending === 0" class="text-caption text-muted-foreground">
            Everyone has accepted or been emailed.
          </p>
        </div>

        <p class="text-caption text-muted-foreground italic">
          This is manual on purpose. The Terms change rarely, and only a person should decide to
          email everyone. Each run sends to at most {{ status.batchSize }} accounts; nobody is emailed
          twice about the same version.
        </p>
      </div>
    </SettingsSection>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin → Legal. The button behind the Terms-change email (`send-terms-notice`).
 *
 * Opening the tab runs a dry run, so the counts are always the real ones; the
 * button is the only thing that sends. A real run mails at most `batchSize`
 * accounts (the function reports its own cap), so a larger audience takes several confirmed clicks. The wording
 * comes from `TERMS_CHANGES`, the same list the in-app gate shows.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import CautionNotice from "@/components/common/CautionNotice.vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useSendTermsNotice, useTermsNoticeStatus } from "@/composables/admin/useTermsNotice";
import { TERMS_VERSION } from "@/lib/legal";

const { confirm } = useConfirm();
const statusQuery = useTermsNoticeStatus();
const sendMutation = useSendTermsNotice();

const status = computed(() => statusQuery.data.value);
/** The last real run's response; the dry run's own sent/failed are always 0. */
const lastRun = computed(() => sendMutation.data.value);
const sendError = ref<string | null>(null);

function accounts(n: number): string {
  return `${n} ${n === 1 ? "account" : "accounts"}`;
}

const countsSentence = computed(() => {
  const s = status.value;
  if (!s) return "";
  const pending =
    s.pending === 0
      ? "No accounts are waiting for the notice."
      : `${accounts(s.pending)} ${s.pending === 1 ? "has" : "have"} not accepted this version and ${
          s.pending === 1 ? "has" : "have"
        } not been emailed about it.`;
  return `${pending} ${s.alreadyAccepted} accepted it in the app. ${s.alreadyNotified} ${
    s.alreadyNotified === 1 ? "was" : "were"
  } already emailed.`;
});

const nextBatch = computed(() => (status.value ? Math.min(status.value.pending, status.value.batchSize) : 0));

const buttonLabel = computed(() => {
  const s = status.value;
  if (!s) return "";
  if (lastRun.value && s.pending > 0) return `Send the next ${nextBatch.value}`;
  return `Email ${accounts(s.pending)}`;
});

const canSend = computed(
  () => !!status.value && status.value.configured && status.value.pending > 0,
);

async function send(): Promise<void> {
  if (!canSend.value) return;
  const ok = await confirm(
    `Email ${accounts(nextBatch.value)} about the Terms of Service updated on ${TERMS_VERSION}? This cannot be undone.`,
    { title: "Send the Terms notice?", confirmLabel: "Send", danger: false },
  );
  if (!ok) return;
  sendError.value = null;
  try {
    await sendMutation.mutateAsync();
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : "Sending failed.";
  }
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-body text-foreground">
      Players under 16 can't set up their own account. Ask a parent or guardian
      to do it for you: enter their email below and we'll send them a link to
      get started.
    </p>

    <form v-if="!sentState" class="space-y-4" @submit.prevent="send">
      <div class="space-y-1.5">
        <label class="text-body text-foreground" for="parent-email">
          Parent or guardian's email
        </label>
        <AppInput
          id="parent-email"
          v-model="parentEmail"
          type="email"
          tone="default"
          size="body"
          required
          placeholder="parent@example.com"
        />
      </div>

      <p v-if="errorMessage" class="text-body text-destructive">{{ errorMessage }}</p>

      <AppButton
        type="submit"
        variant="primary"
        size="lg"
        block
        :disabled="sending"
        :label="sending ? 'Sending…' : 'Send'"
      />
    </form>

    <p v-else class="text-body text-foreground">
      Ask them to check their email. The link works for 14 days.
    </p>

    <a
      :href="legalUrl('young-players')"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-block text-caption text-muted-foreground hover:text-foreground underline transition-colors"
    >
      What Grimoire is, for young players
    </a>
  </div>
</template>

<script setup lang="ts">
/**
 * The under-16 branch of every account-creating form, and of the Terms gate's
 * re-ask for a grandfathered account (#919). Sends a parent/guardian a
 * "set up this account" link via `request-parental-consent`.
 *
 * Behaves identically whether or not the caller is signed in — supabase-js
 * attaches the session automatically when one exists, and the edge function
 * reads that to pick "existing account" over "brand-new signup" (see its own
 * contract). This component never has to know which case it's in.
 *
 * `inviteToken` carries a *campaign* invite through to the parent, who lands
 * on it after setting up the child's account — only `JoinCampaignView` has
 * one to pass. It is unrelated to the app-wide `?token=` invite `SignupView`
 * validates, which stays on this browser's URL and needs no help getting
 * anywhere.
 */
import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { functionErrorCode } from "@edge-shared/functionError.ts";
import { legalUrl } from "@/lib/marketing";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import { parentRequestErrorMessage } from "./parentRequestErrors";

const { inviteToken = null, suppressSentState = false } = defineProps<{
  inviteToken?: string | null;
  /**
   * Skip the built-in "check their email" confirmation screen. For a caller
   * that has its own next step to show instead — the Terms gate's polling
   * "waiting for your parent" state — rather than this component's plain
   * dead end.
   */
  suppressSentState?: boolean;
}>();

const emit = defineEmits<{ sent: [] }>();

const parentEmail = ref("");
const sending = ref(false);
const errorMessage = ref("");
const sentState = ref(false);

async function send() {
  errorMessage.value = "";
  sending.value = true;
  try {
    const body: { parentEmail: string; inviteToken?: string } = {
      parentEmail: parentEmail.value.trim(),
    };
    if (inviteToken) body.inviteToken = inviteToken;

    const { data, error } = await supabase.functions.invoke("request-parental-consent", { body });
    if (error) throw new Error(await functionErrorCode(error));
    if (data?.error) throw new Error(data.error);

    // { sent: true } or { configured: false } both mean "treat this as sent" —
    // the latter is only the local/dev case where outbound email isn't wired up.
    if (!suppressSentState) sentState.value = true;
    emit("sent");
  } catch (err) {
    const code = err instanceof Error ? err.message : String(err);
    errorMessage.value = parentRequestErrorMessage(code);
  } finally {
    sending.value = false;
  }
}
</script>

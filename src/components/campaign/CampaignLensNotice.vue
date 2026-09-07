<template>
  <NoticeCard v-if="refusal" :title="heading">
    {{ explanation }}

    <template #actions>
      <AppButton
        v-if="otherLens"
        variant="primary"
        size="sm"
        :label="otherLens === 'player' ? 'Switch to Player' : 'Switch to DM'"
        @click="toOtherLens"
      />
      <AppButton v-else variant="outline" size="sm" label="Dismiss" @click="dismiss" />
    </template>
  </NoticeCard>
</template>

<script setup lang="ts">
/**
 * Why the campaign you had open is no longer open (#847).
 *
 * The lens fence closes a campaign the current hat does not hold. Doing that
 * silently would repeat the failure #845 was reported as: the DM shell is the
 * DM shell, so landing in it with the campaign gone reads as someone else's
 * data having been taken away, not as a correction. So the bounce says what it
 * did, and — when the account holds the *other* hat in that campaign — offers
 * the one click that opens it again.
 *
 * By design this is close to unreachable: `fetchCampaignsAs` scopes every
 * campaign list by role, `switchUserMode` refuses a remembered campaign the
 * target lens does not hold, and `App.vue` clears one that contradicts a
 * loaded membership. It renders when something upstream of all three has gone
 * wrong, which is exactly when a user most needs to be told something rather
 * than left to infer it.
 *
 * Mounted on both homes, because the fence is written over the lens rather
 * than for the DM alone. Clearing on unmount is what makes it one-shot: it
 * explains the navigation that just happened rather than following the user
 * around the app.
 */
import { computed, onUnmounted } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import NoticeCard from "@/components/common/NoticeCard.vue";
import { lensRefusal } from "@/router/lens";
import { useModeSwitch } from "@/composables/useModeSwitch";

const { switchMode } = useModeSwitch();

const refusal = computed(() => lensRefusal.value);

/** The hat that *would* open it — only when the account actually holds one. */
const otherLens = computed(() => refusal.value?.role ?? null);

const heading = computed(() =>
  otherLens.value
    ? otherLens.value === "player"
      ? "You play in that campaign, you don't run it"
      : "You run that campaign, you don't play in it"
    : "That campaign is no longer yours",
);

const explanation = computed(() => {
  if (!refusal.value) return "";
  const view = refusal.value.lens === "dm" ? "the DM view" : "the player portal";
  if (!otherLens.value) {
    return `The campaign you had open is one this account is no longer a member of, so it has been closed. Everything else in ${view} is untouched.`;
  }
  return otherLens.value === "player"
    ? `So it cannot be open in ${view}, and has been closed. Switch to Player and that game is there, with your character in it.`
    : `So it cannot be open in ${view}, and has been closed. Switch to DM and it is there, with the rest of the campaigns you run.`;
});

function dismiss() {
  lensRefusal.value = null;
}

async function toOtherLens() {
  const target = otherLens.value;
  dismiss();
  if (target) await switchMode(target);
}

onUnmounted(dismiss);
</script>

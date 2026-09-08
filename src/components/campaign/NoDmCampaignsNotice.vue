<template>
  <div
    v-if="show"
    class="rounded-lg border border-border bg-card px-4 py-4 flex flex-col gap-3"
    role="status"
  >
    <div class="flex flex-col gap-1">
      <span class="font-cinzel text-label-lg font-semibold text-foreground">
        You are not the DM of any campaign
      </span>
      <p class="text-caption text-muted-foreground">
        This is the DM view, so everything here is empty. If you came to play in someone
        else's game, switch to Player — your character and their campaign are there. To run
        one of your own, use <span class="text-foreground">Create Campaign</span> at the top of
        the sidebar.
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <AppButton variant="primary" size="sm" label="Switch to Player" @click="toPlayer" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * What a player sees after clicking "DM" in the mode toggle (#845).
 *
 * The lens is a choice, not a claim about what you own, so an account with no
 * campaigns of its own can land here perfectly legitimately — and until now it
 * landed on a dashboard where every widget was empty, no campaign was active,
 * and nothing said why. That is how this reached us as a bug report: the DM
 * shell is the DM shell, so being in it reads as *having become* a DM, and the
 * emptiness reads as someone else's data having been taken away.
 *
 * Both halves of the fix are here — say plainly that the lens is empty because
 * this account DMs nothing, and put the way back one click away rather than
 * leaving the mode toggle to be rediscovered.
 *
 * The wording names the control by the label it actually carries in this
 * state — the sidebar reads "Create Campaign" for an account with none, and
 * "New Campaign" only once it has some. Pointing at a label that is not on
 * screen is worse than not pointing at all.
 *
 * Deliberately gated on the query having *resolved*: `data` is `undefined`
 * while it loads and `[]` when the answer is genuinely none, and telling
 * someone they DM nothing before asking would be worse than saying nothing.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useUiStore } from "@/stores/ui";
import { useModeSwitch } from "@/composables/useModeSwitch";
import { useDmCampaigns } from "@/composables/campaign/useCampaigns";

const ui = useUiStore();
const { switchMode } = useModeSwitch();
const { data: dmCampaigns, isSuccess } = useDmCampaigns();

// `length === 0` on the optional directly, rather than coalescing a missing
// list to zero: `undefined` means "not answered yet", which must not render as
// "you DM nothing". Only a resolved, genuinely empty list shows this.
const show = computed(
  () => ui.userMode === "dm" && isSuccess.value && dmCampaigns.value?.length === 0,
);

async function toPlayer() {
  await switchMode("player");
}
</script>

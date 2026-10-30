<template>
  <div class="flex flex-wrap items-center gap-2">
    <AppButton
      variant="primary"
      size="md"
      :icon="IconShare"
      label="Give to players"
      :disabled="!canShare || opening"
      :title="canShare ? undefined : unavailableHint"
      @click="openDialog"
    />
    <span v-if="!canShare" class="text-caption text-muted-foreground">
      <template v-if="!handout.campaign_id">
        Only a campaign's documents can be given.
        <AppButton
          v-if="activeCampaignName"
          variant="link"
          size="sm"
          :label="`Move it into ${activeCampaignName}`"
          @click="emit('moveToCampaign')"
        />
      </template>
      <template v-else>Switch to this document's campaign to give it.</template>
    </span>
  </div>

  <HandoutShareDialog :open="dialogOpen" :handout="handout" :initial-recipients="initialRecipients" @close="dialogOpen = false" />
</template>

<script setup lang="ts">
/**
 * The "Give to players" button (#1115): one button on the editor's header, the
 * reader's phone bar and the quest cockpit; everything else happens in the
 * dialog. Only a handout filed under the active campaign can be given, because
 * the audience is that campaign's party and the boards are its boards.
 */
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/controls/AppButton.vue";
import HandoutShareDialog from "@/components/scriptorium/HandoutShareDialog.vue";
import type { ShareableHandout } from "@/composables/scriptorium/useHandoutShare";
import { useCampaignStore } from "@/stores/campaign";
import { IconShare } from "@/lib/icons";

const { handout, activeCampaignName = null, initialRecipients = null, prepare = null } = defineProps<{
  handout: ShareableHandout;
  /** Offered as the destination when the document has no campaign yet. */
  activeCampaignName?: string | null;
  /** Passed to the dialog: who the ticks start on while nobody has the handout. */
  initialRecipients?: string[] | null;
  /** Run before the dialog opens; false cancels. The editor saves here, because
   *  share_handout reads the STORED body: an unsaved reveal toggle or newly
   *  linked entry would otherwise be silently ignored. */
  prepare?: (() => Promise<boolean>) | null;
}>();

const emit = defineEmits<{ moveToCampaign: [] }>();

const { activeCampaignId } = storeToRefs(useCampaignStore());

const canShare = computed(
  () => !!handout.campaign_id && handout.campaign_id === activeCampaignId.value,
);
const unavailableHint = computed(() =>
  handout.campaign_id
    ? "Switch to this document's campaign to give it."
    : "Move this document into a campaign (on a larger screen) to give it.",
);

const dialogOpen = ref(false);
const opening = ref(false);

async function openDialog() {
  if (prepare) {
    opening.value = true;
    try {
      if (!(await prepare())) return;
    } finally {
      opening.value = false;
    }
  }
  dialogOpen.value = true;
}
</script>

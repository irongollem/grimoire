<template>
  <div
    v-if="campaign?.demo_source"
    class="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3"
  >
    <div class="flex items-start gap-2.5">
      <IconInfo class="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div class="flex-1 min-w-0 space-y-1">
        <p class="text-body text-foreground">
          This is the Grimoire demo campaign. It doesn't count toward your plan's limits — anything you add to it does.
        </p>
        <p v-if="outdated" class="text-caption text-primary">
          A newer version of the demo is available.
        </p>
      </div>
    </div>
    <AppButton
      variant="tinted"
      tone="primary"
      emphasis="outline"
      size="sm"
      :icon="IconRefresh"
      icon-size="xs"
      :disabled="isResetting"
      :label="isResetting ? 'Resetting…' : 'Reset demo'"
      @click="doReset"
    />
  </div>

  <div
    v-else-if="campaign?.demo_template"
    class="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3"
  >
    <div class="flex items-start gap-2.5">
      <IconInfo class="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <p class="text-body text-foreground">
        This campaign is the published demo (version {{ campaign.demo_version }}).
      </p>
    </div>
    <AppButton
      variant="tinted"
      tone="primary"
      emphasis="outline"
      size="sm"
      :icon="IconUploadCloud"
      icon-size="xs"
      :disabled="isPublishing"
      :label="isPublishing ? 'Publishing…' : 'Publish new version'"
      @click="publishFromTemplate"
    />
  </div>

  <div
    v-else-if="auth.isAppAdmin"
    class="rounded-md border border-dashed border-border px-3 py-2.5 flex items-center justify-between gap-3"
  >
    <p class="text-caption text-muted-foreground">Admin only</p>
    <AppButton
      variant="tinted"
      tone="arcane"
      emphasis="soft"
      size="xs"
      :icon="IconUploadCloud"
      icon-size="xs"
      :disabled="isPublishing"
      :label="isPublishing ? 'Publishing…' : 'Publish as the demo campaign'"
      @click="publishFromOrdinary"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Three mutually exclusive states for living with the demo campaign (#912):
 * a user's own copy, the published template (admin only), or an admin looking
 * at an ordinary campaign they could publish instead. Renders nothing for
 * everyone else.
 *
 * The explanation lives here rather than as a template comment on purpose: a
 * comment beside the v-if chain makes the root a fragment in dev builds, and
 * the `class` DetailsTab passes would then fall through to nothing.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { IconInfo, IconRefresh, IconUploadCloud } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import {
  useDemoStatus,
  useResetDemoCampaign,
  usePublishDemoVersion,
  isDemoOutdated,
} from "@/composables/campaign/useDemoCampaign";

const campaignStore = useCampaignStore();
const auth = useAuthStore();
const router = useRouter();
const { confirm } = useConfirm();
const toast = useToast();

const campaign = computed(() => campaignStore.activeCampaign);

const { data: demoStatus } = useDemoStatus();
const outdated = computed(() => (demoStatus.value ? isDemoOutdated(demoStatus.value) : false));

const { mutateAsync: resetDemo, isPending: isResetting } = useResetDemoCampaign();
const { mutateAsync: publishDemoVersion, isPending: isPublishing } = usePublishDemoVersion();

async function doReset() {
  const ok = await confirm(
    "Resetting replaces this campaign with a fresh copy of the demo. Everything you changed or added in it is lost.",
    { title: "Reset demo campaign?", confirmLabel: "Reset demo", danger: true },
  );
  if (!ok) return;
  try {
    const newCampaign = await resetDemo();
    campaignStore.switchToCampaign(newCampaign);
    toast.success("Demo reset");
    router.push({ name: "dashboard" });
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

async function publish(message: string) {
  if (!campaign.value) return;
  const ok = await confirm(message, { title: "Publish demo campaign?", confirmLabel: "Publish", danger: false });
  if (!ok) return;
  try {
    const version = await publishDemoVersion(campaign.value.id);
    toast.success(`Published demo version ${version}`);
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

function publishFromTemplate() {
  publish("This publishes the current state of this campaign as the new demo version. Every new user who loads the demo from now on gets this version.");
}

function publishFromOrdinary() {
  publish("This replaces the current demo for every new user with a copy of this campaign. Continue?");
}
</script>

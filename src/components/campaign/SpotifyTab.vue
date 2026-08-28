<template>
  <form class="max-w-md flex flex-col gap-6" @submit.prevent="save">

    <!-- About -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Spotify Integration</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="text-caption text-muted-foreground italic leading-relaxed">
          Play Spotify tracks and playlists directly from the Soundboard. Requires a free
          <a
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary hover:underline not-italic"
          >Spotify Developer App</a>
          and a Spotify Premium account. Only you (the DM) need to connect — players are not affected.
        </p>
        <ol class="text-caption text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Create a free app at <span class="font-semibold text-foreground">developer.spotify.com/dashboard</span></li>
          <li>In your app settings, add this Redirect URI:</li>
        </ol>
        <!-- Redirect URI copy box -->
        <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border font-mono text-xs text-foreground">
          <span class="flex-1 truncate select-all">{{ redirectUri }}</span>
          <AppButton
            variant="ghost"
            size="icon-xs"
            class="shrink-0"
            :tooltip="copied ? 'Copied!' : 'Copy'"
            aria-label="Copy redirect URI"
            @click="copyRedirectUri"
          >
            <template #icon>
              <IconCheck v-if="copied" class="h-3.5 w-3.5 text-green-400" />
              <IconCopy v-else class="h-3.5 w-3.5" />
            </template>
          </AppButton>
        </div>
        <ol class="text-caption text-muted-foreground space-y-1 list-decimal list-inside" start="3">
          <li>
            Under <span class="font-semibold text-foreground">Which API/SDKs are you planning to use?</span>,
            tick <span class="font-semibold text-foreground">both</span> Web API
            <span class="font-semibold text-foreground">and</span> Web Playback SDK.
          </li>
          <li>
            Open <span class="font-semibold text-foreground">User Management</span> and add your own
            Spotify account (name + the email on the account).
          </li>
          <li>Copy your Client ID below and save.</li>
        </ol>
        <p class="text-caption text-muted-foreground italic leading-relaxed">
          Steps 3 and 4 are the ones people miss. Spotify used to offer a single
          "Web" option and to grant the app owner access implicitly, so older apps
          often have only Web API ticked and an empty user list — both now return a
          bare <span class="font-mono not-italic">403</span> with no explanation.
        </p>
      </div>
    </div>

    <!-- Client ID -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Client ID</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="text-caption text-muted-foreground italic">
          Found on your Spotify Developer App dashboard. This is not a secret — it is safe to store in your campaign.
        </p>
        <div class="relative">
          <!--
            `pr-10` clears the reveal button. It genuinely overrides the size's
            own `px-3`: Tailwind emits per-side padding after the axis shorthand,
            so the later rule wins — measured in the live dev server as well as
            the production bundle, and independent of class-attribute order. This
            is the sanctioned override-one-token case.
          -->
          <AppInput
            v-model="clientId"
            :type="showId ? 'text' : 'password'"
            placeholder="e.g. 1a2b3c4d5e6f…"
            tone="filled"
            size="body"
            class="pr-10"
            autocomplete="off"
            spellcheck="false"
          />
          <AppButton
            variant="ghost"
            size="icon-xs"
            icon-size="md"
            :icon="revealIcon"
            class="absolute right-2.5 top-1/2 -translate-y-1/2"
            aria-label="Toggle Client ID visibility"
            @click="showId = !showId"
          />
        </div>

        <!-- Connection status -->
        <div v-if="campaign.activeCampaign?.spotify_client_id" class="flex flex-col gap-1.5">
          <div v-if="spotifyStore.spotifyUser" class="flex items-start gap-1.5 px-2.5 py-2 rounded-md bg-green-500/10 border border-green-500/20">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0 mt-1" />
            <div class="text-caption leading-snug">
              <p class="text-green-400 font-semibold">{{ spotifyStore.spotifyUser.display_name }}</p>
              <p class="text-muted-foreground">{{ spotifyStore.spotifyUser.email }}</p>
              <p class="text-muted-foreground capitalize">
                Plan: <span :class="spotifyStore.spotifyUser.product === 'premium' ? 'text-green-400' : 'text-destructive'">{{ spotifyStore.spotifyUser.product }}</span>
              </p>
            </div>
          </div>
          <div v-else class="flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
            <span class="text-caption text-green-500">Client ID saved — connect your account from the Soundboard.</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <AppButton
        v-if="campaign.activeCampaign?.spotify_client_id"
        type="button"
        variant="destructive"
        size="sm"
        :disabled="isSaving"
        label="Remove"
        @click="remove"
      />
      <AppButton
        type="submit"
        variant="primary"
        size="sm"
        :disabled="isSaving || !clientId.trim()"
        :label="isSaving ? 'Saving…' : 'Save'"
      />
    </div>

  </form>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconCheck, IconCopy, IconHide, IconReveal } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useSpotifyStore } from "@/stores/spotify";

const campaign = useCampaignStore();
const spotifyStore = useSpotifyStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const clientId = ref(campaign.activeCampaign?.spotify_client_id ?? "");
const showId = ref(false);
const isSaving = ref(false);
const copied = ref(false);

const revealIcon = computed(() => (showId.value ? IconHide : IconReveal));

const redirectUri = computed(() => `${window.location.origin}/spotify/callback`);

// Sync if the active campaign switches
watch(
  () => campaign.activeCampaign?.spotify_client_id,
  (val) => { clientId.value = val ?? ""; },
);

function copyRedirectUri() {
  navigator.clipboard.writeText(redirectUri.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

async function save() {
  if (!campaign.activeCampaignId) return;
  isSaving.value = true;
  try {
    const updated = await updateCampaign({
      id: campaign.activeCampaignId,
      update: { spotify_client_id: clientId.value.trim() || null },
    });
    campaign.switchToCampaign(updated);
  } finally {
    isSaving.value = false;
  }
}

async function remove() {
  if (!campaign.activeCampaignId) return;
  isSaving.value = true;
  try {
    clientId.value = "";
    const updated = await updateCampaign({
      id: campaign.activeCampaignId,
      update: { spotify_client_id: null },
    });
    campaign.switchToCampaign(updated);
  } finally {
    isSaving.value = false;
  }
}
</script>


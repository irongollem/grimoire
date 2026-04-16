<template>
  <form class="max-w-md flex flex-col gap-6" @submit.prevent="save">

    <!-- About -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Spotify Integration</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="font-fell text-xs text-muted-foreground italic leading-relaxed">
          Play Spotify tracks and playlists directly from the Soundboard. Requires a free
          <a
            href="https://developer.spotify.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary hover:underline not-italic"
          >Spotify Developer App</a>
          and a Spotify Premium account. Only you (the DM) need to connect — players are not affected.
        </p>
        <ol class="font-fell text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Create a free app at <span class="font-semibold text-foreground">developer.spotify.com/dashboard</span></li>
          <li>In your app settings, add this Redirect URI:</li>
        </ol>
        <!-- Redirect URI copy box -->
        <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border font-mono text-xs text-foreground">
          <span class="flex-1 truncate select-all">{{ redirectUri }}</span>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            :title="copied ? 'Copied!' : 'Copy'"
            @click="copyRedirectUri"
          >
            <Check v-if="copied" class="h-3.5 w-3.5 text-green-400" />
            <Copy v-else class="h-3.5 w-3.5" />
          </button>
        </div>
        <p class="font-fell text-xs text-muted-foreground italic">
          3. Copy your Client ID below and save.
        </p>
      </div>
    </div>

    <!-- Client ID -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Client ID</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="font-fell text-xs text-muted-foreground italic">
          Found on your Spotify Developer App dashboard. This is not a secret — it is safe to store in your campaign.
        </p>
        <div class="relative">
          <input
            v-model="clientId"
            :type="showId ? 'text' : 'password'"
            placeholder="e.g. 1a2b3c4d5e6f…"
            class="field-input pr-10"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            @click="showId = !showId"
          >
            <Eye v-if="!showId" class="h-4 w-4" />
            <EyeOff v-else class="h-4 w-4" />
          </button>
        </div>

        <!-- Connection status -->
        <div v-if="campaign.activeCampaign?.spotify_client_id" class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
          <span class="font-fell text-xs text-green-500">Client ID saved — connect your account from the Soundboard.</span>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <button
        v-if="campaign.activeCampaign?.spotify_client_id"
        type="button"
        class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider border border-destructive/40 text-destructive rounded-md hover:bg-destructive/10 transition-colors"
        :disabled="isSaving"
        @click="remove"
      >
        Remove
      </button>
      <button
        type="submit"
        :disabled="isSaving || !clientId.trim()"
        class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {{ isSaving ? "Saving…" : "Save" }}
      </button>
    </div>

  </form>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Eye, EyeOff, Copy, Check } from "lucide-vue-next";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";

const campaign = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const clientId = ref(campaign.activeCampaign?.spotify_client_id ?? "");
const showId = ref(false);
const isSaving = ref(false);
const copied = ref(false);

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

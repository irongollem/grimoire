<template>
  <div class="space-y-8">
    <!-- Intro -->
    <div class="space-y-2">
      <p class="text-body text-foreground">
        Connect your own AI assistant (Claude Desktop, claude.ai, or Claude Code) to
        <strong>read and write</strong> your Grimoire by conversation. Ask it for an NPC's backstory,
        a monster's stat block or a recap of an active quest, have it transcribe a stat block into your
        library, or ask the NPC Voice Coach for a line mid-session.
      </p>
      <p class="text-body text-muted-foreground italic">
        It can create and edit your content but never delete it, and the Voice Coach spends AI credits
        as it does in the app. Whatever you ask is sent to your AI provider, so connect one you trust.
      </p>
    </div>

    <!-- Connector URL -->
    <div class="space-y-2 max-w-xl">
      <p class="text-label-lg font-semibold text-muted-foreground uppercase">
        Connector URL
      </p>
      <div class="flex items-stretch gap-2">
        <code class="flex-1 rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-foreground break-all">{{ mcpUrl }}</code>
        <AppButton
          variant="outline"
          size="sm"
          class="shrink-0"
          :icon="copied ? IconCheck : IconCopy"
          :label="copied ? 'Copied!' : 'Copy'"
          @click="copyUrl"
        />
      </div>
      <p class="text-caption text-muted-foreground">
        In claude.ai or Claude Desktop, go to <strong>Settings → Connectors → Add custom
        connector</strong>, paste this URL, and click <strong>Connect</strong>. You'll be sent
        here to sign in and approve. No tokens to copy.
      </p>
    </div>

    <!-- Connected apps -->
    <div class="space-y-3 max-w-xl">
      <p class="text-label-lg font-semibold text-muted-foreground uppercase">
        Connected AI apps
      </p>

      <p v-if="grantsLoading" class="text-body text-muted-foreground italic">
        Loading…
      </p>
      <p v-else-if="grantsError" class="text-body text-destructive">
        {{ grantsError }}
      </p>
      <p v-else-if="!grants.length" class="text-body text-muted-foreground italic">
        No AI apps are connected yet.
      </p>

      <ul v-else class="space-y-2">
        <li
          v-for="grant in grants"
          :key="grant.client.id"
          class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5"
        >
          <div class="min-w-0">
            <p class="text-heading-xs text-foreground truncate">{{ grant.client.name || "AI client" }}</p>
            <p class="text-caption text-muted-foreground">
              Connected {{ formatDate(grant.granted_at) }}
            </p>
          </div>
          <AppButton
            variant="destructive"
            size="sm"
            class="shrink-0"
            :loading="revokingId === grant.client.id"
            :label="revokingId === grant.client.id ? 'Revoking…' : 'Revoke'"
            @click="revoke(grant.client.id)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { IconCheck, IconCopy } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import type { OAuthGrant } from "@supabase/supabase-js";

const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/mcp`;

const copied = ref(false);
const grants = ref<OAuthGrant[]>([]);
const grantsLoading = ref(true);
const grantsError = ref("");
const revokingId = ref<string | null>(null);

async function copyUrl() {
  await navigator.clipboard.writeText(mcpUrl);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

async function loadGrants() {
  grantsLoading.value = true;
  grantsError.value = "";
  try {
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error) throw error;
    grants.value = data ?? [];
  } catch (err) {
    grantsError.value =
      err instanceof Error ? err.message : "Could not load connected apps.";
  } finally {
    grantsLoading.value = false;
  }
}

async function revoke(clientId: string) {
  revokingId.value = clientId;
  try {
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
    if (error) throw error;
    grants.value = grants.value.filter((g) => g.client.id !== clientId);
  } catch (err) {
    grantsError.value =
      err instanceof Error ? err.message : "Could not revoke access.";
  } finally {
    revokingId.value = null;
  }
}

onMounted(loadGrants);
</script>

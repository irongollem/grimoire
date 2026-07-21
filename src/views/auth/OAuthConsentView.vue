<template>
  <div>
    <h2 class="font-cinzel text-xl font-semibold text-foreground mb-1">Authorize AI connection</h2>
    <p class="text-body text-muted-foreground italic mb-6">
      An AI assistant wants to read your Grimoire
    </p>

    <p v-if="loading" class="text-body text-muted-foreground italic">
      Consulting the wards…
    </p>

    <p v-else-if="errorMessage" class="text-body text-destructive">
      {{ errorMessage }}
    </p>

    <div v-else-if="details" class="space-y-5">
      <div class="rounded-md border border-input bg-background px-4 py-3">
        <p class="font-cinzel text-sm font-semibold text-foreground">
          {{ details.client.name || "An AI client" }}
        </p>
        <p v-if="details.client.uri" class="text-caption text-muted-foreground break-all">
          {{ details.client.uri }}
        </p>
      </div>

      <div class="space-y-2 text-body text-foreground">
        <p>This will let it, acting as <strong>{{ details.user.email }}</strong>:</p>
        <ul class="list-disc pl-5 space-y-1 text-muted-foreground">
          <li><strong class="text-foreground">Read</strong> your campaigns and their content — NPCs, monsters, spells, items, locations, quests, notes and more.</li>
          <li>Only see what you can see; your row-level permissions still apply.</li>
        </ul>
        <p class="text-muted-foreground italic">
          It <strong class="text-foreground not-italic">cannot</strong> create, edit, or delete anything, and it never sees your password or API keys.
        </p>
      </div>

      <p v-if="decisionError" class="text-body text-destructive">
        {{ decisionError }}
      </p>

      <div class="flex gap-3">
        <button
          type="button"
          :disabled="deciding"
          class="flex-1 rounded-md bg-primary px-4 py-2.5 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="decide(true)"
        >
          {{ deciding ? "Sealing the pact…" : "Allow" }}
        </button>
        <button
          type="button"
          :disabled="deciding"
          class="flex-1 rounded-md border border-input bg-background px-4 py-2.5 font-cinzel text-sm font-semibold text-foreground tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="decide(false)"
        >
          Deny
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { supabase } from "@/lib/supabase";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";

const route = useRoute();

const loading = ref(true);
const deciding = ref(false);
const errorMessage = ref("");
const decisionError = ref("");
const details = ref<OAuthAuthorizationDetails | null>(null);

function authorizationId(): string {
  return (route.query.authorization_id as string) || (route.query.authorizationId as string) || "";
}

onMounted(async () => {
  const id = authorizationId();
  if (!id) {
    errorMessage.value = "This authorization link is missing its request id. Start the connection again from your AI client.";
    loading.value = false;
    return;
  }

  try {
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error) throw error;
    // Already consented → Supabase returns a ready redirect URL.
    if (data && "redirect_url" in data) {
      window.location.href = data.redirect_url;
      return;
    }
    details.value = data as OAuthAuthorizationDetails;
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Could not load this authorization request. It may have expired.";
  } finally {
    loading.value = false;
  }
});

async function decide(approve: boolean) {
  decisionError.value = "";
  deciding.value = true;
  const id = authorizationId();
  try {
    // Both helpers redirect the browser back to the AI client by default.
    const { error } = approve
      ? await supabase.auth.oauth.approveAuthorization(id)
      : await supabase.auth.oauth.denyAuthorization(id);
    if (error) throw error;
  } catch (err) {
    decisionError.value =
      err instanceof Error ? err.message : "Could not record your decision. Please try again.";
    deciding.value = false;
  }
}
</script>

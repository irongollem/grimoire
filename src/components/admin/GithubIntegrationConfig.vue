<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">GitHub Bug Reporter</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Fine-grained PAT (<code>issues: write</code> on irongollem/grimoire) used by the in-app bug/feature
        reporter to file GitHub issues. GitHub PATs can carry an expiry date — rotate it here when it lapses,
        no redeploy needed.
      </p>
    </div>

    <div class="rounded-md bg-muted/40 border border-border p-3 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <span class="font-cinzel text-xs font-semibold tracking-wide text-foreground">GitHub token</span>
        <span v-if="tokenSet" class="text-eyebrow text-green-500">
          Set · {{ tokenDate }}
        </span>
        <span v-else class="text-eyebrow text-muted-foreground/60">Not configured</span>
      </div>
      <div v-if="!tokenSet || replacingToken" class="flex items-center gap-2">
        <input
          v-model="tokenDraft"
          :type="tokenDraftVisible ? 'text' : 'password'"
          placeholder="github_pat_…"
          class="flex-1 bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          autocomplete="off"
        />
        <button
          type="button"
          class="px-2 py-1.5 font-cinzel text-2xs text-muted-foreground border border-border rounded hover:text-foreground transition-colors"
          @click="tokenDraftVisible = !tokenDraftVisible"
        >
          {{ tokenDraftVisible ? 'Hide' : 'Show' }}
        </button>
        <button
          type="button"
          :disabled="!tokenDraft.trim() || setKey.isPending.value"
          class="px-3 py-1.5 text-label font-semibold bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="saveToken"
        >
          {{ setKey.isPending.value ? 'Saving…' : 'Save token' }}
        </button>
      </div>
      <div v-else class="flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 font-cinzel text-2xs text-muted-foreground border border-border rounded hover:text-foreground transition-colors"
          @click="replacingToken = true"
        >
          Replace
        </button>
        <button
          type="button"
          :disabled="clearKey.isPending.value"
          class="px-3 py-1.5 font-cinzel text-2xs text-destructive border border-destructive/40 rounded hover:bg-destructive/10 disabled:opacity-50 transition-colors"
          @click="doClearToken"
        >
          {{ clearKey.isPending.value ? '…' : 'Clear' }}
        </button>
      </div>
      <p v-if="!tokenSet" class="text-caption-sm text-destructive italic">
        Not configured — the in-app bug/feature reporter will fail until a token is set.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAdminKeys } from "@/composables/useAdminKeys";

const { keysQuery, setKey, clearKey } = useAdminKeys();
const githubRow = computed(() => keysQuery.data.value?.find((r) => r.provider === "github") ?? null);
const tokenSet = computed(() => !!githubRow.value);
const tokenDate = computed(() =>
  githubRow.value ? new Date(githubRow.value.updated_at).toLocaleDateString() : "",
);

const tokenDraft = ref("");
const tokenDraftVisible = ref(false);
const replacingToken = ref(false);

async function saveToken() {
  await setKey.mutateAsync({ provider: "github", plaintext: tokenDraft.value.trim() });
  tokenDraft.value = "";
  replacingToken.value = false;
}

async function doClearToken() {
  await clearKey.mutateAsync("github");
}
</script>

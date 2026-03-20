<template>
  <div class="max-w-lg space-y-8">
    <PageHeader title="Settings" description="Your profile for this campaign" />

    <!-- Display name -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-4">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Display Name</h2>
      <p class="font-fell text-sm text-muted-foreground italic">
        This is how your DM and party members see you in the campaign.
        It defaults to your email address.
      </p>

      <form class="flex gap-2" @submit.prevent="save">
        <input
          v-model="displayName"
          type="text"
          maxlength="60"
          placeholder="Your name…"
          class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          :disabled="saving || !displayName.trim() || displayName.trim() === current"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Check v-if="saved" class="h-3.5 w-3.5" />
          <Save v-else class="h-3.5 w-3.5" />
          {{ saved ? "Saved" : "Save" }}
        </button>
      </form>

      <p v-if="error" class="font-fell text-xs text-destructive">{{ error }}</p>
    </section>

    <!-- Account info (read-only) -->
    <section class="rounded-lg border border-border bg-card p-5 space-y-2">
      <h2 class="font-cinzel text-sm font-semibold text-foreground tracking-wide">Account</h2>
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Email</span>
        <span class="font-fell text-sm text-foreground">{{ auth.userEmail ?? '—' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground w-16">Role</span>
        <span class="font-cinzel text-xs tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
          {{ auth.currentRole ?? '—' }}
        </span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Check, Save } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

const auth = useAuthStore();

const current = computed(() => auth.membership?.display_name ?? "");
const displayName = ref(current.value);
const saving = ref(false);
const saved = ref(false);
const error = ref<string | null>(null);

async function save() {
  if (!auth.membership?.id || !displayName.value.trim()) return;
  saving.value = true;
  error.value = null;
  saved.value = false;

  const { error: err } = await supabase
    .from("campaign_members")
    .update({ display_name: displayName.value.trim() })
    .eq("id", auth.membership.id);

  saving.value = false;

  if (err) {
    error.value = err.message;
  } else {
    // Update store so the rest of the app reflects the new name immediately
    if (auth.membership) auth.membership = { ...auth.membership, display_name: displayName.value.trim() };
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2000);
  }
}
</script>

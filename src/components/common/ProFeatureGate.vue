<template>
  <div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 flex flex-col gap-3">
    <div class="flex items-center gap-2.5">
      <IconDM class="h-5 w-5 text-amber-400 shrink-0" />
      <span class="font-cinzel text-sm font-bold text-foreground tracking-wide">Pro feature</span>
    </div>
    <p class="text-body text-muted-foreground leading-relaxed">
      {{ message }}
    </p>
    <button
      type="button"
      class="self-start px-4 py-2 rounded-md bg-amber-500 text-black text-label-lg font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
      :disabled="stripeLoading"
      @click="upgrade"
    >
      {{ stripeLoading ? 'Redirecting…' : 'Upgrade to Pro' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { IconDM } from "@/lib/icons";
import { useStripe } from "@/composables/useStripe";

const { message } = defineProps<{
  message: string;
}>();

const { loading: stripeLoading, createCheckoutSession } = useStripe();
function upgrade() { createCheckoutSession(); }
</script>

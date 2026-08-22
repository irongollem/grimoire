<template>
  <div class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 flex flex-col gap-3">
    <div class="flex items-center gap-2.5">
      <IconDM class="h-5 w-5 text-amber-400 shrink-0" />
      <span class="font-cinzel text-sm font-bold text-foreground tracking-wide">Pro feature</span>
    </div>
    <p class="text-body text-muted-foreground leading-relaxed">
      {{ message }}
    </p>
    <AppButton
      variant="tinted"
      tone="caution"
      emphasis="solid"
      size="md"
      class="self-start"
      label="Upgrade to Pro"
      @click="upgrade"
    />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { IconDM } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";

const { message } = defineProps<{
  message: string;
}>();

// See PaywallModal: checkout needs the withdrawal-consent tick from /billing, so
// this gate routes there rather than 400'ing against stripe-create-checkout.
const router = useRouter();
function upgrade() { router.push("/billing"); }
</script>

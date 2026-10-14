<template>
  <AppCheckbox v-model="agreed" required align="start" label-role="caption">
    I agree to the
    <a :href="legalUrl('terms')" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">Terms of Service</a>
    and
    <a :href="legalUrl('privacy')" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground transition-colors">Privacy Policy</a>.
  </AppCheckbox>
  <AppCheckbox v-model="news" align="start" label-role="caption">
    Email me news and updates about Dungeon Grimoire. A few times a year, and you can stop any time in your account settings.
  </AppCheckbox>
</template>

<script setup lang="ts">
import { legalUrl } from "@/lib/marketing";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";

// The one clickwrap every account-creating form shows — the public signup and
// the invite-link join both create accounts, and the join form once did so with
// no consent at all. What ticking it means is recorded by `auth.signUp`
// (TERMS_VERSION in signup metadata, copied to user_subscriptions).
const agreed = defineModel<boolean>({ default: false });
// Optional and never pre-ticked: a pre-ticked box is not valid consent (GDPR).
const news = defineModel<boolean>("news", { default: false });
</script>

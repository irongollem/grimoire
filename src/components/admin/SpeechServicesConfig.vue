<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">Speech (ElevenLabs and Inworld)</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        The voices of the AI table and of a note read aloud. The ElevenLabs key turns voices on for everyone with AI
        on, and clearing it turns them off. Inworld is optional: it speaks the Narrator and any character whose voice
        was made there, and without it they fall back to an ElevenLabs voice. Every line is charged in credits at the
        rates under Pricing > Table voices.
      </p>
    </div>

    <PlatformKeyField provider="elevenlabs" label="ElevenLabs API key" hint="sk_…" />
    <PlatformKeyField provider="inworld" label="Inworld API key (Base64)" hint="The Base64 credential from Inworld's portal" />
  </div>
</template>

<script setup lang="ts">
import PlatformKeyField from "@/components/admin/PlatformKeyField.vue";
</script>

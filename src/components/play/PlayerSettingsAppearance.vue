<template>
  <!-- Theme override -->
  <SettingsSection title="Appearance" description="Your DM sets the campaign theme. Override it here if you prefer a different look.">
    <div class="flex items-center justify-between">
      <p class="font-cinzel text-xs text-foreground tracking-wide">Theme</p>
      <div class="flex rounded-md border border-border overflow-hidden text-label md:text-sm shrink-0">
        <button
          v-for="opt in THEME_OVERRIDE_OPTIONS"
          :key="opt.value"
          type="button"
          class="px-2.5 py-1 transition-colors border-l border-border first:border-l-0"
          :class="currentOverride === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
          @click="setOverride(opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>
  </SettingsSection>

  <!-- Timestamps -->
  <SettingsSection title="Timestamps" description="Chat timestamps use your browser's locale by default. Override here if you prefer a different date and time format.">
    <div class="space-y-2">
      <EntityCombobox
        v-model="localeInput"
        :options="LOCALE_OPTIONS"
        placeholder="Browser default"
      />
      <p class="font-fell text-xs text-muted-foreground">
        Preview: <span class="text-foreground">{{ localePreview }}</span>
      </p>
    </div>
  </SettingsSection>

  <!-- Keep screen awake -->
  <SettingsSection title="Screen" description="Useful during long sessions on a tablet.">
    <div class="flex items-center justify-between">
      <div>
        <p class="font-cinzel text-xs text-foreground tracking-wide">Keep screen awake</p>
        <p class="font-fell text-xs text-muted-foreground italic">
          <template v-if="wakeLockSupported">Prevents your device from sleeping while this page is open.</template>
          <template v-else>Not supported on this browser. Try Chrome or Safari 16.4+.</template>
        </p>
      </div>
      <button
        v-if="wakeLockSupported"
        type="button"
        class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
        :class="wakeLockEnabled ? 'bg-primary' : 'bg-muted'"
        role="switch"
        :aria-checked="wakeLockEnabled"
        @click="toggleWakeLock"
      >
        <span
          class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
          :class="wakeLockEnabled ? 'translate-x-5' : 'translate-x-0'"
        />
      </button>
      <span v-else class="text-label md:text-sm text-muted-foreground px-2 py-1 rounded border border-border">
        Unavailable
      </span>
    </div>
  </SettingsSection>

  <!-- Reload app -->
  <SettingsSection title="App" description="If something looks stuck or out of date, a full reload fixes it.">
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
      @click="reloadApp"
    >
      <IconReset class="h-3.5 w-3.5" />
      Reload app
    </button>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconReset } from "@/lib/icons";
import { useTheme } from "@/composables/useTheme";
import type { ThemeOverride } from "@/composables/useTheme";
import { useLocalePrefs } from "@/composables/useLocalePrefs";
import { useWakeLock } from "@/composables/useWakeLock";
import { formatChatTimestamp } from "@/lib/utils";

const { themeOverride, setOverride } = useTheme();
const currentOverride = themeOverride;

const THEME_OVERRIDE_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: "campaign", label: "Campaign" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const FALLBACK_LOCALES = [
  "en-US","en-GB","nl-NL","nl-BE","de-DE","fr-FR","fr-BE","es-ES","it-IT",
  "pt-PT","pt-BR","pl-PL","sv-SE","da-DK","fi-FI","nb-NO","ja-JP","ko-KR",
  "zh-CN","zh-TW",
];

function buildLocaleOptions(): { id: string; name: string }[] {
  let tags: string[];
  try {
    tags = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("locale");
  } catch {
    tags = FALLBACK_LOCALES;
  }
  const dn = new Intl.DisplayNames(undefined, { type: "language" });
  return tags
    .map(t => ({ id: t, name: dn.of(t) ?? t }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const LOCALE_OPTIONS = buildLocaleOptions();

const { chatLocale, setChatLocale } = useLocalePrefs();
const localeInput = ref(chatLocale.value);

watch(localeInput, val => setChatLocale(val));

const localePreview = computed(() =>
  formatChatTimestamp(new Date(Date.now() - 86_400_000).toISOString(), localeInput.value || undefined)
);

const { enabled: wakeLockEnabled, isSupported: wakeLockSupported, toggle: toggleWakeLock } = useWakeLock();

function reloadApp() { window.location.reload(); }
</script>

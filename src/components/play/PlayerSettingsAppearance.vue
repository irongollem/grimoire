<template>
  <!-- Theme override -->
  <SettingsSection title="Appearance" description="Your DM sets the campaign theme. Override it here if you prefer a different look.">
    <div class="flex items-center justify-between">
      <p class="font-cinzel text-xs text-foreground tracking-wide">Theme</p>
      <!-- The selected option used to be a solid bg-primary fill — one of the
           four rival "selected" treatments SegmentedControl exists to retire
           in favour of AppButton's gold `active` tint. -->
      <SegmentedControl
        :model-value="currentOverride"
        :options="THEME_OVERRIDE_OPTIONS"
        size="sm"
        class="shrink-0"
        @update:model-value="setOverride"
      />
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
      <p class="text-caption text-muted-foreground">
        Preview: <span class="text-foreground">{{ localePreview }}</span>
      </p>
    </div>
  </SettingsSection>

  <!-- Keep screen awake -->
  <SettingsSection title="Screen" description="Useful during long sessions on a tablet.">
    <div class="flex items-center justify-between">
      <div>
        <p class="font-cinzel text-xs text-foreground tracking-wide">Keep screen awake</p>
        <p class="text-caption text-muted-foreground italic">
          <template v-if="wakeLockSupported">Prevents your device from sleeping while this page is open.</template>
          <template v-else>Not supported on this browser. Try Chrome or Safari 16.4+.</template>
        </p>
      </div>
      <ToggleSwitch
        v-if="wakeLockSupported"
        size="lg"
        :model-value="wakeLockEnabled"
        aria-label="Keep screen awake"
        @update:model-value="toggleWakeLock"
      />
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
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
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

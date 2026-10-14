<template>
  <!-- Theme: the DM's list, plus following the campaign (#1059 era, 14 Oct 2026) -->
  <SettingsSection title="Appearance" description="Your DM chooses the campaign's look. Pick your own here, or follow the campaign.">
    <div class="flex flex-col gap-1.5" role="radiogroup" aria-label="Theme">
      <ThemeSwatchButton
        v-if="campaignTheme"
        :theme="campaignTheme"
        :label="`Follow campaign (${campaignTheme.label})`"
        :active="themeOverride === followCampaign"
        role="radio"
        :aria-checked="themeOverride === followCampaign"
        @select="setOverride(followCampaign)"
      />
      <ThemeSwatchButton
        v-for="theme in themes"
        :key="theme.id"
        :theme="theme"
        :active="themeOverride === theme.id"
        role="radio"
        :aria-checked="themeOverride === theme.id"
        @select="setOverride(theme.id)"
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
        <p class="text-label-lg text-foreground ">Keep screen awake</p>
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
      <span v-else class="text-label text-muted-foreground px-2 py-1 rounded border border-border">
        Unavailable
      </span>
    </div>
  </SettingsSection>

  <!-- Reload app -->
  <SettingsSection title="App" description="If something looks stuck or out of date, a full reload fixes it.">
    <AppButton variant="outline" size="sm" label="Reload app" :icon="IconReset" @click="reloadApp" />
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import SettingsSection from "@/components/common/settings/SettingsSection.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ThemeSwatchButton from "@/components/common/settings/ThemeSwatchButton.vue";
import { IconReset } from "@/lib/icons";
import { useTheme } from "@/composables/useTheme";
import { useLocalePrefs } from "@/composables/useLocalePrefs";
import { useWakeLock } from "@/composables/player/useWakeLock";
import { formatChatTimestamp } from "@/lib/utils";

const { themes, themeOverride, campaignThemeId, followCampaign, setOverride } = useTheme();
/** The campaign's own theme, drawn on the "Follow campaign" choice. */
const campaignTheme = computed(() => themes.find((t) => t.id === campaignThemeId.value) ?? null);

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

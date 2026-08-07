<template>
  <div class="min-h-screen bg-background p-6 flex flex-col gap-8">
    <header class="flex flex-wrap items-end gap-4 border-b border-border pb-4">
      <div class="mr-auto">
        <h1 class="text-title text-foreground">Component catalogue</h1>
        <p class="text-caption text-muted-foreground max-w-2xl">
          Every variant and size of the shared control primitives, rendered in the real app
          build. Dev-only — this route does not exist in production. Drive it headlessly with
          <code class="text-caption-sm">?theme=&lt;id&gt;</code>.
        </p>
      </div>
      <label class="flex items-center gap-2">
        <span class="text-eyebrow font-semibold text-muted-foreground">Theme</span>
        <AppSelect v-model="theme" size="md" aria-label="Theme">
          <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.label }}</option>
        </AppSelect>
      </label>
    </header>

    <!-- The matrix. Rows are variants, columns are sizes; both come from the
         enumerations in appButtonVariants.ts, which a compile-time assertion keeps
         in step with the cva config — so a new variant cannot go unrendered. -->
    <CatalogueSection
      title="AppButton — variant × size"
      note="Every cell is one button. A missing row or column means the enumeration and the cva config have diverged, which will not compile."
    >
      <div class="overflow-x-auto">
        <table class="border-separate border-spacing-3">
          <thead>
            <tr>
              <th class="text-eyebrow font-semibold text-muted-foreground text-left">variant</th>
              <th
                v-for="size in BUTTON_SIZES"
                :key="size"
                class="text-eyebrow font-semibold text-muted-foreground text-left"
              >{{ size }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="variant in BUTTON_VARIANTS" :key="variant">
              <th class="text-label font-semibold text-foreground text-left align-middle">
                {{ variant }}
              </th>
              <td v-for="size in BUTTON_SIZES" :key="size" class="align-middle">
                <!-- The icon-* sizes are fixed squares meant for a glyph alone;
                     giving them a label too would overflow the box and misrepresent
                     them. -->
                <AppButton
                  :variant="variant"
                  :size="size"
                  :icon="IconWand"
                  :label="isIconSize(size) ? undefined : 'Aa'"
                  :aria-label="isIconSize(size) ? `${variant} ${size}` : undefined"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </CatalogueSection>

    <CatalogueSection
      title="AppButton — states"
      note="`active` colours the border only on variants that draw one; on ghost/link/chip a border colour would paint nothing."
    >
      <div class="flex flex-col gap-3">
        <div v-for="variant in BUTTON_VARIANTS" :key="variant" class="flex flex-wrap items-center gap-2">
          <span class="text-label text-muted-foreground w-24 shrink-0">{{ variant }}</span>
          <AppButton :variant="variant" label="Default" />
          <AppButton :variant="variant" label="Active" active />
          <AppButton :variant="variant" label="Disabled" disabled />
          <AppButton :variant="variant" label="Loading" loading />
          <AppButton :variant="variant" label="Icon" :icon="IconWand" />
          <AppButton :variant="variant" label="Trailing" :icon-right="IconChevronRight" />
          <AppButton :variant="variant" size="icon-sm" aria-label="Icon only" :icon="IconWand" />
        </div>
      </div>
    </CatalogueSection>

    <CatalogueSection
      title="AppButton — label collapse"
      note="Resize the window across the sm (40rem) and lg (64rem) breakpoints. This is the behaviour that has regressed twice: a label that should stay visible silently disappearing, or an inline link gaining a box."
    >
      <div class="flex flex-wrap items-center gap-2">
        <AppButton label="Collapses below sm" :icon="IconWand" collapse-label-on-mobile />
        <AppButton
          label="Collapses below lg"
          :icon="IconWand"
          collapse-label-on-mobile
          collapse-below="lg"
        />
        <AppButton label="Short form below sm" :icon="IconWand" mobile-label="Short" />
        <AppButton label="Never collapses" :icon="IconWand" />
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <ListActionButton label="ListActionButton" :icon="IconWand" />
        <ListActionButton label="…primary" :icon="IconWand" variant="primary" />
        <PageHeaderAction label="PageHeaderAction" :icon="IconWand" />
        <PageHeaderAction label="…destructive" :icon="IconWand" variant="destructive" />
        <PageHeaderAction label="…never collapses" :collapse-label-on-mobile="false" />
      </div>
    </CatalogueSection>

    <CatalogueSection
      title="SegmentedControl"
      note="Roving focus: Tab reaches the group once, then the arrow keys move between options and wrap."
    >
      <div class="flex flex-col gap-3">
        <SegmentedControl v-model="segment" :options="SEGMENT_OPTIONS" size="xs" />
        <SegmentedControl v-model="segment" :options="SEGMENT_OPTIONS" size="sm" />
        <SegmentedControl v-model="segment" :options="SEGMENT_OPTIONS" size="md" />
        <SegmentedControl v-model="segment" :options="SEGMENT_OPTIONS" variant="ghost" />
        <SegmentedControl v-model="segment" :options="SEGMENT_OPTIONS" block />
        <!-- An option whose value is "" must stay selectable — treating it as a
             deselect made "All subraces" / "General — all campaigns" unreachable. -->
        <SegmentedControl v-model="emptyable" :options="EMPTY_VALUE_OPTIONS" />
        <SegmentedControl v-model="segment" :options="MANY_OPTIONS" wrap size="xs" />
      </div>
    </CatalogueSection>

    <CatalogueSection
      title="AppSelect"
      note="Shares fieldVariants with AppInput. Native picker with appearance:none — the caret is drawn by the base rule in main.css and follows the theme. Opening one still gives the OS menu, which is the point on mobile."
    >
      <div class="flex flex-wrap items-end gap-3">
        <label v-for="size in FIELD_SIZES" :key="size" class="flex flex-col gap-1">
          <span class="text-eyebrow font-semibold text-muted-foreground">{{ size }}</span>
          <AppSelect v-model="selectValue" :size="size" :aria-label="`Select ${size}`">
            <option value="a">Created</option>
            <option value="b">A much longer option label</option>
          </AppSelect>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-eyebrow font-semibold text-muted-foreground">ListFilterSelect</span>
          <ListFilterSelect v-model="selectValue" aria-label="Filter">
            <option value="a">Created</option>
            <option value="b">Updated</option>
          </ListFilterSelect>
        </label>
      </div>
    </CatalogueSection>

    <CatalogueSection title="AppInput" note="size × tone from fieldVariants — the same recipe AppSelect and EntityCombobox use. An input and a select at the same size must line up; the day/month/year row on the Dashboard is the case that matters.">
      <div class="flex flex-col gap-3">
        <div v-for="tone in FIELD_TONES" :key="tone" class="flex flex-wrap items-end gap-3">
          <span class="text-label text-muted-foreground w-16 shrink-0 self-center">{{ tone }}</span>
          <label v-for="size in FIELD_SIZES" :key="size" class="flex flex-col gap-1">
            <span class="text-eyebrow font-semibold text-muted-foreground">{{ size }}</span>
            <AppInput
              v-model="inputValue"
              :size="size"
              :tone="tone"
              placeholder="Placeholder"
              class="w-40"
            />
          </label>
          <AppInput v-model="numberValue" type="number" :tone="tone" align="center" class="w-20" />
        </div>
      </div>
    </CatalogueSection>
  </div>
</template>

<script setup lang="ts">
/**
 * /dev/components — the rendered matrix for the shared control primitives (#622).
 *
 * It exists because the two regressions that got through #620 were both visual and
 * both invisible to lint, typecheck and the unit tests: thirteen padding-free links
 * silently gained a box, and seven Save buttons silently lost their label. A grid
 * shows either at a glance.
 *
 * Dev-only and unauthenticated, matching SheetCalibrationView, so a headless
 * browser can screenshot it per theme via `?theme=<id>` without a login.
 */
import { computed, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { LocationQueryValue } from "vue-router";
import { IconWand, IconChevronRight } from "@/lib/icons";
import { useTheme } from "@/composables/useTheme";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import CatalogueSection from "./CatalogueSection.vue";
import {
  BUTTON_VARIANTS,
  BUTTON_SIZES,
  type ButtonSize,
} from "@/components/common/appButtonVariants";
import { FIELD_SIZES, FIELD_TONES } from "@/components/common/fieldVariants";

const SEGMENT_OPTIONS = [
  { value: "url", label: "URL" },
  { value: "upload", label: "Upload" },
  { value: "browse", label: "Browse" },
] as const;

const EMPTY_VALUE_OPTIONS = [
  { value: "", label: "General — all campaigns" },
  { value: "campaign", label: "This campaign" },
] as const;

const MANY_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
  value: `d${i}`,
  label: `Discipline ${i + 1}`,
}));

const isIconSize = (size: ButtonSize) => size.startsWith("icon-");


const segment = ref<string>("url");
const emptyable = ref<string>("campaign");
const selectValue = ref<string>("a");
const inputValue = ref<string | number | null>("Ancient Red Dragon");
const numberValue = ref<string | number | null>(12);

const route = useRoute();
const router = useRouter();
const { themes, setTheme, activeThemeId } = useTheme();

// Restore whatever the developer had before they opened this page: setTheme
// persists to localStorage, and a catalogue should not quietly repaint the app.
const themeOnEntry = activeThemeId.value;
onBeforeUnmount(() => setTheme(themeOnEntry));

function firstQuery(v: LocationQueryValue | LocationQueryValue[]): string | undefined {
  const val = Array.isArray(v) ? v[0] : v;
  return val ?? undefined;
}

const theme = computed<string>({
  get: () => firstQuery(route.query.theme) ?? activeThemeId.value,
  set: (id) => {
    setTheme(id);
    router.replace({ query: { ...route.query, theme: id } });
  },
});

// Apply a theme arriving by query string, so a headless pass gets what it asked for.
const requested = firstQuery(route.query.theme);
if (requested && requested !== activeThemeId.value) setTheme(requested);
</script>

<template>
  <!-- Renderless: this component only orchestrates the driver.js overlay,
       which driver.js mounts directly onto <body> once a tour starts. -->
</template>

<script setup lang="ts">
// First-run guided tours (#729). Mounted once in App.vue for the app's whole
// lifetime — see firstRunTours.ts for the mechanism this implements and the
// step definitions themselves.
import { nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import {
  TOUR_FLAG_KEY,
  parseTourFlag,
  tourTargetRouteName,
  firstAnchorSelector,
  buildTourSteps,
} from "@/lib/tours/firstRunTours";

const route = useRoute();

// True for the whole visible lifetime of a tour — set right before drive(),
// cleared only in onDestroyed (which fires on natural completion AND on
// skip/close alike). Separate from awaitingDom so a route bounce during the
// DOM-readiness wait can't kick off a second wait in parallel.
let tourActive = false;
let awaitingDom = false;

function readFlag(): string | null {
  try {
    return localStorage.getItem(TOUR_FLAG_KEY);
  } catch {
    return null; // storage disabled/unavailable — treat as "no tour pending"
  }
}

function clearFlag(): void {
  try {
    localStorage.removeItem(TOUR_FLAG_KEY);
  } catch {
    /* nothing to clear */
  }
}

// The first step's anchor is usually the heaviest widget on the target page
// (party list, character pool), so it doubles as an "is this route actually
// rendered yet" probe. ~2s across 8 tries, then give up silently — the flag
// stays set, so the next time this route is reached it tries again.
async function waitForFirstAnchor(selector: string): Promise<boolean> {
  await nextTick();
  const attempts = 8;
  const intervalMs = 250;
  for (let i = 0; i < attempts; i++) {
    if (document.querySelector(selector)) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  return document.querySelector(selector) !== null;
}

async function maybeStartTour(): Promise<void> {
  if (import.meta.env.SSR) return;
  if (tourActive || awaitingDom) return;

  const kind = parseTourFlag(readFlag());
  if (!kind) return;
  if (route.name !== tourTargetRouteName(kind)) return;

  awaitingDom = true;
  const found = await waitForFirstAnchor(firstAnchorSelector(kind));
  awaitingDom = false;

  // Re-check after the wait: another invocation may have started a tour, or
  // cleared the flag, while this one was polling the DOM.
  if (!found || tourActive || !parseTourFlag(readFlag())) return;

  const steps = buildTourSteps(kind);
  if (steps.length === 0) return;

  const [{ driver }] = await Promise.all([
    import("driver.js"),
    import("driver.js/dist/driver.css"),
  ]);
  tourActive = true;
  const tour = driver({
    showProgress: true,
    stagePadding: 8,
    steps,
    onPopoverRender: (popover) => {
      // The close (×) button is the "skip from anywhere" affordance driver.js
      // already gives every step for free (plus the default overlay-click-to-
      // close behaviour) — relabel it so it reads as one.
      popover.closeButton.textContent = "Skip";
      popover.closeButton.setAttribute("aria-label", "Skip tour");
    },
    onDestroyed: () => {
      clearFlag();
      tourActive = false;
    },
  });
  tour.drive();
}

watch(() => route.name, () => { void maybeStartTour(); }, { immediate: true });
</script>

<style>
/* driver.js appends the popover as a plain DOM node on <body>, outside this
   component's rendered tree — a `scoped` block's [data-v-x] attribute
   selectors would never reach it. Unscoped but still colocated here, rather
   than in a global stylesheet, since only this component's tours use it. */
.driver-popover {
  background-color: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  padding: 1rem;
}

.driver-popover-title {
  font-family: var(--font-cinzel);
  font-size: 1rem;
  font-weight: 700;
  color: var(--popover-foreground);
}

.driver-popover-description {
  font-family: var(--font-fell);
  font-size: 0.875rem;
  color: var(--muted-foreground);
  margin-top: 0.375rem;
}

.driver-popover-close-btn {
  width: auto;
  height: auto;
  padding: 0.25rem 0.5rem;
  font-family: var(--font-cinzel);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.driver-popover-close-btn:hover,
.driver-popover-close-btn:focus-visible {
  color: var(--foreground);
}

.driver-popover-footer {
  margin-top: 1rem;
}

.driver-popover-progress-text {
  font-family: var(--font-cinzel);
  font-size: 0.625rem;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

.driver-popover-footer-btn {
  font-family: var(--font-cinzel);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: var(--foreground);
  background-color: var(--secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.25rem 0.625rem;
}

.driver-popover-footer-btn:hover,
.driver-popover-footer-btn:focus-visible {
  background-color: var(--muted);
}

/* Each side rule sets only the ONE border driver.js's own rules leave
   un-transparent for that side — overriding the `.driver-popover-arrow`
   shorthand instead would race the cascade order against driver.css and
   could repaint all four sides instead of just the visible one. */
.driver-popover-arrow-side-left { border-left-color: var(--popover); }
.driver-popover-arrow-side-right { border-right-color: var(--popover); }
.driver-popover-arrow-side-top { border-top-color: var(--popover); }
.driver-popover-arrow-side-bottom { border-bottom-color: var(--popover); }
</style>

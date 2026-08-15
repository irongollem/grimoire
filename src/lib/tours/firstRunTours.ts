/**
 * First-run guided tours (#729) — driver.js step definitions plus the pure
 * logic around them (flag parsing, anchor filtering). The DOM-timing and
 * driver.js wiring itself lives in FirstRunTour.vue; this module holds
 * everything that can be unit-tested without a live driver instance.
 *
 * Mechanism: WelcomeView sets `localStorage[TOUR_FLAG_KEY]` to a TourKind
 * right before routing a brand-new account to its first real screen.
 * FirstRunTour.vue watches the route, and once it lands on that kind's
 * target route, starts the matching tour and clears the flag on finish.
 */
import type { DriveStep } from "driver.js";

export const TOUR_FLAG_KEY = "grimoire:tour-pending";

export type TourKind = "dm" | "player";

/** The named route each tour waits for before it's allowed to start. */
const TOUR_TARGET_ROUTE: Record<TourKind, string> = {
  dm: "dashboard",
  player: "play-home",
};

export function tourTargetRouteName(kind: TourKind): string {
  return TOUR_TARGET_ROUTE[kind];
}

/** Validates a raw localStorage read — anything else is treated as "no tour". */
export function parseTourFlag(raw: string | null): TourKind | null {
  return raw === "dm" || raw === "player" ? raw : null;
}

interface TourStepDef {
  /** CSS selector for the anchor element. Steps whose anchor never mounts
   *  (or renders with zero size, e.g. hidden behind a `sidenav:`/`barnav:`
   *  breakpoint) are dropped before the tour starts. */
  readonly selector: string;
  readonly title: string;
  readonly description: string;
}

// ── DM tour — lands on /dashboard ─────────────────────────────────────────
const DM_TOUR_STEPS: readonly TourStepDef[] = [
  {
    selector: '[data-tour="dm-party"]',
    title: "Your Party at a Glance",
    description: "Track HP, conditions, and passive scores for every hero without leaving the dashboard.",
  },
  {
    selector: '[data-tour="dm-quests"]',
    title: "Active Quests",
    description: "See what's in motion, and open any quest for the full story.",
  },
  {
    selector: '[data-tour="dm-session"]',
    title: "The Session Clock",
    description: "Advance the game day and set the party's current location as the story moves.",
  },
  {
    // AppSidebar's main nav — verified structural anchor (aside > nav), not a
    // data-tour attribute, since AppSidebar.vue belongs to a sibling agent.
    selector: "aside nav",
    title: "Chart Your Course",
    description: "Everything else — NPCs, encounters, notes, and more — lives in this navigation.",
  },
  {
    // The account-menu *trigger*, not the ModeToggle inside the popover — the
    // popover is closed while the tour runs, so its anchor would be filtered
    // out and the step silently dropped.
    selector: '[data-tour="account-menu"]',
    title: "Wearing Two Hats",
    description: "Click your name to switch between DM and Player mode — run one table, adventure at another.",
  },
];

// ── Player tour — lands on /play/home ─────────────────────────────────────
const PLAYER_TOUR_STEPS: readonly TourStepDef[] = [
  {
    selector: '[data-tour="character-pool"]',
    title: "Your Roster",
    description: "Every character you've created waits here, ready for a new adventure.",
  },
  {
    selector: '[data-tour="create-character"]',
    title: "Forge a New Hero",
    description: "Start here to build your next character from scratch.",
  },
  {
    selector: '[data-tour="player-campaigns"]',
    title: "Your Campaigns",
    description: "Jump back into any game you're already part of.",
  },
  {
    selector: '[data-tour="join-campaign"]',
    title: "Join the Party",
    description: "Got an invite link? Use this to join a Dungeon Master's campaign.",
  },
  {
    // Same as the DM tour: anchor the menu trigger, not the toggle hidden
    // inside the closed menu.
    selector: '[data-tour="account-menu"]',
    title: "Switch Hats",
    description: "This menu holds the DM/Player switch — become a Dungeon Master any time without losing your place here.",
  },
];

const TOUR_STEP_DEFS: Record<TourKind, readonly TourStepDef[]> = {
  dm: DM_TOUR_STEPS,
  player: PLAYER_TOUR_STEPS,
};

/** The anchor FirstRunTour.vue polls for before starting — see its
 *  waitForFirstAnchor(). Always the tour's first candidate step. */
export function firstAnchorSelector(kind: TourKind): string {
  return TOUR_STEP_DEFS[kind][0].selector;
}

/** An anchor only counts as usable once it's mounted AND rendered with real
 *  size — a `display: none` element behind the wrong sidenav/barnav
 *  breakpoint still matches querySelector, so presence alone isn't enough. */
export function isAnchorAvailable(selector: string, root: ParentNode = document): boolean {
  const el = root.querySelector(selector);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/** Drops steps whose anchor isn't available and maps the rest to driver.js's
 *  DriveStep shape. Pure given a DOM to query — no driver.js instance needed. */
export function filterAvailableSteps(defs: readonly TourStepDef[], root: ParentNode = document): DriveStep[] {
  return defs
    .filter((def) => isAnchorAvailable(def.selector, root))
    .map((def) => ({
      element: def.selector,
      popover: {
        title: def.title,
        description: def.description,
      },
    }));
}

export function buildTourSteps(kind: TourKind, root?: ParentNode): DriveStep[] {
  return filterAvailableSteps(TOUR_STEP_DEFS[kind], root);
}

/**
 * Global tooltip engine.
 *
 * Replaces native `title` tooltips with a single styled, multi-line popover
 * shared across the whole app. Components don't need to import or wire
 * anything — once `installTooltipEngine()` is called at boot, every element
 * with a `title` attribute (or `data-tooltip` set by the `v-tooltip`
 * directive) automatically gets the upgraded experience on hover, focus,
 * and touch long-press.
 *
 * Why a singleton DOM listener instead of per-component wrappers:
 * - Zero migration cost — existing `title="..."` attributes Just Work.
 * - One element in the DOM, one event listener, no per-component overhead.
 * - Trivial to add features (placement, colour, html content) in one place.
 *
 * Why we promote `title` → `data-tooltip` instead of leaving `title` alone:
 * the browser's own native tooltip would still fire after our delay, leading
 * to two tooltips. `MutationObserver` + the `v-tooltip` directive both move
 * the text to `data-tooltip` and remove `title` so only ours shows. The
 * original text is preserved on `aria-label` for screen readers.
 */

const HOVER_DELAY = 300;        // ms before showing on hover
const HIDE_FADE_MS = 120;       // visual fade-out
const LONG_PRESS_DELAY = 500;   // touch long-press
const VIEWPORT_MARGIN = 8;      // min gap from viewport edge

let popoverEl: HTMLDivElement | null = null;
let arrowEl: HTMLDivElement | null = null;
let activeEl: HTMLElement | null = null;
let showTimer: number | null = null;
let hideTimer: number | null = null;
let pressTimer: number | null = null;
let installed = false;

/** Find the nearest ancestor (including self) that carries tooltip text. */
function nearestTooltipElement(start: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = start;
  while (cur) {
    if (cur.dataset?.tooltip) return cur;
    if (cur.hasAttribute("title")) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function getTooltipText(el: HTMLElement): string {
  return el.dataset.tooltip ?? el.getAttribute("title") ?? "";
}

/** Promote `title` → `data-tooltip` so the native tooltip stays silent.
 *  Preserve the text on `aria-label` (if not already set) for a11y. */
function promoteTitle(el: HTMLElement) {
  const title = el.getAttribute("title");
  if (!title) return;
  el.dataset.tooltip = title;
  el.removeAttribute("title");
  if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) {
    el.setAttribute("aria-label", title);
  }
}

function ensurePopover(): HTMLDivElement {
  if (popoverEl) return popoverEl;
  popoverEl = document.createElement("div");
  popoverEl.setAttribute("role", "tooltip");
  popoverEl.className = "tw-tooltip";
  arrowEl = document.createElement("div");
  arrowEl.className = "tw-tooltip-arrow";
  popoverEl.appendChild(arrowEl);
  document.body.appendChild(popoverEl);
  return popoverEl;
}

/** Place the popover relative to `target`, with viewport-aware flipping. */
function position(target: HTMLElement, popover: HTMLDivElement) {
  const r = target.getBoundingClientRect();
  const pop = popover.getBoundingClientRect();

  // Prefer below; flip above if it would clip.
  let placeAbove = false;
  if (r.bottom + pop.height + 12 > window.innerHeight - VIEWPORT_MARGIN) {
    placeAbove = true;
  }

  const top = placeAbove
    ? Math.max(VIEWPORT_MARGIN, r.top - pop.height - 8)
    : Math.min(window.innerHeight - pop.height - VIEWPORT_MARGIN, r.bottom + 8);

  // Centre horizontally, clamp to viewport.
  const idealLeft = r.left + r.width / 2 - pop.width / 2;
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(window.innerWidth - pop.width - VIEWPORT_MARGIN, idealLeft),
  );

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  if (arrowEl) {
    // Arrow points TOWARDS the target, so it sits on the side facing the target.
    arrowEl.dataset.placement = placeAbove ? "bottom" : "top";
    const arrowLeft = Math.max(8, Math.min(pop.width - 8, r.left + r.width / 2 - left));
    arrowEl.style.left = `${arrowLeft}px`;
  }
}

function show(target: HTMLElement, text: string) {
  const popover = ensurePopover();
  popover.textContent = "";
  // Render multi-line text — split on \n so chip tooltips like
  // "Cond — click to remove\n\nFull rules…" come through legibly.
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) popover.appendChild(document.createElement("br"));
    popover.appendChild(document.createTextNode(lines[i]));
  }
  if (arrowEl) popover.appendChild(arrowEl);
  popover.classList.add("is-visible");
  // Position after the popover has natural dimensions.
  popover.style.top = "0px";
  popover.style.left = "0px";
  requestAnimationFrame(() => position(target, popover));
  activeEl = target;
}

function hide(immediate = false) {
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  activeEl = null;
  if (!popoverEl) return;
  if (immediate) {
    popoverEl.classList.remove("is-visible");
    return;
  }
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    popoverEl?.classList.remove("is-visible");
  }, 0);
}

function scheduleShow(target: HTMLElement) {
  if (showTimer) clearTimeout(showTimer);
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  const text = getTooltipText(target);
  if (!text) return;
  showTimer = window.setTimeout(() => show(target, text), HOVER_DELAY);
}

function onMouseOver(e: MouseEvent) {
  const target = nearestTooltipElement(e.target as HTMLElement | null);
  if (!target) { hide(); return; }
  if (target === activeEl) return;
  scheduleShow(target);
}

function onMouseOut(e: MouseEvent) {
  const related = e.relatedTarget as HTMLElement | null;
  // If we're moving into the popover itself, don't hide.
  if (related && popoverEl?.contains(related)) return;
  hide();
}

function onFocusIn(e: FocusEvent) {
  const target = nearestTooltipElement(e.target as HTMLElement | null);
  if (!target) return;
  // Skip the hover delay for keyboard users.
  if (showTimer) clearTimeout(showTimer);
  show(target, getTooltipText(target));
}

function onFocusOut() { hide(); }

function onScroll() { hide(true); }
function onResize() { hide(true); }

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") hide(true);
}

// ── Touch long-press ─────────────────────────────────────────────────────────
function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== "touch") return;
  const target = nearestTooltipElement(e.target as HTMLElement | null);
  if (!target) return;
  pressTimer = window.setTimeout(() => {
    show(target, getTooltipText(target));
    // Subsequent tap dismisses.
    document.addEventListener("pointerdown", () => hide(true), { once: true, capture: true });
  }, LONG_PRESS_DELAY);
}
function onPointerCancel() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}

// ── MutationObserver: promote any new `title` attributes ──────────────────────
function promoteAllTitles(root: ParentNode) {
  // Skip form controls — `title` on input/select/textarea has accessibility
  // weight (some screen readers expose it as the accessible name) and the
  // browser's tooltip is generally fine for those. Easy to relax later.
  const els = root.querySelectorAll<HTMLElement>(
    "[title]:not(input):not(select):not(textarea)",
  );
  els.forEach(promoteTitle);
}

function startMutationObserver() {
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "title" && m.target instanceof HTMLElement) {
        promoteTitle(m.target);
      } else if (m.type === "childList") {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) promoteAllTitles(n);
        });
      }
    }
  });
  obs.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["title"],
  });
  return obs;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function installTooltipEngine() {
  if (installed) return;
  installed = true;

  // Always promote `title` → `data-tooltip` so the browser's native tooltip
  // stays silent, but skip registering hover/touch listeners on touch-only
  // devices (phones, tablets) — tooltips are not useful there and a long-press
  // tooltip showing up unexpectedly is a poor UX on touch.
  promoteAllTitles(document.body);
  startMutationObserver();

  const isTouch = window.matchMedia("(hover: none)").matches;
  if (isTouch) return;

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointercancel", onPointerCancel, true);
  document.addEventListener("pointerup", onPointerCancel, true);
  document.addEventListener("keydown", onKeyDown, true);
  // Hide on scroll/resize because positions are stale and re-anchoring
  // mid-scroll feels worse than just dismissing.
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onResize);
}

/** Public for the directive — set the tooltip text on an element directly. */
export function setTooltipText(el: HTMLElement, text: string | undefined | null) {
  if (text === null || text === undefined || text === "") {
    delete el.dataset.tooltip;
    if (el.getAttribute("aria-label") === el.dataset.tooltip) {
      el.removeAttribute("aria-label");
    }
    return;
  }
  el.dataset.tooltip = text;
  if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) {
    el.setAttribute("aria-label", text);
  }
  // Always remove `title` so the native tooltip stays silent.
  el.removeAttribute("title");
}

void HIDE_FADE_MS;

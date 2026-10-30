// Runs in the filmed page before any app code (see stage.ts). Plain JS because
// it is browser code and the scripts' tsconfig has no DOM types. `stage.ts`
// defines `__promoArgs` ({ mode, campaignId, seed }) in front of this file.
(() => {
  const { mode, campaignId, seed } = window.__promoArgs;
  localStorage.setItem("grimoire:user-mode", JSON.stringify(mode));
  localStorage.setItem("grimoire_active_campaign", campaignId);
  localStorage.setItem(`grimoire_active_campaign_${mode}`, campaignId);
  localStorage.setItem("grimoire_dice_mode", "tool");

  // mulberry32: the app rolls with Math.random, so a fixed seed fixes the dice.
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // A viewer cannot see a tap, so a ring marks where the finger lands.
  const mark = (x, y) => {
    const dot = document.createElement("div");
    dot.style.cssText =
      `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;` +
      "background:rgba(255,255,255,0.35);border:3px solid rgba(40,30,20,0.55);pointer-events:none;z-index:2147483647;" +
      "transition:transform 450ms ease-out,opacity 450ms ease-out;transform:scale(0.6);opacity:1";
    document.documentElement.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = "scale(1.25)";
      dot.style.opacity = "0";
    });
    setTimeout(() => dot.remove(), 600);
  };
  window.addEventListener("pointerdown", (e) => mark(e.clientX, e.clientY), { capture: true, passive: true });

  // A screencast has no sound, so every sound the app plays through a media
  // element is reported (source and volume) for the assembler to mix back in.
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (window.__promoSound && !this.muted) window.__promoSound(this.currentSrc || this.src, this.volume);
    return play.call(this);
  };
})();

// The Voice-over tab. Plain browser JS: the scripts' tsconfig has no DOM types.
(() => {
  const { $, el, secs, sleep, notice, tab, createMic } = window.Promo;
  if (tab !== "voice") return;
  $("voice").hidden = false;
  const WORDS_PER_SECOND = 2.5;

  // The episode being worked on is the page address's ?episode=; every request names it.
  const EP = new URLSearchParams(location.search).get("episode");
  const withEp = (path) => `${path}${path.includes("?") ? "&" : "?"}episode=${encodeURIComponent(EP)}`;

  let episode = null;
  const cards = []; // { shot, root, video, count, state, actions, ... }
  let current = 0;

  // One recorder for the whole page: phase is idle | counting | recording | review.
  const rec = { phase: "idle", index: -1, chunks: [], timer: null, run: 0, source: null };

  // Opened once an episode is on the page; the picker records nothing.
  let mic = null;

  // ---------- cards ----------
  function targetSeconds(shot) {
    return shot.narration.trim().split(/\s+/).length / WORDS_PER_SECOND;
  }

  function buildCard(shot, i) {
    const video = el("video", { className: "clip", muted: true, playsInline: true, preload: "metadata", src: withEp(`/clip/${shot.id}`) });
    video.muted = true;
    const count = el("div", { className: "count" });
    const state = el("span", { className: "state" });
    const actions = el("div", { className: "actions" });
    const meta = el("div", { className: "meta" },
      el("span", { textContent: `Target ${secs(targetSeconds(shot))} (${shot.narration.trim().split(/\s+/).length} words)` }),
      el("span", { textContent: `Clip ${secs(shot.duration)}` }),
      state);
    const root = el("section", { className: "shot" },
      el("div", { className: "clipbox" }, video, count),
      el("div", {},
        el("div", { className: "num", textContent: `Shot ${i + 1} of ${episode.shots.length}` }),
        el("p", { className: "caption" }, "On screen: ", el("b", { textContent: shot.caption })),
        el("p", { className: "narration", textContent: shot.narration }),
        meta, actions));
    root.addEventListener("click", (e) => { if (!(e.target instanceof HTMLButtonElement)) select(i); });
    return { shot, root, video, count, state, actions, pending: null };
  }

  function button(label, onclick, cls = "") {
    return el("button", { type: "button", textContent: label, className: cls, onclick });
  }

  function render() {
    cards.forEach((c, i) => {
      const busy = rec.phase !== "idle" && rec.index === i;
      c.root.classList.toggle("current", i === current);
      c.root.classList.toggle("counting", busy && rec.phase === "counting");
      const take = c.shot.take;
      c.state.className = "state";
      if (busy && rec.phase === "recording") { c.state.textContent = "Recording"; c.state.classList.add("recording"); }
      else if (busy && rec.phase === "counting") c.state.textContent = "Get ready";
      else if (busy && rec.phase === "review") c.state.textContent = `New take ${secs(rec.seconds)}, not kept yet`;
      else if (take) {
        c.state.textContent = `Take ${secs(take.duration)} against clip ${secs(c.shot.duration)}`;
        c.state.classList.add("has");
      } else c.state.textContent = "No take";

      const free = rec.phase === "idle";
      const buttons = [];
      if (busy && rec.phase === "recording") buttons.push(button("Stop (Space)", stopTake, "rec"));
      else if (busy && rec.phase === "counting") buttons.push(button("Cancel", cancelTake));
      else if (busy && rec.phase === "review") {
        buttons.push(button("Keep (Enter)", keepTake, "primary"), button("Play again", playReview), button("Retake (R)", () => startTake(i)));
      } else {
        const b = button(take ? "Record again (Space)" : "Record (Space)", () => { select(i); startTake(i); }, take ? "" : "primary");
        b.disabled = !free || !mic.ready;
        buttons.push(b);
        if (take) {
          const p = button("Play take with clip", () => playSaved(i));
          p.disabled = !free;
          buttons.push(p);
        }
      }
      c.actions.replaceChildren(...buttons);
    });
  }

  function select(i) {
    if (rec.phase !== "idle" || i < 0 || i >= cards.length) return;
    current = i;
    cards[i].root.scrollIntoView({ block: "center", behavior: "smooth" });
    render();
  }

  // ---------- recording ----------
  function stopMedia() {
    if (rec.source) { try { rec.source.stop(); } catch { /* already stopped */ } rec.source = null; }
    for (const c of cards) { c.video.pause(); }
  }

  async function startTake(i) {
    if (!mic || !mic.ready) return;
    if (rec.phase === "recording") mic.end();
    rec.chunks = [];
    stopMedia();
    await mic.wake();
    current = i;
    rec.index = i;
    rec.phase = "counting";
    // A countdown that was cancelled and restarted inside one step must not carry on beside the new one.
    const run = ++rec.run;
    rec.chunks = [];
    const card = cards[i];
    card.root.scrollIntoView({ block: "center", behavior: "smooth" });
    card.video.currentTime = 0;
    for (const n of [3, 2, 1]) {
      card.count.textContent = String(n);
      render();
      await sleep(750);
      if (rec.run !== run) return;
    }
    card.video.currentTime = 0;
    rec.phase = "recording";
    mic.begin();
    card.video.play().catch(() => undefined);
    render();
  }

  function stopTake() {
    if (rec.phase !== "recording") return;
    rec.chunks = mic.end();
    stopMedia();
    rec.seconds = mic.seconds(rec.chunks);
    rec.phase = "review";
    render();
    playReview();
  }

  function cancelTake() {
    if (rec.phase === "idle") return;
    rec.run++;
    if (mic) mic.end();
    stopMedia();
    rec.phase = "idle";
    rec.index = -1;
    rec.chunks = [];
    render();
  }

  // Play the new take (an AudioBuffer, untrimmed) together with the clip.
  function playReview() {
    if (rec.phase !== "review" || !rec.chunks.length) return;
    stopMedia();
    const card = cards[rec.index];
    card.video.currentTime = 0;
    card.video.play().catch(() => undefined);
    rec.source = mic.play(rec.chunks);
  }

  function playSaved(i) {
    stopMedia();
    const card = cards[i];
    const audio = new Audio(withEp(`/take/${card.shot.id}?v=${Date.now()}`));
    card.video.currentTime = 0;
    card.video.play().catch(() => undefined);
    audio.play().catch(() => undefined);
    rec.source = { stop: () => audio.pause() };
  }

  async function keepTake() {
    if (rec.phase !== "review") return;
    const card = cards[rec.index];
    const pcm = mic.toInt16(rec.chunks);
    stopMedia();
    card.state.textContent = "Saving...";
    const res = await fetch(withEp(`/api/take/${encodeURIComponent(card.shot.id)}?rate=${mic.rate}`), {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: pcm.buffer,
    });
    const body = await res.json();
    if (!res.ok) { notice(`Saving failed: ${body.error || res.status}`); render(); return; }
    notice("");
    card.shot.take = { duration: body.duration };
    const index = rec.index;
    rec.phase = "idle";
    rec.index = -1;
    rec.chunks = [];
    render();
    select(Math.min(index + 1, cards.length - 1));
  }

  // ---------- keys ----------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement) return;
    const key = e.key;
    if (key === " ") {
      e.preventDefault();
      if (e.repeat) return;
      if (rec.phase === "recording") stopTake();
      else if (rec.phase === "idle") startTake(current);
      else if (rec.phase === "counting") cancelTake();
    } else if (key === "Enter" && rec.phase === "review") {
      e.preventDefault();
      keepTake();
    } else if ((key === "r" || key === "R") && (rec.phase === "review" || rec.phase === "idle")) {
      startTake(rec.phase === "review" ? rec.index : current);
    } else if (key === "Escape") {
      if (rec.phase === "review") { stopMedia(); rec.phase = "idle"; rec.index = -1; rec.chunks = []; render(); }
      else cancelTake();
    } else if (["ArrowLeft", "ArrowUp"].includes(key) && rec.phase === "idle") {
      e.preventDefault();
      select(current - 1);
    } else if (["ArrowRight", "ArrowDown"].includes(key) && rec.phase === "idle") {
      e.preventDefault();
      select(current + 1);
    }
  });

  // ---------- assemble ----------
  async function assemble() {
    const btn = $("assemble");
    const status = $("assemble-status");
    const log = $("assemble-log");
    const missing = cards.filter((c) => !c.shot.take).length;
    btn.disabled = true;
    log.hidden = true;
    $("reel").hidden = true;
    status.textContent = `Assembling${missing ? ` (${missing} shot${missing === 1 ? "" : "s"} without a take will play silent)` : ""}. This takes a minute or two...`;
    try {
      const res = await fetch(withEp("/api/assemble"), { method: "POST" });
      const body = await res.json();
      log.hidden = false;
      log.className = body.ok ? "" : "fail";
      log.textContent = body.tail || body.error || "";
      status.textContent = body.ok ? "The Reel is ready." : "Assembling failed.";
      if (body.ok) {
        const reel = $("reel");
        reel.src = withEp(`/reel?t=${Date.now()}`);
        reel.hidden = false;
      }
    } catch (e) {
      status.textContent = `Assembling failed: ${e}`;
    }
    btn.disabled = false;
  }

  // ---------- start ----------
  // ---------- choosing an episode ----------
  const progress = (e) => `${e.takes} of ${e.shots} takes${e.reel ? ", Reel built" : ""}`;

  function fillEpisodeMenu(list) {
    const menu = $("episode");
    menu.replaceChildren(
      el("option", { value: "", textContent: "Choose an episode..." }),
      ...list.map((e) => el("option", { value: e.id, textContent: `${e.title} (${e.account === "dm" ? "DM" : "player"})`, selected: e.id === EP })),
    );
    menu.addEventListener("change", () => {
      if (rec.phase !== "idle" && !confirmLeave()) { menu.value = EP ?? ""; return; }
      location.search = menu.value ? `?episode=${encodeURIComponent(menu.value)}` : "";
    });
  }

  // A take that is recording or waiting to be kept would be lost by switching.
  function confirmLeave() {
    notice("Finish or cancel the take you are on (Esc) before switching episodes.");
    return false;
  }

  function showPicker(list) {
    document.title = "Voice-over";
    $("subtitle").textContent = "Choose an episode to record";
    $("keys").hidden = true;
    $("footer").hidden = true;
    $("meter").hidden = true;
    $("meter-label").hidden = true;
    $("mic").hidden = true;
    const holder = $("shots");
    holder.className = "picker";
    if (list.length === 0) {
      holder.append(el("p", { className: "empty", textContent: "No recorded episodes yet. Film one with npm run promo:record -- <episode>." }));
      return;
    }
    for (const e of list) {
      const done = e.takes === e.shots;
      holder.append(
        el(
          "a",
          { className: `episode${done ? " done" : ""}`, href: `?episode=${encodeURIComponent(e.id)}` },
          el("span", { className: "who", textContent: e.account === "dm" ? "DM side" : "Player side" }),
          el("strong", { textContent: e.title }),
          el("span", { className: "progress", textContent: progress(e) }),
        ),
      );
    }
  }

  async function init() {
    const list = await (await fetch("/api/episodes")).json();
    fillEpisodeMenu(list);
    if (!list.some((e) => e.id === EP)) return showPicker(list);
    const res = await fetch(withEp("/api/episode"));
    episode = await res.json();
    document.title = `Voice-over: ${episode.title}`;
    $("title").firstChild.textContent = "Voice-over";
    $("subtitle").textContent = episode.title;
    const holder = $("shots");
    holder.style.display = "grid";
    holder.style.gap = "18px";
    episode.shots.forEach((s, i) => { const c = buildCard(s, i); cards.push(c); holder.append(c.root); });
    $("assemble").addEventListener("click", assemble);
    mic = createMic({
      beforeSwitch: () => { if (rec.phase === "recording" || rec.phase === "counting") cancelTake(); },
      onChange: render,
    });
    render();
    await mic.start();
  }
  init().catch((e) => notice(`Could not start: ${e}`));
})();

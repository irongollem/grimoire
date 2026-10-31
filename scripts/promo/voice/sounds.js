// The Sounds tab: record sound effects (a dice roll, a door, a page turn) as
// numbered takes of a name. Plain browser JS: the scripts' tsconfig has no DOM types.
(() => {
  const { $, el, secs, store, sleep, notice, tab, createMic } = window.Promo;
  if (tab !== "sounds") return;

  const NAME_KEY = "promo-sound-name";
  // The stop key's (or the mouse button's) own click lands in the last moments
  // of a take, after the sound has died away; this much is cut from the end.
  const TAIL_DROP_SECONDS = 0.25;

  $("sounds").hidden = false;
  $("episode").hidden = true;
  document.title = "Sounds";
  $("title").firstChild.textContent = "Sounds";
  $("subtitle").textContent = "Sound effects, kept as numbered takes";

  const nameBox = $("sound-name");
  nameBox.value = store.get(NAME_KEY) || "";
  nameBox.addEventListener("input", () => store.set(NAME_KEY, nameBox.value));

  // phase is idle | counting | recording | review | saving
  const rec = { phase: "idle", chunks: [], seconds: 0, run: 0, source: null, started: 0, ticker: null, last: null };
  let playing = null;

  const mic = createMic({
    beforeSwitch: () => { if (rec.phase === "recording" || rec.phase === "counting") cancel(); },
    onChange: render,
  });

  function button(label, onclick, cls = "") {
    return el("button", { type: "button", textContent: label, className: cls, onclick });
  }

  function stopPlayback() {
    if (rec.source) { try { rec.source.stop(); } catch { /* already stopped */ } rec.source = null; }
    if (playing) { playing.pause(); playing = null; }
  }

  function render() {
    const state = $("sound-state");
    state.classList.toggle("recording", rec.phase === "recording");
    if (rec.phase === "recording") state.textContent = `Recording ${secs((performance.now() - rec.started) / 1000)}`;
    else if (rec.phase === "review") state.textContent = `New take ${secs(rec.seconds)}, not kept yet`;
    else if (rec.phase === "saving") state.textContent = "Saving...";
    else if (rec.phase === "idle") state.textContent = rec.last ? `Kept ${rec.last.file} (${secs(rec.last.duration)})` : "Ready";

    const buttons = [];
    if (rec.phase === "idle") {
      const b = button("Record (Space)", start, "primary");
      b.disabled = !mic.ready;
      buttons.push(b);
    } else if (rec.phase === "counting") buttons.push(button("Cancel (Esc)", cancel));
    else if (rec.phase === "recording") buttons.push(button("Stop (Space)", stop, "rec"));
    else if (rec.phase === "review") {
      buttons.push(button("Keep (Enter)", keep, "primary"), button("Play again", review), button("Retake (R)", start), button("Discard (Esc)", discard));
    }
    $("sound-actions").replaceChildren(...buttons);
    $("sound-hint").textContent = "Each kept take is its own file, numbered after the last take of that name, so recording dice-roll five times gives five variants. Silence is trimmed from both ends.";
  }

  async function start() {
    if (!mic.ready) return;
    const name = nameBox.value.trim();
    if (!name) {
      notice("Name the sound first, for example dice-roll.");
      nameBox.focus();
      return;
    }
    notice("");
    if (rec.phase === "recording") mic.end();
    stopPlayback();
    await mic.wake();
    // A countdown that was cancelled and restarted inside one step must not carry on beside the new one.
    const run = ++rec.run;
    rec.phase = "counting";
    rec.chunks = [];
    rec.last = null;
    const state = $("sound-state");
    render();
    for (const n of [3, 2, 1]) {
      state.textContent = String(n);
      await sleep(750);
      if (rec.run !== run) return;
    }
    rec.phase = "recording";
    rec.started = performance.now();
    mic.begin();
    rec.ticker = setInterval(render, 100);
    render();
  }

  function stop() {
    if (rec.phase !== "recording") return;
    clearInterval(rec.ticker);
    rec.chunks = mic.end();
    rec.seconds = mic.seconds(rec.chunks);
    rec.phase = "review";
    render();
    review();
  }

  function cancel() {
    if (rec.phase === "idle") return;
    rec.run++;
    clearInterval(rec.ticker);
    mic.end();
    discard();
  }

  function discard() {
    stopPlayback();
    rec.phase = "idle";
    rec.chunks = [];
    render();
  }

  function review() {
    if (rec.phase !== "review" || !rec.chunks.length) return;
    stopPlayback();
    rec.source = mic.play(rec.chunks);
  }

  async function keep() {
    if (rec.phase !== "review") return;
    stopPlayback();
    const pcm = mic.toInt16(rec.chunks, TAIL_DROP_SECONDS);
    rec.phase = "saving";
    render();
    const name = encodeURIComponent(nameBox.value.trim());
    let body = {};
    let ok = false;
    try {
      const res = await fetch(`/api/sounds?name=${name}&rate=${mic.rate}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: pcm.buffer,
      });
      body = await res.json();
      ok = res.ok;
    } catch (e) {
      body = { error: String(e) };
    }
    if (!ok) {
      notice(`Saving failed: ${body.error || "unknown error"}`);
      rec.phase = "review";
      render();
      return;
    }
    notice("");
    rec.last = body;
    rec.phase = "idle";
    rec.chunks = [];
    render();
    await refresh();
  }

  // ---------- the saved list ----------
  function play(file) {
    stopPlayback();
    playing = new Audio(`/sound/${encodeURIComponent(file)}?v=${Date.now()}`);
    playing.play().catch(() => undefined);
  }

  async function remove(file) {
    if (!confirm(`Delete ${file}?`)) return;
    const res = await fetch(`/api/sounds/${encodeURIComponent(file)}`, { method: "DELETE" });
    if (!res.ok) notice(`Deleting failed: ${(await res.json()).error || res.status}`);
    await refresh();
  }

  async function refresh() {
    const { folder, sounds } = await (await fetch("/api/sounds")).json();
    $("reveal").title = folder;
    const holder = $("sound-list");
    if (sounds.length === 0) {
      holder.replaceChildren(el("p", { className: "empty", textContent: `Nothing recorded yet. Takes are saved in ${folder}.` }));
      return;
    }
    const groups = new Map();
    for (const s of sounds) groups.set(s.name, [...(groups.get(s.name) || []), s]);
    holder.replaceChildren(
      ...[...groups].map(([name, takes]) =>
        el("section", { className: "group" },
          el("div", { className: "take" },
            el("h3", { className: "file", textContent: `${name} (${takes.length} take${takes.length === 1 ? "" : "s"})` }),
            button("Record another", () => {
              nameBox.value = name;
              store.set(NAME_KEY, name);
              if (rec.phase === "idle") start();
            }, "quiet")),
          ...takes.map((t) =>
            el("div", { className: "take" },
              el("span", { className: "file", textContent: t.file }),
              el("span", { className: "dur", textContent: secs(t.duration) }),
              button("Play", () => play(t.file), "quiet"),
              button("Delete", () => remove(t.file), "quiet"))))),
    );
  }

  // ---------- keys ----------
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    if (e.target === nameBox) {
      if (key === "Enter" && rec.phase === "idle") {
        e.preventDefault();
        nameBox.blur();
        start();
      }
      return;
    }
    if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
    if (key === " ") {
      e.preventDefault();
      if (e.repeat) return;
      if (rec.phase === "recording") stop();
      else if (rec.phase === "idle") start();
      else if (rec.phase === "counting") cancel();
    } else if (key === "Enter" && rec.phase === "review") {
      e.preventDefault();
      keep();
    } else if ((key === "r" || key === "R") && (rec.phase === "review" || rec.phase === "idle")) {
      start();
    } else if (key === "Escape") {
      if (rec.phase === "review") discard();
      else cancel();
    }
  });

  $("reveal").addEventListener("click", () => fetch("/api/sounds/reveal", { method: "POST" }));

  render();
  refresh().catch((e) => notice(`Could not list the sounds: ${e}`));
  mic.start().then(render);
})();

// The recorder page. Plain browser JS: the scripts' tsconfig has no DOM types.
(() => {
  const WORDS_PER_SECOND = 2.5;
  const MIC_KEY = "promo-voice-mic";
  const $ = (id) => document.getElementById(id);

  const el = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const k of kids) node.append(k);
    return node;
  };
  const secs = (n) => (n === null || n === undefined ? "?" : `${n.toFixed(1)} s`);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } },
  };

  // The episode being worked on is the page address's ?episode=; every request names it.
  const EP = new URLSearchParams(location.search).get("episode");
  const withEp = (path) => `${path}${path.includes("?") ? "&" : "?"}episode=${encodeURIComponent(EP)}`;

  let episode = null;
  const cards = []; // { shot, root, video, count, state, actions, ... }
  let current = 0;

  // One recorder for the whole page: phase is idle | counting | recording | review.
  const rec = { phase: "idle", index: -1, chunks: [], timer: null, cancelled: false, source: null };

  // ---------- microphone ----------
  let ctx = null;
  let stream = null;
  let node = null;
  let peak = 0;
  let clipUntil = 0;

  const WORKLET = `
    class Tap extends AudioWorkletProcessor {
      constructor() { super(); this.on = false; this.peak = 0; this.n = 0; this.port.onmessage = (e) => { this.on = e.data; }; }
      process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (!ch) return true;
        for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > this.peak) this.peak = a; }
        if (this.on) this.port.postMessage({ pcm: ch.slice() });
        if (++this.n % 8 === 0) { this.port.postMessage({ peak: this.peak }); this.peak = 0; }
        return true;
      }
    }
    registerProcessor("tap", Tap);`;

  function notice(text) {
    const n = $("notice");
    n.hidden = !text;
    n.textContent = text || "";
  }

  async function listMics() {
    const sel = $("mic");
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    const want = store.get(MIC_KEY);
    const active = stream && stream.getAudioTracks()[0] && stream.getAudioTracks()[0].getSettings().deviceId;
    sel.replaceChildren(...devices.map((d, i) => el("option", { value: d.deviceId, textContent: d.label || `Microphone ${i + 1}` })));
    const pick = [active, want].find((id) => id && devices.some((d) => d.deviceId === id));
    if (pick) sel.value = pick;
  }

  async function openMic(deviceId) {
    if (rec.phase === "recording" || rec.phase === "counting") cancelTake();
    if (stream) for (const t of stream.getTracks()) t.stop();
    if (node) node.disconnect();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (e) {
      stream = null;
      notice(`The microphone could not be opened (${e && e.name ? e.name : e}). Allow it in the browser, or pick another input.`);
      await listMics().catch(() => undefined);
      return;
    }
    notice("");
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
    }
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    node = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (e) => {
      if (e.data.peak !== undefined) {
        peak = Math.max(peak, e.data.peak);
        if (e.data.peak >= 0.98) clipUntil = performance.now() + 1500;
      } else if (e.data.pcm && rec.phase === "recording") {
        rec.chunks.push(e.data.pcm);
      }
    };
    ctx.createMediaStreamSource(stream).connect(node);
    const id = stream.getAudioTracks()[0].getSettings().deviceId;
    if (id) store.set(MIC_KEY, id);
    await listMics();
  }

  // ---------- level meter ----------
  function drawMeter() {
    const db = peak > 0 ? 20 * Math.log10(peak) : -90;
    peak *= 0.85; // fall back between blocks
    const clipping = performance.now() < clipUntil;
    const meter = $("meter");
    const label = $("meter-label");
    $("meter-fill").style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
    meter.classList.toggle("clip", clipping);
    meter.classList.toggle("hot", !clipping && db > -12);
    label.classList.toggle("clip", clipping);
    label.textContent = !stream ? "No microphone" : clipping ? "Too loud, turn the gain down" : db < -70 ? "No signal" : `${Math.round(db)} dB`;
    requestAnimationFrame(drawMeter);
  }

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
        b.disabled = !free || !stream;
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function stopMedia() {
    if (rec.source) { try { rec.source.stop(); } catch { /* already stopped */ } rec.source = null; }
    for (const c of cards) { c.video.pause(); }
  }

  async function startTake(i) {
    if (!stream || !ctx) return;
    if (rec.phase === "review" || rec.phase === "recording") { rec.chunks = []; }
    stopMedia();
    if (ctx.state === "suspended") await ctx.resume();
    current = i;
    rec.index = i;
    rec.phase = "counting";
    rec.cancelled = false;
    rec.chunks = [];
    const card = cards[i];
    card.root.scrollIntoView({ block: "center", behavior: "smooth" });
    card.video.currentTime = 0;
    for (const n of [3, 2, 1]) {
      card.count.textContent = String(n);
      render();
      await sleep(750);
      if (rec.cancelled) return;
    }
    card.video.currentTime = 0;
    rec.chunks = [];
    rec.phase = "recording";
    node.port.postMessage(true);
    card.video.play().catch(() => undefined);
    render();
  }

  function stopTake() {
    if (rec.phase !== "recording") return;
    node.port.postMessage(false);
    stopMedia();
    const total = rec.chunks.reduce((n, c) => n + c.length, 0);
    rec.seconds = total / ctx.sampleRate;
    rec.phase = "review";
    render();
    playReview();
  }

  function cancelTake() {
    if (rec.phase === "idle") return;
    rec.cancelled = true;
    if (node) node.port.postMessage(false);
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
    const total = rec.chunks.reduce((n, c) => n + c.length, 0);
    const buf = ctx.createBuffer(1, total, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let at = 0;
    for (const c of rec.chunks) { data.set(c, at); at += c.length; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const card = cards[rec.index];
    card.video.currentTime = 0;
    card.video.play().catch(() => undefined);
    src.start();
    rec.source = src;
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

  function toInt16() {
    const total = rec.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Int16Array(total);
    let at = 0;
    for (const c of rec.chunks) {
      for (let i = 0; i < c.length; i++) {
        const s = Math.max(-1, Math.min(1, c[i]));
        out[at++] = s < 0 ? s * 32768 : s * 32767;
      }
    }
    return out;
  }

  async function keepTake() {
    if (rec.phase !== "review") return;
    const card = cards[rec.index];
    const pcm = toInt16();
    stopMedia();
    card.state.textContent = "Saving...";
    const res = await fetch(withEp(`/api/take/${encodeURIComponent(card.shot.id)}?rate=${ctx.sampleRate}`), {
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
    $("mic").addEventListener("change", (e) => openMic(e.target.value));
    navigator.mediaDevices.addEventListener("devicechange", () => listMics().catch(() => undefined));
    render();
    requestAnimationFrame(drawMeter);
    await openMic(store.get(MIC_KEY));
    render();
  }
  init().catch((e) => notice(`Could not start: ${e}`));
})();

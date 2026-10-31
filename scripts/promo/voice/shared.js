// What the recorder's two tabs share: small page helpers and the microphone
// with its level meter. Plain browser JS: the scripts' tsconfig has no DOM types.
window.Promo = (() => {
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function notice(text) {
    const n = $("notice");
    n.hidden = !text;
    n.textContent = text || "";
  }

  const tab = new URLSearchParams(location.search).get("tab") === "sounds" ? "sounds" : "voice";

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

  /**
   * The one microphone a tab records from, wired to the header's input menu
   * and level meter. `beforeSwitch` runs before another input opens (a take
   * in progress cannot survive it); `onChange` runs once one has opened or failed.
   */
  function createMic({ beforeSwitch, onChange }) {
    let ctx = null;
    let stream = null;
    let node = null;
    let peak = 0;
    let clipUntil = 0;
    let capturing = false;
    let chunks = [];

    async function list() {
      const sel = $("mic");
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      const want = store.get(MIC_KEY);
      const active = stream && stream.getAudioTracks()[0] && stream.getAudioTracks()[0].getSettings().deviceId;
      sel.replaceChildren(...devices.map((d, i) => el("option", { value: d.deviceId, textContent: d.label || `Microphone ${i + 1}` })));
      const pick = [active, want].find((id) => id && devices.some((d) => d.deviceId === id));
      if (pick) sel.value = pick;
    }

    async function open(deviceId) {
      beforeSwitch();
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
        await list().catch(() => undefined);
        onChange();
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
        } else if (e.data.pcm && capturing) {
          chunks.push(e.data.pcm);
        }
      };
      ctx.createMediaStreamSource(stream).connect(node);
      const id = stream.getAudioTracks()[0].getSettings().deviceId;
      if (id) store.set(MIC_KEY, id);
      await list();
      onChange();
    }

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

    const length = (cs) => cs.reduce((n, c) => n + c.length, 0);

    $("mic").addEventListener("change", (e) => open(e.target.value));
    navigator.mediaDevices.addEventListener("devicechange", () => list().catch(() => undefined));
    requestAnimationFrame(drawMeter);

    return {
      /** Opens the input used last time, or the default one. */
      start: () => open(store.get(MIC_KEY)),
      get ready() { return stream !== null && ctx !== null; },
      get rate() { return ctx ? ctx.sampleRate : 48000; },
      async wake() { if (ctx && ctx.state === "suspended") await ctx.resume(); },
      /** Starts keeping what the microphone hears. */
      begin() { chunks = []; capturing = true; if (node) node.port.postMessage(true); },
      /** Stops keeping it and hands over what was kept (Float32Array blocks). */
      end() {
        capturing = false;
        if (node) node.port.postMessage(false);
        const kept = chunks;
        chunks = [];
        return kept;
      },
      seconds: (cs) => (ctx ? length(cs) / ctx.sampleRate : 0),
      /** Plays kept blocks through the speakers; returns something with stop(). */
      play(cs) {
        const total = length(cs);
        const buf = ctx.createBuffer(1, Math.max(1, total), ctx.sampleRate);
        const data = buf.getChannelData(0);
        let at = 0;
        for (const c of cs) { data.set(c, at); at += c.length; }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
        return src;
      },
      /** The blocks as the 16-bit PCM the server stores, without the last `dropSeconds`. */
      toInt16(cs, dropSeconds = 0) {
        const total = Math.max(0, length(cs) - Math.round(dropSeconds * (ctx ? ctx.sampleRate : 48000)));
        const out = new Int16Array(total);
        let at = 0;
        for (const c of cs) {
          for (let i = 0; i < c.length && at < total; i++) {
            const s = Math.max(-1, Math.min(1, c[i]));
            out[at++] = s < 0 ? s * 32768 : s * 32767;
          }
        }
        return out;
      },
    };
  }

  // The tab bar: the address's ?tab= says which tab this page is.
  $(tab === "sounds" ? "tab-sounds" : "tab-voice").setAttribute("aria-current", "page");

  return { $, el, secs, store, sleep, notice, tab, createMic };
})();

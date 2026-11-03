// The Socials tab: every Reel's state, its caption and schedule, posting, and
// how recent posts are doing. Plain browser JS: the scripts' tsconfig has no DOM types.
(() => {
  const { $, el, store, notice, tab } = window.Promo;
  if (tab !== "socials") return;

  const SELECTED_KEY = "promo-socials-selected";
  const CAPTION_MAX = 2200;
  const HASHTAG_MAX = 30;
  const DAILY_LIMIT_FALLBACK = 100;
  const WRITE = { "x-promo-socials": "1" };

  document.body.classList.add("tab-socials");
  $("socials").hidden = false;
  document.title = "Socials";
  $("title").firstChild.textContent = "Socials";
  $("subtitle").textContent = "Queue, captions and schedule for @dungeongrimoire";

  let data = null;
  let selected = store.get(SELECTED_KEY);
  let busy = false;
  // Per-Reel messages, kept across re-renders: { text, fail }
  const messages = new Map();
  const problemsById = new Map();
  const drafts = new Map(); // unsaved caption edits

  const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const fmtWhen = (iso) => when.format(new Date(iso)).replace(",", "");
  const fmtDay = (iso) => day.format(new Date(iso));

  function button(label, onclick, cls = "") {
    return el("button", { type: "button", textContent: label, className: cls, onclick });
  }

  const pad = (n) => String(n).padStart(2, "0");

  /** A Date as `YYYY-MM-DDTHH:MM` in the browser's local time, for a datetime-local box. */
  function toLocalInput(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** The local input value as ISO with the browser's own offset, never a bare local string. */
  function toIsoWithOffset(local) {
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return null;
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    return `${toLocalInput(d)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  // 23:00 in Amsterdam is 17:00 in New York and 14:00 in Los Angeles: most of the audience is in the US.
  const SLOT_HOUR = 23;

  function nextFreeDay() {
    const latest = data.reels
      .filter((r) => r.scheduledAt && !r.posted)
      .map((r) => new Date(r.scheduledAt))
      .sort((a, b) => b - a)[0];
    const base = latest || new Date();
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, SLOT_HOUR, 0, 0);
    return d;
  }

  function status(reel) {
    if (reel.posted) return { cls: "posted", text: `Posted ${fmtDay(reel.posted.postedAt)}`, href: reel.posted.permalink };
    if (reel.problems.length) return { cls: "notready", text: `Not ready, ${reel.problems.length} problem${reel.problems.length === 1 ? "" : "s"}` };
    if (reel.scheduledAt) return { cls: "scheduled", text: `Scheduled ${fmtWhen(reel.scheduledAt)}` };
    return { cls: "ready", text: "Ready, not scheduled" };
  }

  const who = (reel) => (reel.account === "player" ? "Player" : "DM");
  const current = () => data.reels.find((r) => r.id === selected) || null;

  function coverEl(reel, cls = "soc-thumb") {
    if (reel.hasCover) {
      return el("img", { className: cls, alt: "", loading: "lazy", src: `/api/socials/cover?episode=${encodeURIComponent(reel.id)}` });
    }
    return el("div", { className: cls, textContent: "No cover" });
  }

  // ---------- account strip ----------
  function renderAccount() {
    const box = $("soc-account");
    const parts = [];
    const a = data.account;
    if (data.accountError || !a) {
      parts.push(el("span", { className: "err", textContent: data.accountError || "The Instagram account could not be read." }));
    } else {
      const left = Math.max(0, (a.quota.total || DAILY_LIMIT_FALLBACK) - a.quota.used);
      parts.push(
        el("span", { className: "handle", textContent: `@${a.username}` }),
        el("span", { className: "stat" }, el("b", { textContent: String(a.followers) }), " followers"),
        el("span", { className: "stat" }, el("b", { textContent: String(a.posts) }), " posts"),
        el("span", { className: "stat", textContent: `${left} of ${a.quota.total} posts left today` }),
      );
    }
    const on = data.scheduler.installed;
    parts.push(el("span", { className: `sched ${on ? "on" : "off"}`, textContent: on ? "Scheduler on" : "Scheduler off" }));
    if (!on) {
      const cmds = [
        "cp scripts/promo/launchd/nl.dungeongrimoire.promo-post.plist ~/Library/LaunchAgents/",
        "launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/nl.dungeongrimoire.promo-post.plist",
      ].join("\n");
      parts.push(el("div", { className: "install" },
        el("p", { textContent: "Scheduled Reels will not post until the scheduler is installed. Run these two commands:" }),
        el("pre", { textContent: cmds }),
        button("Copy commands", async (e) => {
          const b = e.currentTarget;
          try { await navigator.clipboard.writeText(cmds); b.textContent = "Copied"; } catch { b.textContent = "Select and copy by hand"; }
        }, "quiet")));
    }
    box.replaceChildren(...parts);
  }

  // ---------- queue ----------
  function renderQueue() {
    const list = $("soc-list");
    if (!data.reels.length) {
      list.replaceChildren(el("p", { className: "empty", textContent: "No Reels yet." }));
      return;
    }
    list.replaceChildren(...data.reels.map((r) => {
      const st = status(r);
      const row = el("button", { type: "button", className: "soc-row", role: "option", id: `soc-row-${r.id}` },
        coverEl(r),
        el("span", { className: "t" },
          el("strong", { textContent: r.title }),
          el("span", { className: "line" },
            el("span", { className: "badge", textContent: who(r) }),
            el("span", { className: `chip ${st.cls}`, textContent: st.text }))));
      row.setAttribute("aria-selected", String(r.id === selected));
      row.addEventListener("click", () => select(r.id));
      return row;
    }));
  }

  function select(id) {
    selected = id;
    store.set(SELECTED_KEY, id);
    renderQueue();
    renderDetail();
  }

  // ---------- detail ----------
  function counts(text) {
    const tags = (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    return { chars: [...text].length, tags };
  }

  function setMessage(id, text, fail = false) {
    messages.set(id, { text, fail });
    if (selected === id) {
      const box = $("soc-msg");
      if (box) { box.textContent = text; box.classList.toggle("fail", fail); }
    }
  }

  async function write(method, path, id, { json, text } = {}) {
    const headers = { ...WRITE };
    const init = { method, headers };
    if (json !== undefined) { headers["content-type"] = "application/json"; init.body = JSON.stringify(json); }
    else if (text !== undefined) { headers["content-type"] = "text/plain; charset=utf-8"; init.body = text; }
    const res = await fetch(`${path}?episode=${encodeURIComponent(id)}`, init);
    let out = {};
    try { out = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
    return out;
  }

  function renderDetail() {
    const holder = $("soc-detail");
    const reel = current();
    if (!reel) {
      holder.replaceChildren(el("p", { className: "empty", textContent: "Pick a Reel from the queue." }));
      return;
    }
    const st = status(reel);
    const locked = Boolean(reel.posted);
    const video = el("video", { controls: true, playsInline: true, preload: "metadata", src: `/reel?episode=${encodeURIComponent(reel.id)}` });
    if (reel.hasCover) video.poster = `/api/socials/cover?episode=${encodeURIComponent(reel.id)}`;
    if (!reel.hasVideo) video.hidden = true;

    const form = el("div", { className: "soc-form" },
      el("h3", { textContent: reel.title }),
      el("div", { className: "line" },
        el("span", { className: "badge", textContent: who(reel) }), " ",
        st.href
          ? el("a", { className: `chip ${st.cls}`, href: st.href, target: "_blank", rel: "noopener", textContent: st.text })
          : el("span", { className: `chip ${st.cls}`, textContent: st.text })));

    if (locked) {
      form.append(
        el("p", { className: "readonly-caption", textContent: reel.caption || "No caption." }),
        el("a", { href: reel.posted.permalink, target: "_blank", rel: "noopener", textContent: "Open on Instagram" }));
      holder.replaceChildren(el("div", {}, video), form);
      return;
    }

    // caption
    const area = el("textarea", { id: "soc-caption", value: drafts.has(reel.id) ? drafts.get(reel.id) : reel.caption || "", spellcheck: true });
    const counter = el("div", { className: "counter" });
    const problems = el("ul", { className: "problems", id: "soc-problems", hidden: true });
    const paintCounter = () => {
      const c = counts(area.value);
      counter.replaceChildren(
        el("span", { className: c.chars > CAPTION_MAX ? "over" : "", textContent: `${c.chars} of ${CAPTION_MAX} characters` }),
        el("span", { className: c.tags > HASHTAG_MAX ? "over" : "", textContent: `${c.tags} of ${HASHTAG_MAX} hashtags` }));
    };
    const paintProblems = (list) => {
      problems.replaceChildren(...list.map((p) => el("li", { textContent: p })));
      problems.hidden = list.length === 0;
    };
    paintCounter();
    paintProblems(problemsById.get(reel.id) || reel.problems);
    area.addEventListener("input", () => { drafts.set(reel.id, area.value); paintCounter(); });

    const saveBtn = button("Save caption", async () => {
      saveBtn.disabled = true;
      setMessage(reel.id, "Saving caption...");
      try {
        const out = await write("PUT", "/api/socials/caption", reel.id, { text: area.value });
        drafts.delete(reel.id);
        problemsById.set(reel.id, out.problems || []);
        setMessage(reel.id, "Caption saved.");
        await load();
      } catch (e) {
        setMessage(reel.id, `Saving failed: ${e.message}`, true);
        saveBtn.disabled = false;
      }
    }, "primary");

    // schedule
    const seed = reel.scheduledAt ? new Date(reel.scheduledAt) : nextFreeDay();
    const when = el("input", { type: "datetime-local", id: "soc-when", value: toLocalInput(seed) });
    const schedule = async (at, label) => {
      setMessage(reel.id, label);
      try {
        const out = await write("PUT", "/api/socials/schedule", reel.id, { json: { at } });
        setMessage(reel.id, out.scheduledAt ? `Scheduled for ${fmtWhen(out.scheduledAt)}.` : "Taken off the schedule.");
        await load();
      } catch (e) {
        setMessage(reel.id, `Scheduling failed: ${e.message}`, true);
      }
    };
    const submit = () => {
      const iso = toIsoWithOffset(when.value);
      if (!iso) { setMessage(reel.id, "Pick a date and time first.", true); return; }
      schedule(iso, "Scheduling...");
    };
    const scheduleRow = el("div", { className: "actions" },
      button(reel.scheduledAt ? "Move" : "Schedule", submit, reel.scheduledAt ? "" : "primary"),
      button(`Next free day, ${SLOT_HOUR}:00`, () => { when.value = toLocalInput(nextFreeDay()); }, "quiet"));
    if (reel.scheduledAt) scheduleRow.append(button("Unschedule", () => schedule(null, "Unscheduling..."), "quiet"));

    // post now
    const postBtn = button("Post now", async () => {
      if (!confirm(`Post "${reel.title}" to @dungeongrimoire now? It goes public on Instagram immediately.`)) return;
      busy = true;
      postBtn.disabled = true;
      setMessage(reel.id, "Posting. This can take a minute or two, keep this page open...");
      try {
        const out = await write("POST", "/api/socials/post", reel.id);
        const link = out.posted && out.posted.permalink;
        busy = false;
        await load();
        setMessage(reel.id, link ? `Posted: ${link}` : "Posted.");
        if (link) {
          const box = $("soc-msg");
          if (box) box.replaceChildren("Posted: ", el("a", { href: link, target: "_blank", rel: "noopener", textContent: link }));
        }
      } catch (e) {
        busy = false;
        setMessage(reel.id, `Posting failed: ${e.message}`, true);
        postBtn.disabled = reel.problems.length > 0;
      }
    }, "rec");
    postBtn.disabled = busy || reel.problems.length > 0 || !reel.hasVideo;
    postBtn.title = reel.problems.length ? "Fix the problems first" : "";

    const msg = messages.get(reel.id);
    form.append(
      el("label", { htmlFor: "soc-caption" }, "Caption", area),
      counter,
      problems,
      el("div", { className: "actions" }, saveBtn),
      el("label", { htmlFor: "soc-when" }, "Post at (your local time)", when),
      scheduleRow,
      el("div", { className: "actions" }, postBtn),
      el("div", { id: "soc-msg", className: `soc-status${msg && msg.fail ? " fail" : ""}`, "aria-live": "polite", textContent: msg ? msg.text : "" }));
    holder.replaceChildren(el("div", {}, video), form);
  }

  // ---------- recent ----------
  function renderRecent() {
    const holder = $("soc-recent");
    if (!data.recent.length) {
      holder.replaceChildren(el("p", { className: "empty", textContent: "Nothing to show yet." }));
      return;
    }
    holder.replaceChildren(...data.recent.map((p) => {
      const stats = [];
      if (p.likes !== null && p.likes !== undefined) stats.push(`${p.likes} likes`);
      if (p.comments !== null && p.comments !== undefined) stats.push(`${p.comments} comments`);
      return el("a", { className: "soc-post", href: p.permalink, target: "_blank", rel: "noopener" },
        p.thumbnail ? el("img", { src: p.thumbnail, alt: "", loading: "lazy" }) : el("div", { className: "soc-thumb", textContent: "No picture" }),
        el("span", { textContent: fmtDay(p.timestamp) }),
        stats.length ? el("span", { textContent: stats.join(", ") }) : "");
    }));
  }

  // ---------- load ----------
  async function load() {
    const res = await fetch("/api/socials");
    if (!res.ok) throw new Error(`The server answered ${res.status}`);
    data = await res.json();
    if (!data.reels.some((r) => r.id === selected)) {
      selected = data.reels.length ? data.reels[0].id : null;
      if (selected) store.set(SELECTED_KEY, selected);
    }
    renderAccount();
    renderQueue();
    renderDetail();
    renderRecent();
  }

  // Arrow keys move through the queue.
  $("soc-list").addEventListener("keydown", (e) => {
    if (!data || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    const i = data.reels.findIndex((r) => r.id === selected);
    const next = data.reels[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    select(next.id);
    const row = $(`soc-row-${next.id}`);
    if (row) row.focus();
  });

  load().catch((e) => notice(`Could not load the socials: ${e.message || e}`));
})();

// Festival 8-Ball — decide what to go see.
"use strict";

const state = {
  data: null,
  activeDay: null,
  activeStages: new Set(), // empty = all
  motionEnabled: false,
  mode: "single", // "single" | "plan"
  mustSee: new Set(), // keys of locked-in acts, across all days
};

const $ = (id) => document.getElementById(id);
const setKey = (s) => `${s.day}|${s.stage}|${s.start}|${s.artist}`;
const TRANSITION_MIN = 5; // walking buffer between stages

// ---------- Time helpers ----------
// Sets are stored as HH:MM. We compare in minutes-since-midnight, treating
// times before ~06:00 as "next day" so late-night sets (e.g. 23:59) sort late
// and an after-midnight set would still land after the evening ones.
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  let mins = h * 60 + m;
  if (h < 6) mins += 24 * 60; // early-morning = part of the previous night
  return mins;
}

function nowMinutes() {
  const d = new Date();
  let mins = d.getHours() * 60 + d.getMinutes();
  if (d.getHours() < 6) mins += 24 * 60;
  return mins;
}

function fmt12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ---------- Data ----------
async function loadData() {
  const res = await fetch("schedule.json");
  const json = await res.json();
  state.data = json.festival;
  $("festivalName").textContent = state.data.name;

  // Default day: today's date (local) if it matches a festival day, else first day.
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const match = state.data.days.find((d) => d.date === todayISO);
  state.activeDay = match ? match.id : state.data.days[0].id;

  renderDayTabs();
  renderStageFilter();
}

// ---------- Rendering ----------
function renderDayTabs() {
  const el = $("dayTabs");
  el.innerHTML = "";
  state.data.days.forEach((d) => {
    const b = document.createElement("button");
    b.textContent = d.label;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(d.id === state.activeDay));
    b.onclick = () => {
      state.activeDay = d.id;
      renderDayTabs();
      updateMustBtn();
      $("result").hidden = true;
      $("plan").hidden = true;
    };
    el.appendChild(b);
  });
}

function renderStageFilter() {
  const el = $("stageFilter");
  el.innerHTML = "";
  const all = document.createElement("button");
  all.textContent = "All stages";
  all.className = state.activeStages.size === 0 ? "active" : "";
  all.onclick = () => {
    state.activeStages.clear();
    renderStageFilter();
  };
  el.appendChild(all);

  state.data.stages.forEach((s) => {
    const b = document.createElement("button");
    b.textContent = s.name;
    b.className = state.activeStages.has(s.id) ? "active" : "";
    b.onclick = () => {
      if (state.activeStages.has(s.id)) state.activeStages.delete(s.id);
      else state.activeStages.add(s.id);
      renderStageFilter();
    };
    el.appendChild(b);
  });
}

// ---------- Core: who is playing at the target time ----------
function targetMinutes() {
  if ($("nowToggle").checked) return nowMinutes();
  const v = $("timePicker").value; // "HH:MM"
  if (!v) return nowMinutes();
  return toMinutes(v);
}

function stageName(id) {
  const s = state.data.stages.find((x) => x.id === id);
  return s ? s.name : id;
}

function playingNow() {
  const t = targetMinutes();
  return state.data.sets.filter((set) => {
    if (set.day !== state.activeDay) return false;
    if (state.activeStages.size && !state.activeStages.has(set.stage)) return false;
    const start = toMinutes(set.start);
    const end = toMinutes(set.end);
    return t >= start && t < end;
  });
}

// Next sets to start (used when nothing is playing right now).
function upcoming() {
  const t = targetMinutes();
  return state.data.sets
    .filter((set) => {
      if (set.day !== state.activeDay) return false;
      if (state.activeStages.size && !state.activeStages.has(set.stage)) return false;
      return toMinutes(set.start) > t;
    })
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

// ---------- Reveal ----------
let busy = false;
function decide() {
  if (busy) return;
  busy = true;

  const ball = $("ball");
  const triangle = $("triangle");
  ball.classList.remove("shaking");
  void ball.offsetWidth; // reflow to restart animation
  ball.classList.add("shaking");
  triangle.classList.add("fade");
  $("ballText").textContent = "…";
  vibrate([15, 40, 15]);

  setTimeout(() => {
    if (state.mode === "plan") {
      triangle.classList.remove("fade");
      const plan = buildPlan();
      $("ballText").textContent = plan.timeline.length ? "PLANNED" : "NO SETS";
      renderPlan(plan);
      busy = false;
      return;
    }

    const options = playingNow();
    let pick, others, note;

    if (options.length) {
      pick = options[Math.floor(Math.random() * options.length)];
      others = options.filter((o) => o !== pick);
      note = null;
    } else {
      const soon = upcoming();
      if (soon.length) {
        const nextStart = soon[0].start;
        const nextBatch = soon.filter((s) => s.start === nextStart);
        pick = nextBatch[Math.floor(Math.random() * nextBatch.length)];
        others = soon.filter((s) => s !== pick).slice(0, 5);
        note = `Nothing on right now — next up at ${fmt12(nextStart)}`;
      } else {
        pick = null;
      }
    }

    triangle.classList.remove("fade");
    if (pick) {
      $("ballText").textContent = pick.artist;
      showResult(pick, others, note);
    } else {
      $("ballText").textContent = "NO SETS";
      showEmpty();
    }
    busy = false;
  }, 650);
}

function showResult(pick, others, note) {
  $("result").hidden = false;
  $("resArtist").textContent = pick.artist;
  $("resStage").textContent = stageName(pick.stage);
  $("resTime").textContent = `${fmt12(pick.start)}–${fmt12(pick.end)}`;
  $("resGenre").textContent = pick.genre || "";
  $("hint").textContent = note || "Not feeling it? Ask again.";

  const list = $("others");
  list.hidden = true;
  list.innerHTML = "";
  (others || []).forEach((o) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${o.artist}</span><span class="o-stage">${stageName(o.stage)} · ${fmt12(o.start)}</span>`;
    list.appendChild(li);
  });
  $("othersBtn").style.display = others && others.length ? "" : "none";
}

function showEmpty() {
  $("result").hidden = false;
  $("resArtist").textContent = "Nobody's on";
  $("resStage").textContent = "";
  $("resTime").textContent = "";
  $("resGenre").textContent = "Try another day or clear your stage filter.";
  $("hint").textContent = "The festival's asleep.";
  $("othersBtn").style.display = "none";
  $("others").hidden = true;
}

// ---------- Plan my evening ----------
function stageAllowed(s) {
  return !state.activeStages.size || state.activeStages.has(s.stage);
}

// Build a conflict-free itinerary from the target time to end of day.
// Must-sees are locked at their real times; gaps are filled greedily with
// randomly chosen non-overlapping sets so each re-roll differs.
function buildPlan() {
  const start = targetMinutes();
  const daySets = state.data.sets.filter(
    (s) => s.day === state.activeDay && stageAllowed(s) && toMinutes(s.end) > start
  );

  const musts = daySets
    .filter((s) => state.mustSee.has(setKey(s)))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  // Flag must-sees that overlap each other — we still show both, but warn.
  const clashes = [];
  for (let i = 1; i < musts.length; i++) {
    if (toMinutes(musts[i].start) < toMinutes(musts[i - 1].end)) {
      clashes.push([musts[i - 1], musts[i]]);
    }
  }

  const dayEnd = Math.max(...daySets.map((s) => toMinutes(s.end)), start);
  const chosen = new Set(musts.map(setKey));
  const timeline = musts.map((m) => ({ ...m, must: true }));

  // Segments: from planStart up to each must, then after the last must.
  // isMust segments need a walking buffer before the locked act.
  const segs = [];
  let cur = start;
  for (const m of musts) {
    segs.push([cur, toMinutes(m.start), true]);
    cur = toMinutes(m.end) + TRANSITION_MIN; // leave time to walk away from a must-see
  }
  segs.push([cur, dayEnd + 1, false]);

  for (const [segStart, segEnd, isMust] of segs) {
    let cursor = segStart;
    const limit = isMust ? segEnd - TRANSITION_MIN : segEnd;
    while (true) {
      const cands = daySets.filter((s) => {
        if (chosen.has(setKey(s))) return false;
        const st = toMinutes(s.start);
        const en = toMinutes(s.end);
        return st >= cursor && en <= limit;
      });
      if (!cands.length) break;
      // Prefer earliest-ending (packs in more shows), but keep variety by
      // picking randomly among those ending within 30 min of the earliest.
      cands.sort((a, b) => toMinutes(a.end) - toMinutes(b.end));
      const earliest = toMinutes(cands[0].end);
      const pool = cands.filter((c) => toMinutes(c.end) <= earliest + 30);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      timeline.push({ ...pick, must: false });
      chosen.add(setKey(pick));
      cursor = toMinutes(pick.end) + TRANSITION_MIN;
    }
  }

  timeline.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return { timeline, clashes };
}

function renderPlan(plan) {
  $("plan").hidden = false;
  const list = $("timeline");
  list.innerHTML = "";
  const mustCount = plan.timeline.filter((s) => s.must).length;

  if (!plan.timeline.length) {
    $("planHead").textContent = "Nothing to plan";
    $("planWarn").hidden = true;
    const li = document.createElement("li");
    li.className = "stop";
    li.innerHTML = `<div class="stop-artist">No sets left</div><div class="stop-stage">Try an earlier time, another day, or clear your stage filter.</div>`;
    list.appendChild(li);
    return;
  }

  $("planHead").textContent = `Your evening — ${plan.timeline.length} stops${mustCount ? ` · ${mustCount} must-see${mustCount > 1 ? "s" : ""}` : ""}`;

  if (plan.clashes.length) {
    $("planWarn").hidden = false;
    $("planWarn").innerHTML =
      "⚠ Must-see clash: " +
      plan.clashes
        .map(([a, b]) => `<b>${a.artist}</b> overlaps <b>${b.artist}</b>`)
        .join("; ") +
      ". Both are shown — you'll have to pick one.";
  } else {
    $("planWarn").hidden = true;
  }

  let prevEnd = null;
  plan.timeline.forEach((s) => {
    const gap = prevEnd != null ? toMinutes(s.start) - prevEnd : 0;
    if (gap >= 20) {
      const g = document.createElement("li");
      g.className = "stop-gap";
      g.textContent = `↓ ${gap} min break`;
      list.appendChild(g);
    }
    const li = document.createElement("li");
    li.className = "stop" + (s.must ? " must" : "");
    li.innerHTML = `
      <div class="stop-time">${fmt12(s.start)}–${fmt12(s.end)}</div>
      <div class="stop-main"><span class="stop-artist">${s.artist}</span>${s.must ? '<span class="star">★ must-see</span>' : ""}</div>
      <div class="stop-stage">${stageName(s.stage)}</div>`;
    list.appendChild(li);
    prevEnd = toMinutes(s.end);
  });
}

// ---------- Must-see picker ----------
function renderLineup() {
  const wrap = $("lineupList");
  wrap.innerHTML = "";
  $("mustDayLabel").textContent = `(${state.data.days.find((d) => d.id === state.activeDay).label})`;
  const byStage = {};
  state.data.sets
    .filter((s) => s.day === state.activeDay)
    .forEach((s) => (byStage[s.stage] = byStage[s.stage] || []).push(s));

  state.data.stages.forEach((st) => {
    const acts = (byStage[st.id] || []).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    if (!acts.length) return;
    const h = document.createElement("div");
    h.className = "stage-group";
    h.textContent = st.name;
    wrap.appendChild(h);
    acts.forEach((s) => {
      const on = state.mustSee.has(setKey(s));
      const row = document.createElement("div");
      row.className = "act" + (on ? " on" : "");
      row.innerHTML = `
        <div class="a-info">
          <span class="a-name">${s.artist}</span>
          <span class="a-meta">${fmt12(s.start)}–${fmt12(s.end)}</span>
        </div>
        <div class="a-star">${on ? "★" : "☆"}</div>`;
      row.onclick = () => {
        const k = setKey(s);
        if (state.mustSee.has(k)) state.mustSee.delete(k);
        else state.mustSee.add(k);
        renderLineup();
        updateMustBtn();
      };
      wrap.appendChild(row);
    });
  });
}

function updateMustBtn() {
  const n = [...state.mustSee].filter((k) => k.startsWith(state.activeDay + "|")).length;
  $("mustBtn").textContent = `★ Choose must-sees (${n})`;
}

function vibrate(pattern) {
  if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {}
}

// ---------- Shake detection ----------
let lastShake = 0;
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
  // Gravity baseline ~9.8; a firm shake spikes well past ~22.
  if (mag > 22) {
    const now = Date.now();
    if (now - lastShake > 1200) {
      lastShake = now;
      decide();
    }
  }
}

async function enableMotion() {
  const status = $("motionStatus");
  const needsPermission =
    typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function";
  try {
    if (needsPermission) {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== "granted") {
        status.textContent = "Motion permission denied — tap the ball instead.";
        return;
      }
    }
    window.addEventListener("devicemotion", onMotion, { passive: true });
    state.motionEnabled = true;
    status.textContent = "Shake detection on. Give your phone a shake!";
    $("hint").textContent = "Shake your phone — or tap the ball";
  } catch (err) {
    status.textContent = "Couldn't enable motion on this device — tap the ball instead.";
  }
}

// ---------- Wiring ----------
function setMode(mode) {
  state.mode = mode;
  [...$("modeTabs").children].forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === mode)
  );
  const plan = mode === "plan";
  $("mustRow").hidden = !plan;
  $("result").hidden = true;
  $("plan").hidden = true;
  $("nowLabel").textContent = plan ? "Start from now" : "Use current time";
  $("ballText").textContent = plan ? "PLAN" : "SHAKE";
  $("hint").textContent = plan
    ? "Shake to build your evening — or tap the ball"
    : "Shake your phone — or tap the ball";
}

function init() {
  $("nowToggle").addEventListener("change", (e) => {
    $("timePicker").disabled = e.target.checked;
    if (!e.target.checked && !$("timePicker").value) {
      const d = new Date();
      $("timePicker").value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  });

  $("ball").addEventListener("click", decide);
  $("ball").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); decide(); }
  });
  $("againBtn").addEventListener("click", decide);
  $("othersBtn").addEventListener("click", () => {
    const list = $("others");
    list.hidden = !list.hidden;
  });

  $("modeTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) setMode(b.dataset.mode);
  });

  const openMust = () => { renderLineup(); $("mustSheet").hidden = false; };
  $("mustBtn").addEventListener("click", openMust);
  $("editMustBtn").addEventListener("click", openMust);
  $("closeMust").addEventListener("click", () => { $("mustSheet").hidden = true; });
  $("mustSheet").addEventListener("click", (e) => {
    if (e.target === $("mustSheet")) $("mustSheet").hidden = true;
  });
  $("rerollBtn").addEventListener("click", decide);

  $("settingsBtn").addEventListener("click", () => { $("settingsSheet").hidden = false; });
  $("closeSheet").addEventListener("click", () => { $("settingsSheet").hidden = true; });
  $("settingsSheet").addEventListener("click", (e) => {
    if (e.target === $("settingsSheet")) $("settingsSheet").hidden = true;
  });
  $("enableMotion").addEventListener("click", enableMotion);

  loadData();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);

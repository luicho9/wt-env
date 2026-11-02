(() => {
  const FLAG = "wtenv-clip";
  const LOG = "wtenv-clip-events";
  const CHANGE_THROTTLE_MS = 200;
  const PILL_MS = 1200;

  if (window.__wtenvClip) return;

  const active = () => localStorage.getItem(FLAG) === "on";
  const readLog = () => JSON.parse(localStorage.getItem(LOG) || "[]");
  let pending = [];
  let flushTimer = null;
  let lastChange = 0;
  let root = null;
  let pill = null;
  let pillTimer = null;
  let observer = null;

  const flush = () => {
    flushTimer = null;
    if (!pending.length) return;
    const log = readLog();
    log.push(...pending);
    pending = [];
    localStorage.setItem(LOG, JSON.stringify(log));
  };

  const record = (kind, extra = {}) => {
    if (!active()) return;
    pending.push({ t: Date.now(), kind, ...extra });
    if (!flushTimer) flushTimer = setTimeout(flush, 100);
  };

  const ensureRoot = () => {
    if (root || !document.documentElement) return;
    root = document.createElement("div");
    root.setAttribute("data-wtenv-clip", "");
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden";
    pill = document.createElement("div");
    pill.style.cssText =
      "position:absolute;left:50%;bottom:28px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(17,17,17,.82);color:#fff;font:600 14px/1.2 system-ui,sans-serif;opacity:0;transition:opacity 150ms";
    root.append(pill);
    document.documentElement.append(root);
  };

  const removeRoot = () => {
    root?.remove();
    root = pill = null;
  };

  const showPill = (text) => {
    if (!pill) return;
    pill.textContent = text;
    pill.style.opacity = "1";
    clearTimeout(pillTimer);
    pillTimer = setTimeout(() => pill && (pill.style.opacity = "0"), PILL_MS);
  };

  const editable = (el) =>
    el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  const KEY_LABELS = {
    Enter: "Enter",
    Escape: "Esc",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };

  let lastMove = 0;
  const onPointerMove = () => {
    if (!active()) return;
    const now = Date.now();
    if (now - lastMove > 200) record("move");
    lastMove = now;
  };

  const onPointerDown = () => {
    record("pointer");
  };

  const onKeyDown = (e) => {
    if (!active()) return;
    ensureRoot();
    const mods = ["Control", "Alt", "Meta", "Shift"].filter((m) => e.getModifierState(m) && e.key !== m);
    let label;
    if (e.key.length === 1 && !mods.some((m) => m !== "Shift")) label = "typing…";
    else if (KEY_LABELS[e.key]) label = [...mods, KEY_LABELS[e.key]].join(" + ");
    else if (mods.length && e.key.length === 1) label = [...mods, e.key.toUpperCase()].join(" + ");
    else return;
    showPill(label);
    record(editable(e.target) && label === "typing…" ? "typing" : "key");
  };

  let lastInput = 0;
  const onInput = (e) => {
    if (!active() || !editable(e.target)) return;
    ensureRoot();
    const now = Date.now();
    showPill("typing…");
    if (now - lastInput > 250) record("typing");
    lastInput = now;
  };

  let lastWheel = 0;
  const onWheel = (e) => {
    if (!active()) return;
    ensureRoot();
    const now = Date.now();
    showPill(e.deltaY > 0 ? "scroll ↓" : e.deltaY < 0 ? "scroll ↑" : e.deltaX > 0 ? "scroll →" : "scroll ←");
    if (now - lastWheel > 250) record("scroll");
    lastWheel = now;
  };

  const onMutations = (mutations) => {
    if (!active()) return;
    if (mutations.every((m) => root && root.contains(m.target))) return;
    const now = Date.now();
    if (now - lastChange < CHANGE_THROTTLE_MS) return;
    lastChange = now;
    record("change");
  };

  const observe = () => {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  };

  addEventListener("pointermove", onPointerMove, true);
  addEventListener("pointerdown", onPointerDown, true);
  addEventListener("keydown", onKeyDown, true);
  addEventListener("input", onInput, true);
  addEventListener("wheel", onWheel, { capture: true, passive: true });
  addEventListener("pagehide", flush);

  window.__wtenvClip = {
    start() {
      localStorage.setItem(FLAG, "on");
      localStorage.setItem(LOG, "[]");
      pending = [];
      ensureRoot();
      observe();
      record("start");
      flush();
      return { startedAt: Date.now() };
    },
    stop() {
      record("stop");
      flush();
      localStorage.removeItem(FLAG);
      observer?.disconnect();
      observer = null;
      clearTimeout(pillTimer);
      removeRoot();
      const events = readLog();
      localStorage.removeItem(LOG);
      return events;
    },
    events() {
      flush();
      return readLog();
    },
  };

  if (active()) {
    record("load");
    const init = () => {
      ensureRoot();
      observe();
    };
    if (document.documentElement) init();
    else addEventListener("DOMContentLoaded", init, { once: true });
  }
})();

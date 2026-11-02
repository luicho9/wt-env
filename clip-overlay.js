(() => {
  const FLAG = "wtenv-clip";
  const LOG = "wtenv-clip-events";
  const LAST = "wtenv-clip-pointer";
  const CHANGE_THROTTLE_MS = 200;
  const RIPPLE_MS = 900;
  const PILL_MS = 1200;
  const ORANGE = "rgb(255, 80, 40)";

  if (window.__wtenvClip) return;

  const active = () => localStorage.getItem(FLAG) === "on";
  const readLog = () => JSON.parse(localStorage.getItem(LOG) || "[]");
  let pending = [];
  let flushTimer = null;
  let lastChange = 0;
  let root = null;
  let cursor = null;
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
    cursor = document.createElement("div");
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.5 L13.4 19.3 L10.3 12.7 L16.5 12.4 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    cursor.style.cssText =
      "position:absolute;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;transition:transform 220ms cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))";
    const last = JSON.parse(localStorage.getItem(LAST) || "null") || {
      x: innerWidth / 2,
      y: innerHeight / 2,
    };
    moveCursor(last.x, last.y, false);
    pill = document.createElement("div");
    pill.style.cssText =
      "position:absolute;left:50%;bottom:28px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(17,17,17,.82);color:#fff;font:600 14px/1.2 system-ui,sans-serif;opacity:0;transition:opacity 150ms";
    root.append(cursor, pill);
    document.documentElement.append(root);
  };

  const removeRoot = () => {
    root?.remove();
    root = cursor = pill = null;
  };

  function moveCursor(x, y, animate = true) {
    if (!cursor) return;
    if (!animate) cursor.style.transition = "none";
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    if (!animate) {
      cursor.getBoundingClientRect();
      cursor.style.transition = "transform 220ms cubic-bezier(.4,0,.2,1)";
    }
    localStorage.setItem(LAST, JSON.stringify({ x, y }));
  }

  const ripple = (x, y) => {
    const ring = document.createElement("div");
    ring.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:72px;height:72px;margin:-36px 0 0 -36px;border:4px solid ${ORANGE};border-radius:50%;box-sizing:border-box`;
    root.append(ring);
    ring.animate(
      [
        { transform: "scale(0.5)", opacity: 1 },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: RIPPLE_MS, easing: "ease-out", fill: "forwards" },
    ).onfinish = () => ring.remove();
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

  const onPointerMove = (e) => {
    if (!active()) return;
    ensureRoot();
    moveCursor(e.clientX, e.clientY);
  };

  const onPointerDown = (e) => {
    if (!active()) return;
    ensureRoot();
    moveCursor(e.clientX, e.clientY);
    ripple(e.clientX, e.clientY);
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

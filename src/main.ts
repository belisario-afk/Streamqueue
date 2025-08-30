import { ensureAuth, getAccessToken, initAuthUI, isPremium } from "@auth/auth";
import { initAPI } from "@spotify/api";
import {
  initWebPlayback,
  connectWebPlayback,
  getDevices,
  transferPlayback,
  playPause,
  nextTrack,
  prevTrack,
  seekMs,
  setVolume,
  currentState,
  setDeviceVolume
} from "@spotify/playback";
import {
  initEngine,
  resizeEngine,
  setQuality,
  setMacros,
  setScene,
  autoPickScene,
  updatePalette,
  setAccessibility,
  startRender,
  setFrameGovernorTarget,
  getEngineCanvas,
  getSceneConfigSchema,
  getSceneConfig,
  setSceneConfig,
  getActiveSceneName
} from "@visuals/engine";
import { initDirector } from "@controllers/director";
import { savePaletteForTrack, getCachedCover, cacheTrackMeta } from "@utils/indexeddb";
import { extractPalette } from "@utils/palette";
import { fpsMeter, gpuLabel } from "@utils/fps";
import { formatTime } from "@utils/time";
import { initRecorder, toggleRecording } from "@recording/recorder";

const CLIENT_ID = "927fda6918514f96903e828fcd6bb576";
const REPO_BASE = (() => {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts.length ? `/${parts[0]}/` : "/";
})();
const REDIRECT_URI =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? "http://127.0.0.1:5173/"
    : `${location.origin}${REPO_BASE}`;

const scopes = [
  "user-read-private",
  "user-read-email",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "streaming"
];

function byId<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T | null;
}

let premium = false;
let currentDeviceId: string | null = null;
let lastInteractionTs = Date.now();

const els = {
  loginBtn: byId<HTMLButtonElement>("login-btn"),
  playpauseBtn: byId<HTMLButtonElement>("playpause-btn"),
  prevBtn: byId<HTMLButtonElement>("prev-btn"),
  nextBtn: byId<HTMLButtonElement>("next-btn"),
  seekRange: byId<HTMLInputElement>("seek-range"),
  seekLabel: byId<HTMLSpanElement>("seek-label"),
  volumeRange: byId<HTMLInputElement>("volume-range"),
  devicePicker: byId<HTMLSelectElement>("device-picker"),
  modeLabel: byId<HTMLSpanElement>("mode-label"),
  fpsLabel: byId<HTMLSpanElement>("fps-label"),
  gpuLabel: byId<HTMLSpanElement>("gpu-label"),
  beatDot: byId<HTMLDivElement>("beat-dot"),
  scenePicker: byId<HTMLSelectElement>("scene-picker"),
  qScale: byId<HTMLInputElement>("q-scale"),
  perfFps: byId<HTMLInputElement>("perf-fps"),
  sceneSettings: byId<HTMLDivElement>("scene-settings")
};

function buildSceneSettingsPanel() {
  if (!els.sceneSettings) return;
  const schema = getSceneConfigSchema();
  const cfg = getSceneConfig();
  els.sceneSettings.innerHTML = "";
  if (!schema || !cfg) {
    els.sceneSettings.innerHTML = `<div class="tag">No settings available for ${getActiveSceneName()}</div>`;
    return;
  }
  for (const key of Object.keys(schema)) {
    const s = schema[key];
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    label.textContent = s.label;
    row.appendChild(label);

    let input: HTMLElement;
    if (s.type === "range") {
      const r = document.createElement("input");
      r.type = "range";
      r.min = String(s.min ?? 0);
      r.max = String(s.max ?? 1);
      r.step = String(s.step ?? 0.01);
      r.value = String((cfg[key] as number) ?? s.default);
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = r.value;
      r.addEventListener("input", () => {
        span.textContent = r.value;
        setSceneConfig({ [key]: parseFloat(r.value) });
      });
      input = document.createElement("div");
      input.appendChild(r);
      input.appendChild(span);
    } else if (s.type === "checkbox") {
      const c = document.createElement("input");
      c.type = "checkbox";
      c.checked = Boolean((cfg[key] as boolean) ?? s.default);
      c.addEventListener("change", () => setSceneConfig({ [key]: c.checked }));
      input = c;
    } else if (s.type === "select") {
      const sel = document.createElement("select");
      for (const opt of s.options || []) {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      }
      sel.value = String(cfg[key] ?? s.default);
      sel.addEventListener("change", () => setSceneConfig({ [key]: sel.value }));
      input = sel;
    } else if (s.type === "color") {
      const c = document.createElement("input");
      c.type = "color";
      c.value = String(cfg[key] ?? s.default);
      c.addEventListener("input", () => setSceneConfig({ [key]: c.value }));
      input = c;
    } else {
      input = document.createElement("span");
      input.textContent = String(cfg[key] ?? s.default);
    }

    row.appendChild(input);
    if (s.help) {
      const help = document.createElement("span");
      help.className = "tag";
      help.textContent = s.help;
      row.appendChild(help);
    }
    els.sceneSettings.appendChild(row);
  }
}

function setUIPalette(colors: string[]) {
  for (let i = 0; i < 5; i++) document.documentElement.style.setProperty(`--palette-${i}`, colors[i] || "#666");
  document.documentElement.style.setProperty("--accent", colors[0] || "#59ffa9");
  document.documentElement.style.setProperty("--accent-2", colors[1] || "#5aaaff");
  document.documentElement.style.setProperty("--accent-3", colors[2] || "#ff59be");
}

function updateModeLabel() {
  if (els.modeLabel) els.modeLabel.textContent = premium ? "In-page playback" : "Device control";
}

async function refreshDevices() {
  const devices = await getDevices().catch(() => []);
  if (!els.devicePicker) return;
  els.devicePicker.innerHTML = "";
  devices.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id || "";
    opt.textContent = `${d.name} ${d.is_active ? "•" : ""}`;
    els.devicePicker!.appendChild(opt);
    if (d.is_active) currentDeviceId = d.id || null;
  });
  if (currentDeviceId) els.devicePicker.value = currentDeviceId;
}

function hookControls() {
  els.playpauseBtn?.addEventListener("click", async () => {
    await playPause().catch(() => {});
  });
  els.prevBtn?.addEventListener("click", async () => {
    await prevTrack().catch(() => {});
  });
  els.nextBtn?.addEventListener("click", async () => {
    await nextTrack().catch(() => {});
  });
  els.volumeRange?.addEventListener("input", async () => {
    const vol = parseInt(els.volumeRange!.value);
    if (premium) await setDeviceVolume(vol).catch(() => {});
    else await setVolume(vol).catch(() => {});
  });
  els.seekRange?.addEventListener("change", async () => {
    const pos = parseInt(els.seekRange!.value);
    await seekMs(pos).catch(() => {});
  });
  els.devicePicker?.addEventListener("change", async () => {
    const id = els.devicePicker!.value;
    currentDeviceId = id;
    await transferPlayback(id, false).catch(() => {});
  });
  const poke = () => {
    lastInteractionTs = Date.now();
    document.getElementById("screensaver")?.classList.remove("active");
  };
  ["mousemove", "keydown", "pointerdown", "touchstart"].forEach((e) =>
    window.addEventListener(e, poke, { passive: true })
  );
  setInterval(() => {
    if (Date.now() - lastInteractionTs > 30000)
      document.getElementById("screensaver")?.classList.add("active");
  }, 1000);
}

function hookQuality() {
  els.qScale?.addEventListener("input", () => {
    const s = parseFloat(els.qScale!.value);
    setQuality({ renderScale: s });
  });
  els.perfFps?.addEventListener("input", () => {
    const fps = parseInt(els.perfFps!.value) || 60;
    setFrameGovernorTarget(fps);
  });

  window.addEventListener("vj-scene-changed", () => buildSceneSettingsPanel());
  buildSceneSettingsPanel();
}

function hookScenePicker() {
  els.scenePicker?.addEventListener("change", () => {
    const v = els.scenePicker!.value as any;
    if (v === "auto") autoPickScene();
    else setScene(v);
  });
}

function hookLayout() {
  const canvas = document.getElementById("vis") as HTMLCanvasElement | null;
  const onResize = () => {
    if (!canvas) return;
    resizeEngine(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
  };
  window.addEventListener("resize", onResize);
  onResize();

  const fps = fpsMeter();
  setInterval(() => {
    if (els.fpsLabel) els.fpsLabel.textContent = `FPS: ${fps.value().toFixed(0)}`;
  }, 500);
  if (els.gpuLabel) els.gpuLabel.textContent = gpuLabel();
}

async function onPlayerState() {
  const st = await currentState().catch(() => null);
  if (!st) return;
  const duration = st.item?.duration_ms ?? 0;
  const position = st.progress_ms ?? 0;
  if (duration && !isNaN(duration)) {
    if (els.seekRange && !els.seekRange.matches(":active")) {
      els.seekRange.max = String(duration);
      els.seekRange.value = String(position);
    }
    if (els.seekLabel) els.seekLabel.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
  }
  if (st.item) {
    const coverUrl = st.item.album.images[0]?.url;
    if (coverUrl) {
      const cached = await getCachedCover(st.item.id, coverUrl).catch(() => null);
      const src = cached?.objectUrl ?? coverUrl;
      (document.getElementById("cover-img") as HTMLImageElement | null)?.setAttribute("src", src);
      const pal =
        cached?.palette ??
        (await extractPalette(src).catch(() => ["#59ffa9", "#5aaaff", "#ff59be", "#ffe459", "#ff8a59"]));
      setUIPalette(pal);
      updatePalette(pal.map((c) => c));
      savePaletteForTrack(st.item.id, coverUrl, pal).catch(() => {});
    }
    cacheTrackMeta(st.item).catch(() => {});
  }
}

async function app() {
  if (els.loginBtn) initAuthUI({ loginButton: els.loginBtn, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, scopes });
  await ensureAuth(CLIENT_ID, REDIRECT_URI, scopes);

  const token = await getAccessToken();
  if (!token) {
    hookControls();
    return;
  }

  initAPI(() => getAccessToken());
  premium = await isPremium();
  updateModeLabel();

  const canvas = document.getElementById("vis") as HTMLCanvasElement;
  await initEngine(canvas);

  hookControls();
  hookScenePicker();
  hookQuality();
  hookLayout();

  await initWebPlayback(
    () => getAccessToken(),
    async (deviceId) => {
      currentDeviceId = deviceId;
      await refreshDevices();
      if (premium) {
        await connectWebPlayback();
        await transferPlayback(deviceId, true);
      }
    },
    () => {
      onPlayerState();
    }
  );

  await refreshDevices();
  startRender();
  initDirector({ elements: {} });

  setInterval(onPlayerState, 1000);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => app().catch(console.error));
} else {
  app().catch(console.error);
}
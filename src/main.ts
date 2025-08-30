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
  isWebGL2Capable,
  setSafeMode
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

function getEl<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T | null;
}

const elements = {
  loginBtn: null as HTMLButtonElement | null,
  playpauseBtn: null as HTMLButtonElement | null,
  prevBtn: null as HTMLButtonElement | null,
  nextBtn: null as HTMLButtonElement | null,
  seekRange: null as HTMLInputElement | null,
  seekLabel: null as HTMLSpanElement | null,
  volumeRange: null as HTMLInputElement | null,
  devicePicker: null as HTMLSelectElement | null,
  modeLabel: null as HTMLSpanElement | null,
  fpsLabel: null as HTMLSpanElement | null,
  gpuLabel: null as HTMLSpanElement | null,
  beatDot: null as HTMLDivElement | null,
  scenePicker: null as HTMLSelectElement | null,
  vjIntensity: null as HTMLInputElement | null,
  vjIntensityV: null as HTMLSpanElement | null,
  vjBloom: null as HTMLInputElement | null,
  vjBloomV: null as HTMLSpanElement | null,
  vjGlitch: null as HTMLInputElement | null,
  vjGlitchV: null as HTMLSpanElement | null,
  vjSpeed: null as HTMLInputElement | null,
  vjSpeedV: null as HTMLSpanElement | null,
  midiStatus: null as HTMLSpanElement | null,
  qScale: null as HTMLInputElement | null,
  qScaleV: null as HTMLSpanElement | null,
  qMSAA: null as HTMLInputElement | null,
  qMSAAV: null as HTMLSpanElement | null,
  qTAA: null as HTMLInputElement | null,
  qBloom: null as HTMLInputElement | null,
  qBloomV: null as HTMLSpanElement | null,
  qSSAO: null as HTMLInputElement | null,
  qMoBlur: null as HTMLInputElement | null,
  qDOF: null as HTMLInputElement | null,
  qToneMap: null as HTMLSelectElement | null,
  qChroma: null as HTMLInputElement | null,
  qChromaV: null as HTMLSpanElement | null,
  qVol: null as HTMLInputElement | null,
  qSteps: null as HTMLInputElement | null,
  qStepsV: null as HTMLSpanElement | null,
  qSoft: null as HTMLInputElement | null,
  qSoftV: null as HTMLSpanElement | null,
  qParticles: null as HTMLInputElement | null,
  qParticlesV: null as HTMLSpanElement | null,
  qFluidRes: null as HTMLInputElement | null,
  qFluidResV: null as HTMLSpanElement | null,
  qFluidIters: null as HTMLInputElement | null,
  qFluidItersV: null as HTMLSpanElement | null,
  qWebGPU: null as HTMLInputElement | null,
  accEpilepsy: null as HTMLInputElement | null,
  accIntensity: null as HTMLInputElement | null,
  accIntensityV: null as HTMLSpanElement | null,
  accReduced: null as HTMLInputElement | null,
  accContrast: null as HTMLInputElement | null,
  accSafe: null as HTMLInputElement | null,
  fullscreen: null as HTMLButtonElement | null,
  recordToggle: null as HTMLButtonElement | null,
  recordStatus: null as HTMLSpanElement | null,
  coverImg: null as HTMLImageElement | null,
  trackTitle: null as HTMLDivElement | null,
  trackArtist: null as HTMLDivElement | null,
  screensaver: null as HTMLDivElement | null
};

function wireElements() {
  elements.loginBtn = getEl<HTMLButtonElement>("login-btn");
  elements.playpauseBtn = getEl<HTMLButtonElement>("playpause-btn");
  elements.prevBtn = getEl<HTMLButtonElement>("prev-btn");
  elements.nextBtn = getEl<HTMLButtonElement>("next-btn");
  elements.seekRange = getEl<HTMLInputElement>("seek-range");
  elements.seekLabel = getEl<HTMLSpanElement>("seek-label");
  elements.volumeRange = getEl<HTMLInputElement>("volume-range");
  elements.devicePicker = getEl<HTMLSelectElement>("device-picker");
  elements.modeLabel = getEl<HTMLSpanElement>("mode-label");
  elements.fpsLabel = getEl<HTMLSpanElement>("fps-label");
  elements.gpuLabel = getEl<HTMLSpanElement>("gpu-label");
  elements.beatDot = getEl<HTMLDivElement>("beat-dot");
  elements.scenePicker = getEl<HTMLSelectElement>("scene-picker");
  elements.vjIntensity = getEl<HTMLInputElement>("vj-intensity");
  elements.vjIntensityV = getEl<HTMLSpanElement>("vj-intensity-v");
  elements.vjBloom = getEl<HTMLInputElement>("vj-bloom");
  elements.vjBloomV = getEl<HTMLSpanElement>("vj-bloom-v");
  elements.vjGlitch = getEl<HTMLInputElement>("vj-glitch");
  elements.vjGlitchV = getEl<HTMLSpanElement>("vj-glitch-v");
  elements.vjSpeed = getEl<HTMLInputElement>("vj-speed");
  elements.vjSpeedV = getEl<HTMLSpanElement>("vj-speed-v");
  elements.midiStatus = getEl<HTMLSpanElement>("midi-status");
  elements.qScale = getEl<HTMLInputElement>("q-scale");
  elements.qScaleV = getEl<HTMLSpanElement>("q-scale-v");
  elements.qMSAA = getEl<HTMLInputElement>("q-msaa");
  elements.qMSAAV = getEl<HTMLSpanElement>("q-msaa-v");
  elements.qTAA = getEl<HTMLInputElement>("q-taa");
  elements.qBloom = getEl<HTMLInputElement>("q-bloom");
  elements.qBloomV = getEl<HTMLSpanElement>("q-bloom-v");
  elements.qSSAO = getEl<HTMLInputElement>("q-ssao");
  elements.qMoBlur = getEl<HTMLInputElement>("q-moblur");
  elements.qDOF = getEl<HTMLInputElement>("q-dof");
  elements.qToneMap = getEl<HTMLSelectElement>("q-tonemap");
  elements.qChroma = getEl<HTMLInputElement>("q-chroma");
  elements.qChromaV = getEl<HTMLSpanElement>("q-chroma-v");
  elements.qVol = getEl<HTMLInputElement>("q-vol");
  elements.qSteps = getEl<HTMLInputElement>("q-steps");
  elements.qStepsV = getEl<HTMLSpanElement>("q-steps-v");
  elements.qSoft = getEl<HTMLInputElement>("q-soft");
  elements.qSoftV = getEl<HTMLSpanElement>("q-soft-v");
  elements.qParticles = getEl<HTMLInputElement>("q-particles");
  elements.qParticlesV = getEl<HTMLSpanElement>("q-particles-v");
  elements.qFluidRes = getEl<HTMLInputElement>("q-fluid-res");
  elements.qFluidResV = getEl<HTMLSpanElement>("q-fluid-res-v");
  elements.qFluidIters = getEl<HTMLInputElement>("q-fluid-iters");
  elements.qFluidItersV = getEl<HTMLSpanElement>("q-fluid-iters-v");
  elements.qWebGPU = getEl<HTMLInputElement>("q-webgpu");
  elements.accEpilepsy = getEl<HTMLInputElement>("acc-epilepsy");
  elements.accIntensity = getEl<HTMLInputElement>("acc-intensity");
  elements.accIntensityV = getEl<HTMLSpanElement>("acc-intensity-v");
  elements.accReduced = getEl<HTMLInputElement>("acc-reduced");
  elements.accContrast = getEl<HTMLInputElement>("acc-contrast");
  elements.accSafe = getEl<HTMLInputElement>("acc-safe");
  elements.fullscreen = getEl<HTMLButtonElement>("fullscreen-btn");
  elements.recordToggle = getEl<HTMLButtonElement>("record-toggle");
  elements.recordStatus = getEl<HTMLSpanElement>("record-status");
  elements.coverImg = getEl<HTMLImageElement>("cover-img");
  elements.trackTitle = getEl<HTMLDivElement>("track-title");
  elements.trackArtist = getEl<HTMLDivElement>("track-artist");
  elements.screensaver = getEl<HTMLDivElement>("screensaver");
}

let premium = false;
let currentDeviceId: string | null = null;
let lastInteractionTs = Date.now();

function setUIPalette(colors: string[]) {
  for (let i = 0; i < 5; i++) {
    document.documentElement.style.setProperty(`--palette-${i}`, colors[i] || "#666");
  }
  document.documentElement.style.setProperty("--accent", colors[0] || "#59ffa9");
  document.documentElement.style.setProperty("--accent-2", colors[1] || "#5aaaff");
  document.documentElement.style.setProperty("--accent-3", colors[2] || "#ff59be");
}

function updateModeLabel() {
  if (elements.modeLabel) elements.modeLabel.textContent = premium ? "In-page playback" : "Device control";
}

async function refreshDevices() {
  const devices = await getDevices().catch(() => []);
  if (!elements.devicePicker) return;
  elements.devicePicker.innerHTML = "";
  devices.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id || "";
    opt.textContent = `${d.name} ${d.is_active ? "•" : ""}`;
    elements.devicePicker!.appendChild(opt);
    if (d.is_active) currentDeviceId = d.id || null;
  });
  if (currentDeviceId) {
    elements.devicePicker.value = currentDeviceId;
  }
}

function hookQualityPanel() {
  const q = elements;
  const apply = () => {
    setQuality({
      renderScale: parseFloat(q.qScale?.value || "1"),
      msaa: parseInt(q.qMSAA?.value || "0"),
      taa: !!q.qTAA?.checked,
      bloom: parseFloat(q.qBloom?.value || "0"),
      ssao: !!q.qSSAO?.checked,
      motionBlur: !!q.qMoBlur?.checked,
      dof: !!q.qDOF?.checked,
      toneMap: (q.qToneMap?.value as any) || "filmic",
      chromaticAberration: parseFloat(q.qChroma?.value || "0"),
      volumetrics: !!q.qVol?.checked,
      raymarchSteps: parseInt(q.qSteps?.value || "384"),
      softShadowSamples: parseInt(q.qSoft?.value || "8"),
      particleCount: parseInt(q.qParticles?.value || "500000"),
      fluidResolution: parseInt(q.qFluidRes?.value || "384"),
      fluidIterations: parseInt(q.qFluidIters?.value || "20"),
      webgpuPathTrace: !!q.qWebGPU?.checked
    });
    if (q.qScaleV && q.qScale) q.qScaleV.textContent = `${parseFloat(q.qScale.value).toFixed(1)}x`;
    if (q.qMSAAV && q.qMSAA) q.qMSAAV.textContent = q.qMSAA.value;
    if (q.qBloomV && q.qBloom) q.qBloomV.textContent = q.qBloom.value;
    if (q.qChromaV && q.qChroma) q.qChromaV.textContent = q.qChroma.value;
    if (q.qStepsV && q.qSteps) q.qStepsV.textContent = q.qSteps.value;
    if (q.qSoftV && q.qSoft) q.qSoftV.textContent = q.qSoft.value;
    if (q.qParticlesV && q.qParticles) q.qParticlesV.textContent = `${(parseInt(q.qParticles.value) / 1e6).toFixed(1)}M`;
    if (q.qFluidResV && q.qFluidRes) q.qFluidResV.textContent = `${q.qFluidRes.value}²`;
    if (q.qFluidItersV && q.qFluidIters) q.qFluidItersV.textContent = q.qFluidIters.value;
  };
  const inputs: (HTMLElement | null | undefined)[] = [
    q.qScale, q.qMSAA, q.qTAA, q.qBloom, q.qSSAO, q.qMoBlur, q.qDOF, q.qToneMap, q.qChroma,
    q.qVol, q.qSteps, q.qSoft, q.qParticles, q.qFluidRes, q.qFluidIters, q.qWebGPU
  ];
  ["input", "change"].forEach((evt) => inputs.forEach((el) => el?.addEventListener?.(evt as any, apply)));
  // Apply once if slider exists
  apply();
}

function hookAccessibility() {
  const apply = () => {
    const cfg = {
      epilepsySafe: !!elements.accEpilepsy?.checked,
      intensityLimiter: parseFloat(elements.accIntensity?.value || "1"),
      reducedMotion: !!elements.accReduced?.checked,
      highContrast: !!elements.accContrast?.checked
    };
    if (elements.accIntensityV) elements.accIntensityV.textContent = cfg.intensityLimiter.toFixed(2);
    setAccessibility(cfg);
    setSafeMode(!!elements.accSafe?.checked);
    if (elements.accSafe?.checked) {
      setScene("basic" as any);
    }
    document.body.style.filter = cfg.highContrast ? "contrast(1.15) saturate(1.15)" : "";
  };
  const inputs = [elements.accEpilepsy, elements.accIntensity, elements.accReduced, elements.accContrast, elements.accSafe];
  ["input", "change"].forEach((evt) => inputs.forEach((el) => el?.addEventListener?.(evt as any, apply)));
  apply();
}

function hookVJ() {
  const apply = () => {
    if (!elements.vjIntensity || !elements.vjBloom || !elements.vjGlitch || !elements.vjSpeed) return;
    setMacros({
      intensity: parseFloat(elements.vjIntensity.value),
      bloom: parseFloat(elements.vjBloom.value),
      glitch: parseFloat(elements.vjGlitch.value),
      speed: parseFloat(elements.vjSpeed.value)
    });
    if (elements.vjIntensityV) elements.vjIntensityV.textContent = parseFloat(elements.vjIntensity.value).toFixed(2);
    if (elements.vjBloomV) elements.vjBloomV.textContent = parseFloat(elements.vjBloom.value).toFixed(2);
    if (elements.vjGlitchV) elements.vjGlitchV.textContent = parseFloat(elements.vjGlitch.value).toFixed(2);
    if (elements.vjSpeedV) elements.vjSpeedV.textContent = parseFloat(elements.vjSpeed.value).toFixed(2);
  };
  ["input", "change"].forEach((evt) => {
    [elements.vjIntensity, elements.vjBloom, elements.vjGlitch, elements.vjSpeed].forEach((el) =>
      el?.addEventListener?.(evt as any, apply)
    );
  });
  apply();

  elements.scenePicker?.addEventListener?.("change", () => {
    const v = elements.scenePicker!.value as any;
    setScene(v === "auto" ? "basic" : v);
  });
}

function hookControls() {
  elements.playpauseBtn?.addEventListener?.("click", async () => {
    await playPause().catch(() => {});
  });
  elements.prevBtn?.addEventListener?.("click", async () => {
    await prevTrack().catch(() => {});
  });
  elements.nextBtn?.addEventListener?.("click", async () => {
    await nextTrack().catch(() => {});
  });
  elements.volumeRange?.addEventListener?.("input", async () => {
    const vol = parseInt(elements.volumeRange!.value);
    if (premium) await setDeviceVolume(vol).catch(() => {});
    else await setVolume(vol).catch(() => {});
  });
  elements.seekRange?.addEventListener?.("change", async () => {
    const pos = parseInt(elements.seekRange!.value);
    await seekMs(pos).catch(() => {});
  });
  elements.devicePicker?.addEventListener?.("change", async () => {
    const id = elements.devicePicker!.value;
    currentDeviceId = id;
    await transferPlayback(id, false).catch(() => {});
  });
  elements.fullscreen?.addEventListener?.("click", async () => {
    const el = document.documentElement as any;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  const poke = () => {
    lastInteractionTs = Date.now();
    elements.screensaver?.classList.remove("active");
  };
  ["mousemove", "keydown", "pointerdown", "touchstart"].forEach((e) => window.addEventListener(e, poke, { passive: true }));
  setInterval(() => {
    if (Date.now() - lastInteractionTs > 30000) {
      elements.screensaver?.classList.add("active");
    }
  }, 1000);
}

function initRecordingUI() {
  const canvas = getEngineCanvas();
  initRecorder(canvas, (status) => {
    if (elements.recordStatus) elements.recordStatus.textContent = status;
    if (elements.recordToggle) elements.recordToggle.textContent = status.startsWith("recording") ? "Stop" : "Start";
  });
  elements.recordToggle?.addEventListener?.("click", () => toggleRecording());
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
    if (elements.fpsLabel) elements.fpsLabel.textContent = `FPS: ${fps.value().toFixed(0)}`;
  }, 500);
  if (elements.gpuLabel) elements.gpuLabel.textContent = gpuLabel() + (isWebGL2Capable() ? " • WebGL2" : " • WebGL1");
}

async function onPlayerState() {
  const st = await currentState().catch(() => null);
  if (!st) return;

  const duration = st.item?.duration_ms ?? 0;
  const position = st.progress_ms ?? 0;
  if (duration && !isNaN(duration)) {
    if (elements.seekRange && !elements.seekRange.matches(":active")) {
      elements.seekRange.max = String(duration);
      elements.seekRange.value = String(position);
    }
    if (elements.seekLabel) elements.seekLabel.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
  }
  if (st.item) {
    if (elements.trackTitle) elements.trackTitle.textContent = st.item.name;
    if (elements.trackArtist) elements.trackArtist.textContent = st.item.artists.map((a) => a.name).join(", ");
    const coverUrl = st.item.album.images[0]?.url;
    if (coverUrl && elements.coverImg) {
      const cached = await getCachedCover(st.item.id, coverUrl).catch(() => null);
      const src = cached?.objectUrl ?? coverUrl;
      elements.coverImg.src = src;
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
  wireElements();

  // Login UI
  if (elements.loginBtn) {
    initAuthUI({
      loginButton: elements.loginBtn,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scopes
    });
  }

  await ensureAuth(CLIENT_ID, REDIRECT_URI, scopes);

  const token = await getAccessToken();
  if (!token) {
    // Not logged in yet; still wire local UI to avoid null crashes
    hookControls();
    return;
  }

  initAPI(() => getAccessToken());
  premium = await isPremium();
  updateModeLabel();

  const canvas = document.getElementById("vis") as HTMLCanvasElement;
  await initEngine(canvas);

  hookQualityPanel();
  hookAccessibility();
  hookVJ();
  hookControls();
  hookLayout();
  initRecordingUI();

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
  // Start in safest scene; user can switch manually later
  setScene("basic" as any);
  startRender();

  initDirector({
    onBeat: () => {
      if (!elements.beatDot) return;
      elements.beatDot.style.transform = "scale(1.4)";
      elements.beatDot.style.boxShadow = "0 0 12px var(--accent)";
      setTimeout(() => {
        elements.beatDot!.style.transform = "scale(1.0)";
        elements.beatDot!.style.boxShadow = "none";
      }, 120);
    },
    onPhraseBoundary: () => {
      // Keep conservative; do not auto-switch heavy scenes on weaker GPUs
      autoPickScene();
    },
    elements: elements as any
  });

  setFrameGovernorTarget(60);
  setInterval(onPlayerState, 1000);
}

// Ensure DOM exists before we grab elements (prevents null addEventListener errors)
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    app().catch((err) => {
      console.error(err);
      alert("Initialization error. Check console.");
    });
  });
} else {
  app().catch((err) => {
    console.error(err);
    alert("Initialization error. Check console.");
  });
}
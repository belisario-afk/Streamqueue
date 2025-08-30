import { ensureAuth, getAccessToken, initAuthUI, isPremium } from "@auth/auth";
import { initAPI } from "@spotify/api";
import { initWebPlayback, connectWebPlayback, getDevices, transferPlayback, playPause, nextTrack, prevTrack, seekMs, setVolume, currentState, setDeviceVolume } from "@spotify/playback";
import { initEngine, resizeEngine, setQuality, setMacros, setScene, autoPickScene, updatePalette, setAccessibility, startRender, setFrameGovernorTarget, crossfadeToScene, getEngineCanvas, isWebGL2Capable, setSafeMode } from "@visuals/engine";
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
const REDIRECT_URI = (location.hostname === "127.0.0.1" || location.hostname === "localhost")
  ? "http://127.0.0.1:5173/"
  : `${location.origin}${REPO_BASE}`;

const scopes = ["user-read-private","user-read-email","user-read-playback-state","user-modify-playback-state","user-read-currently-playing","streaming"];

const elements = {
  loginBtn: document.getElementById("login-btn") as HTMLButtonElement,
  playpauseBtn: document.getElementById("playpause-btn") as HTMLButtonElement,
  prevBtn: document.getElementById("prev-btn") as HTMLButtonElement,
  nextBtn: document.getElementById("next-btn") as HTMLButtonElement,
  seekRange: document.getElementById("seek-range") as HTMLInputElement,
  seekLabel: document.getElementById("seek-label") as HTMLSpanElement,
  volumeRange: document.getElementById("volume-range") as HTMLInputElement,
  devicePicker: document.getElementById("device-picker") as HTMLSelectElement,
  modeLabel: document.getElementById("mode-label") as HTMLSpanElement,
  fpsLabel: document.getElementById("fps-label") as HTMLSpanElement,
  gpuLabelEl: document.getElementById("gpu-label") as HTMLSpanElement,
  beatDot: document.getElementById("beat-dot") as HTMLDivElement,
  scenePicker: document.getElementById("scene-picker") as HTMLSelectElement,
  vjIntensity: document.getElementById("vj-intensity") as HTMLInputElement,
  vjIntensityV: document.getElementById("vj-intensity-v") as HTMLSpanElement,
  vjBloom: document.getElementById("vj-bloom") as HTMLInputElement,
  vjBloomV: document.getElementById("vj-bloom-v") as HTMLSpanElement,
  vjGlitch: document.getElementById("vj-glitch") as HTMLInputElement,
  vjGlitchV: document.getElementById("vj-glitch-v") as HTMLSpanElement,
  vjSpeed: document.getElementById("vj-speed") as HTMLInputElement,
  vjSpeedV: document.getElementById("vj-speed-v") as HTMLSpanElement,
  midiStatus: document.getElementById("midi-status") as HTMLSpanElement,
  qScale: document.getElementById("q-scale") as HTMLInputElement,
  qScaleV: document.getElementById("q-scale-v") as HTMLSpanElement,
  qMSAA: document.getElementById("q-msaa") as HTMLInputElement,
  qMSAAV: document.getElementById("q-msaa-v") as HTMLSpanElement,
  qTAA: document.getElementById("q-taa") as HTMLInputElement,
  qBloom: document.getElementById("q-bloom") as HTMLInputElement,
  qBloomV: document.getElementById("q-bloom-v") as HTMLSpanElement,
  qSSAO: document.getElementById("q-ssao") as HTMLInputElement,
  qMoBlur: document.getElementById("q-moblur") as HTMLInputElement,
  qDOF: document.getElementById("q-dof") as HTMLInputElement,
  qToneMap: document.getElementById("q-tonemap") as HTMLSelectElement,
  qChroma: document.getElementById("q-chroma") as HTMLInputElement,
  qChromaV: document.getElementById("q-chroma-v") as HTMLSpanElement,
  qVol: document.getElementById("q-vol") as HTMLInputElement,
  qSteps: document.getElementById("q-steps") as HTMLInputElement,
  qStepsV: document.getElementById("q-steps-v") as HTMLSpanElement,
  qSoft: document.getElementById("q-soft") as HTMLInputElement,
  qSoftV: document.getElementById("q-soft-v") as HTMLSpanElement,
  qParticles: document.getElementById("q-particles") as HTMLInputElement,
  qParticlesV: document.getElementById("q-particles-v") as HTMLSpanElement,
  qFluidRes: document.getElementById("q-fluid-res") as HTMLInputElement,
  qFluidResV: document.getElementById("q-fluid-res-v") as HTMLSpanElement,
  qFluidIters: document.getElementById("q-fluid-iters") as HTMLInputElement,
  qFluidItersV: document.getElementById("q-fluid-iters-v") as HTMLSpanElement,
  qWebGPU: document.getElementById("q-webgpu") as HTMLInputElement,
  accEpilepsy: document.getElementById("acc-epilepsy") as HTMLInputElement,
  accIntensity: document.getElementById("acc-intensity") as HTMLInputElement,
  accIntensityV: document.getElementById("acc-intensity-v") as HTMLSpanElement,
  accReduced: document.getElementById("acc-reduced") as HTMLInputElement,
  accContrast: document.getElementById("acc-contrast") as HTMLInputElement,
  accSafe: document.getElementById("acc-safe") as HTMLInputElement,
  fullscreen: document.getElementById("fullscreen-btn") as HTMLButtonElement,
  recordToggle: document.getElementById("record-toggle") as HTMLButtonElement,
  recordStatus: document.getElementById("record-status") as HTMLSpanElement,
  coverImg: document.getElementById("cover-img") as HTMLImageElement,
  trackTitle: document.getElementById("track-title") as HTMLDivElement,
  trackArtist: document.getElementById("track-artist") as HTMLDivElement,
  screensaver: document.getElementById("screensaver") as HTMLDivElement
};

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
  elements.modeLabel.textContent = premium ? "In-page playback" : "Device control";
}

async function refreshDevices() {
  const devices = await getDevices();
  elements.devicePicker.innerHTML = "";
  devices.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.id || "";
    opt.textContent = `${d.name} ${d.is_active ? "•" : ""}`;
    elements.devicePicker.appendChild(opt);
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
      renderScale: parseFloat(q.qScale.value),
      msaa: parseInt(q.qMSAA.value),
      taa: q.qTAA.checked,
      bloom: parseFloat(q.qBloom.value),
      ssao: q.qSSAO.checked,
      motionBlur: q.qMoBlur.checked,
      dof: q.qDOF.checked,
      toneMap: q.qToneMap.value as any,
      chromaticAberration: parseFloat(q.qChroma.value),
      volumetrics: (q.qVol as any)?.checked ?? false,
      raymarchSteps: parseInt(q.qSteps.value),
      softShadowSamples: parseInt(q.qSoft.value),
      particleCount: parseInt(q.qParticles.value),
      fluidResolution: parseInt(q.qFluidRes.value),
      fluidIterations: parseInt(q.qFluidIters.value),
      webgpuPathTrace: q.qWebGPU.checked
    });
    q.qScaleV.textContent = `${parseFloat(q.qScale.value).toFixed(1)}x`;
    q.qMSAAV.textContent = q.qMSAA.value;
    q.qBloomV.textContent = q.qBloom.value;
    q.qChromaV.textContent = q.qChroma.value;
    q.qStepsV.textContent = q.qSteps.value;
    q.qSoftV.textContent = q.qSoft.value;
    q.qParticlesV.textContent = `${(parseInt(q.qParticles.value)/1e6).toFixed(1)}M`;
    q.qFluidResV.textContent = `${q.qFluidRes.value}²`;
    q.qFluidItersV.textContent = q.qFluidIters.value;
  };
  ["input","change"].forEach(evt => {
    [q.qScale,q.qMSAA,q.qTAA,q.qBloom,q.qSSAO,q.qMoBlur,q.qDOF,q.qToneMap,q.qChroma,q.qVol,q.qSteps,q.qSoft,q.qParticles,q.qFluidRes,q.qFluidIters,q.qWebGPU].forEach(el => el?.addEventListener(evt, apply));
  });
}

function hookAccessibility() {
  const apply = () => {
    const cfg = {
      epilepsySafe: elements.accEpilepsy?.checked ?? false,
      intensityLimiter: parseFloat(elements.accIntensity?.value || "1"),
      reducedMotion: elements.accReduced?.checked ?? false,
      highContrast: elements.accContrast?.checked ?? false
    };
    elements.accIntensityV.textContent = cfg.intensityLimiter.toFixed(2);
    setAccessibility(cfg);
    setSafeMode(!!elements.accSafe?.checked);
    if (elements.accSafe?.checked) {
      setScene("basic" as any);
    }
    document.body.style.filter = cfg.highContrast ? "contrast(1.15) saturate(1.15)" : "";
  };
  ["input","change"].forEach(evt => {
    [elements.accEpilepsy,elements.accIntensity,elements.accReduced,elements.accContrast,elements.accSafe].forEach(el => el?.addEventListener(evt, apply));
  });
  apply();
}

function hookVJ() {
  const apply = () => {
    setMacros({
      intensity: parseFloat(elements.vjIntensity.value),
      bloom: parseFloat(elements.vjBloom.value),
      glitch: parseFloat(elements.vjGlitch.value),
      speed: parseFloat(elements.vjSpeed.value)
    });
    elements.vjIntensityV.textContent = parseFloat(elements.vjIntensity.value).toFixed(2);
    elements.vjBloomV.textContent = parseFloat(elements.vjBloom.value).toFixed(2);
    elements.vjGlitchV.textContent = parseFloat(elements.vjGlitch.value).toFixed(2);
    elements.vjSpeedV.textContent = parseFloat(elements.vjSpeed.value).toFixed(2);
  };
  ["input","change"].forEach(evt => {
    [elements.vjIntensity, elements.vjBloom, elements.vjGlitch, elements.vjSpeed].forEach(el => el.addEventListener(evt, apply));
  });
  apply();

  elements.scenePicker.addEventListener("change", () => {
    const v = elements.scenePicker.value as any;
    setScene(v === "auto" ? "basic" : v);
  });
}

function hookControls() {
  elements.playpauseBtn.addEventListener("click", async () => { await playPause(); });
  elements.prevBtn.addEventListener("click", async () => { await prevTrack(); });
  elements.nextBtn.addEventListener("click", async () => { await nextTrack(); });
  elements.volumeRange.addEventListener("input", async () => {
    const vol = parseInt(elements.volumeRange.value);
    if (premium) await setDeviceVolume(vol);
    else await setVolume(vol);
  });
  elements.seekRange.addEventListener("change", async () => {
    const pos = parseInt(elements.seekRange.value);
    await seekMs(pos);
  });
  elements.devicePicker.addEventListener("change", async () => {
    const id = elements.devicePicker.value;
    currentDeviceId = id;
    await transferPlayback(id, false);
  });
  elements.fullscreen.addEventListener("click", async () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  const poke = () => {
    lastInteractionTs = Date.now();
    elements.screensaver.classList.remove("active");
  };
  ["mousemove","keydown","pointerdown","touchstart"].forEach(e => window.addEventListener(e, poke, { passive: true }));
  setInterval(() => {
    if (Date.now() - lastInteractionTs > 30000) elements.screensaver.classList.add("active");
  }, 1000);
}

function initRecordingUI() {
  initRecorder(getEngineCanvas(), (status) => {
    elements.recordStatus.textContent = status;
    elements.recordToggle.textContent = status.startsWith("recording") ? "Stop" : "Start";
  });
  elements.recordToggle.addEventListener("click", () => toggleRecording());
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
  setInterval(() => { elements.fpsLabel.textContent = `FPS: ${fps.value().toFixed(0)}`; }, 500);
  elements.gpuLabelEl.textContent = gpuLabel() + (isWebGL2Capable() ? " • WebGL2" : " • WebGL1");
}

async function onPlayerState() {
  const st = await currentState().catch(() => null);
  if (!st) return;
  const duration = st.item?.duration_ms ?? 0;
  const position = st.progress_ms ?? 0;
  if (duration && !isNaN(duration)) {
    if (!elements.seekRange.matches(":active")) {
      elements.seekRange.max = String(duration);
      elements.seekRange.value = String(position);
    }
    elements.seekLabel.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
  }
  if (st.item) {
    elements.trackTitle.textContent = st.item.name;
    elements.trackArtist.textContent = st.item.artists.map(a => a.name).join(", ");
    const coverUrl = st.item.album.images[0]?.url;
    if (coverUrl) {
      const cached = await getCachedCover(st.item.id, coverUrl).catch(() => null);
      const src = cached?.objectUrl ?? coverUrl;
      elements.coverImg.src = src;
      const pal = cached?.palette ?? await extractPalette(src).catch(() => ["#59ffa9","#5aaaff","#ff59be","#ffe459","#ff8a59"]);
      setUIPalette(pal);
      updatePalette(pal.map(c => c));
      savePaletteForTrack(st.item.id, coverUrl, pal).catch(() => {});
    }
    cacheTrackMeta(st.item).catch(() => {});
  }
}

async function main() {
  initAuthUI({ loginButton: elements.loginBtn, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, scopes });
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
    () => { onPlayerState(); }
  );

  await refreshDevices();
  autoPickScene();
  startRender();

  initDirector({
    onBeat: () => {
      elements.beatDot.style.transform = "scale(1.4)";
      elements.beatDot.style.boxShadow = "0 0 12px var(--accent)";
      setTimeout(() => {
        elements.beatDot.style.transform = "scale(1.0)";
        elements.beatDot.style.boxShadow = "none";
      }, 120);
    },
    onPhraseBoundary: () => {
      const selected = elements.scenePicker.value;
      if (selected === "auto") autoPickScene();
      else crossfadeToScene(selected as any, 1.0);
    },
    elements
  });

  setFrameGovernorTarget(60);
  setInterval(onPlayerState, 1000);
}

main().catch(err => {
  console.error(err);
  alert("Initialization error. Check console.");
});
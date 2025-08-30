import { getCurrentPlayback, getCurrentTrackFeatures } from "@spotify/api";
import { crossfadeToScene } from "@visuals/engine";
import { cacheAnalysis, getCachedAnalysis } from "@utils/indexeddb";

type DirectorOptions = {
  onBeat: () => void;
  onPhraseBoundary: (phraseIndex: number) => void;
  elements: {
    [k: string]: HTMLElement;
  }
};

let beats: { start: number; duration: number; }[] = [];
let bars: { start: number; duration: number; }[] = [];
let sections: { start: number; duration: number; }[] = [];
let trackId: string | null = null;
let phraseIndex = 0;
let autoCrossfade = true;
let cues: { bar: number; action: string }[] = [];

function secondsToMs(s: number) { return Math.round(s * 1000); }

export function initDirector(opts: DirectorOptions) {
  const { onBeat, onPhraseBoundary, elements } = opts;
  const autoChk = document.getElementById("dir-auto-crossfade") as HTMLInputElement;
  autoChk.addEventListener("change", () => autoCrossfade = autoChk.checked);

  const addBtn = document.getElementById("dir-add") as HTMLButtonElement;
  const barNumEl = document.getElementById("dir-bar-num") as HTMLInputElement;
  const cueTypeEl = document.getElementById("dir-cue-type") as HTMLSelectElement;
  const list = document.getElementById("dir-list") as HTMLDivElement;
  const clearBtn = document.getElementById("dir-clear") as HTMLButtonElement;

  const renderList = () => {
    if (!cues.length) { list.textContent = "No cues"; return; }
    list.innerHTML = cues.map(c => `<div class="chip">bar ${c.bar} → ${c.action}</div>`).join(" ");
  };

  addBtn.addEventListener("click", () => {
    const bar = parseInt(barNumEl.value);
    const action = cueTypeEl.value;
    if (Number.isFinite(bar)) {
      cues.push({ bar, action });
      renderList();
      persistCues();
    }
  });
  clearBtn.addEventListener("click", () => {
    cues = [];
    renderList();
    persistCues();
  });

  // main scheduler loop
  setInterval(async () => {
    const pb = await getCurrentPlayback();
    if (!pb?.item) return;
    if (pb.item.id !== trackId) {
      trackId = pb.item.id;
      await loadAnalysis(trackId);
      phraseIndex = 0;
      await loadCues(trackId);
      renderList();
    }
    const t = pb.progress_ms;
    // beat detection: find nearest beat
    const ibeat = beats.findIndex(b => secondsToMs(b.start) <= t && t < secondsToMs(b.start + b.duration));
    if (ibeat >= 0) {
      onBeat();
    }
    // phrase boundaries: every 4 bars
    const ibar = bars.findIndex(b => secondsToMs(b.start) <= t && t < secondsToMs(b.start + b.duration));
    if (ibar >= 0 && ibar % 4 === 0) {
      if (phraseIndex !== ibar / 4) {
        phraseIndex = ibar / 4;
        onPhraseBoundary(phraseIndex);
        if (autoCrossfade) {
          // crossfade to a different scene cyclically
          const order = ["particles","fluid","tunnel","terrain","type"];
          const idx = phraseIndex % order.length;
          crossfadeToScene(order[idx] as any, 1.5);
        }
      }
    }
    // apply cues at bar boundaries
    const prevBar = Math.max(0, ibar);
    const due = cues.filter(c => c.bar === prevBar + 1);
    for (const cue of due) {
      if (cue.action === "explode") {
        // implemented in scenes via macro spike
        const ev = new CustomEvent("vj-explode");
        window.dispatchEvent(ev);
      } else if (cue.action.startsWith("scene:")) {
        const scene = cue.action.split(":")[1];
        crossfadeToScene(scene as any, 1.2);
      }
    }
  }, 250);
}

async function loadAnalysis(id: string) {
  const cached = await getCachedAnalysis(id);
  if (cached) {
    beats = cached.analysis.beats;
    bars = cached.analysis.bars;
    sections = cached.analysis.sections;
    return;
  }
  const { feats, analysis } = await getCurrentTrackFeatures(id);
  beats = analysis.beats;
  bars = analysis.bars;
  sections = analysis.sections;
  cacheAnalysis(id, { features: feats, analysis }).catch(() => {});
}

async function persistCues() {
  if (!trackId) return;
  localStorage.setItem(`dwdw.cues:${trackId}`, JSON.stringify(cues));
}

async function loadCues(id: string) {
  const raw = localStorage.getItem(`dwdw.cues:${id}`);
  cues = raw ? JSON.parse(raw) : [];
}
import { crossfadeToScene } from "@visuals/engine";
import { getCurrentPlayback, getCurrentTrackFeatures } from "@spotify/api";

type DirectorInitOpts = {
  onBeat?: (bar?: number) => void;
  onPhraseBoundary?: (phraseIndex: number) => void;
  elements?: any;
};

type Cue = {
  bar: number;
  type: string;
};

let cues: Cue[] = [];
let autoCrossfade = true;

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return (document.getElementById(id) as T) || null;
}

function updateCueList() {
  const list = byId<HTMLDivElement>("dir-list");
  if (!list) return;
  if (!cues.length) {
    list.textContent = "No cues";
    return;
  }
  list.innerHTML = cues.map((c) => `<div class="tag">bar ${c.bar}: ${c.type}</div>`).join("");
}

function wireUI() {
  const auto = byId<HTMLInputElement>("dir-auto-crossfade");
  const barInput = byId<HTMLInputElement>("dir-bar-num");
  const cueType = byId<HTMLSelectElement>("dir-cue-type");
  const addBtn = byId<HTMLButtonElement>("dir-add");
  const clearBtn = byId<HTMLButtonElement>("dir-clear");

  auto?.addEventListener("change", () => {
    autoCrossfade = !!auto.checked;
  });

  addBtn?.addEventListener("click", () => {
    const bar = parseInt(barInput?.value || "1", 10) || 1;
    const type = cueType?.value || "explode";
    cues.push({ bar, type });
    cues.sort((a, b) => a.bar - b.bar);
    updateCueList();
  });

  clearBtn?.addEventListener("click", () => {
    cues = [];
    updateCueList();
  });

  updateCueList();
}

function applyCue(cue: Cue) {
  if (cue.type === "explode") {
    window.dispatchEvent(new CustomEvent("vj-explode"));
    return;
  }
  if (cue.type.startsWith("scene:")) {
    const scene = cue.type.split(":")[1] as any;
    crossfadeToScene(scene, 0);
    return;
  }
}

async function pollPlayback(opts?: DirectorInitOpts) {
  try {
    const playback = await getCurrentPlayback().catch(() => null);
    if (!playback || !playback.item || !playback.is_playing) return;

    const progressMs = playback.progress_ms ?? 0;
    const features = await getCurrentTrackFeatures(playback.item.id).catch(() => null);
    const beatDuration = features?.tempo ? 60_000 / features.tempo : 2000;
    const barDuration = beatDuration * 4;
    const barIndex = Math.floor(progressMs / barDuration);

    opts?.onBeat?.(barIndex);

    cues.filter((c) => c.bar === barIndex).forEach((c) => applyCue(c));

    if (autoCrossfade && barIndex % 16 === 0 && barIndex > 0) {
      opts?.onPhraseBoundary?.(barIndex / 16);
    }
  } catch {
    // silent
  }
}

let intervalId: number | null = null;

export function initDirector(opts: DirectorInitOpts = {}) {
  wireUI();

  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  intervalId = window.setInterval(() => {
    pollPlayback(opts);
  }, 500);

  return {
    addCue(bar: number, type: string) {
      cues.push({ bar, type });
      cues.sort((a, b) => a.bar - b.bar);
      updateCueList();
    },
    clearCues() {
      cues = [];
      updateCueList();
    },
    setAutoCrossfade(on: boolean) {
      autoCrossfade = on;
      const auto = byId<HTMLInputElement>("dir-auto-crossfade");
      if (auto) auto.checked = on;
    }
  };
}
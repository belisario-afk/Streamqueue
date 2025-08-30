let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let onStatus: (s: string) => void;
let canvas: HTMLCanvasElement;

export function initRecorder(c: HTMLCanvasElement, cb: (status: string) => void) {
  canvas = c;
  onStatus = cb;
}

export function toggleRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    const stream = canvas.captureStream(60);
    mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 8_000_000 });
    chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dwdw-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      onStatus?.("saved");
      setTimeout(() => onStatus?.("idle"), 1000);
    };
    mediaRecorder.start();
    onStatus?.("recording…");
  } else {
    mediaRecorder.stop();
    onStatus?.("processing…");
  }
}
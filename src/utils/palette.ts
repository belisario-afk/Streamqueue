import tinycolor from "tinycolor2";

export async function extractPalette(src: string, colorCount = 5): Promise<string[]> {
  const img = await loadImage(src);
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d")!;
  const w = cvs.width = 200;
  const h = cvs.height = Math.max(1, Math.round(w * img.height / img.width));
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  // Simple K-means
  const samples: number[][] = [];
  for (let i = 0; i < data.length; i += 4 * 8) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const tc = tinycolor({ r, g, b });
    const { h, s, v } = tc.toHsv();
    samples.push([h/360, s, v]);
  }
  let centroids = Array.from({ length: colorCount }, (_, i) => samples[(i * samples.length / colorCount) | 0]);
  for (let iter = 0; iter < 10; iter++) {
    const buckets: number[][][] = Array.from({ length: colorCount }, () => []);
    for (const s of samples) {
      let best = 0, bestD = 1e9;
      for (let c = 0; c < colorCount; c++) {
        const d = hsvDist(s, centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      buckets[best].push(s);
    }
    for (let c = 0; c < colorCount; c++) {
      const b = buckets[c];
      if (b.length) {
        const mean = [0,0,0];
        for (const s of b) { mean[0]+=s[0]; mean[1]+=s[1]; mean[2]+=s[2]; }
        centroids[c] = mean.map(v => v/b.length) as any;
      }
    }
  }
  const sorted = centroids.sort((a,b) => b[2] - a[2]);
  return sorted.map(hsv => tinycolor({ h: hsv[0]*360, s: hsv[1], v: Math.min(1, hsv[2]*1.05) }).toHexString());
}

function hsvDist(a: number[], b: number[]) {
  const dh = Math.min(Math.abs(a[0]-b[0]), 1 - Math.abs(a[0]-b[0]));
  const ds = Math.abs(a[1]-b[1]);
  const dv = Math.abs(a[2]-b[2]);
  return dh*2 + ds + dv;
}
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
export function fpsMeter() {
  let last = performance.now();
  let frames = 0;
  let fps = 0;
  function tick() {
    const now = performance.now();
    frames++;
    if (now - last >= 1000) {
      fps = frames * 1000 / (now - last);
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return {
    value: () => fps
  };
}
export function gpuLabel() {
  const gl = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
  if (!gl) return "No WebGL";
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter((gl as any).RENDERER);
  return String(renderer || "WebGL");
}
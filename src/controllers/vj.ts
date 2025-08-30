export function initVJ() {
  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "1") dispatchScene("particles");
    if (e.key === "2") dispatchScene("fluid");
    if (e.key === "3") dispatchScene("tunnel");
    if (e.key === "4") dispatchScene("terrain");
    if (e.key === "5") dispatchScene("type");
    if (e.key === " ") window.dispatchEvent(new CustomEvent("vj-explode"));
  });

  // Web MIDI
  if ((navigator as any).requestMIDIAccess) {
    (navigator as any).requestMIDIAccess().then((access: any) => {
      const status = document.getElementById("midi-status")!;
      status.textContent = "connected";
      access.inputs.forEach((input: any) => {
        input.onmidimessage = (msg: any) => {
          const [status, data1, data2] = msg.data;
          const type = status & 0xf0;
          if (type === 0xb0) { // CC
            const cc = data1;
            const v = data2 / 127;
            if (cc === 1) setMacro("intensity", v);
            if (cc === 2) setMacro("bloom", v * 3);
            if (cc === 3) setMacro("glitch", v);
            if (cc === 4) setMacro("speed", 0.1 + v * 2.9);
          }
          if (type === 0x90 && data2 > 0) { // Note on
            if (data1 === 36) window.dispatchEvent(new CustomEvent("vj-explode"));
          }
        };
      });
    }).catch(() => {
      const status = document.getElementById("midi-status")!;
      status.textContent = "denied";
    });
  }
}

function setMacro(name: string, value: number) {
  window.dispatchEvent(new CustomEvent("vj-macro", { detail: { name, value } }));
}

function dispatchScene(scene: string) {
  window.dispatchEvent(new CustomEvent("vj-scene", { detail: { scene } }));
}
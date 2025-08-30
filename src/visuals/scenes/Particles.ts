import * as THREE from "three";

export class ParticlesScene {
  scene = new THREE.Scene();
  name = "particles";
  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.InstancedBufferGeometry | THREE.BufferGeometry;
  private time = 0;
  private palette = ["#59ffa9","#5aaaff","#ff59be","#ffe459","#ff8a59"];
  private params = { intensity: 0.6, glitch: 0.1, speed: 1.0 };

  constructor(private opts: any) {
    const count = Math.min(5_000_000, Math.max(250_000, opts.quality().particleCount));
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.cbrt(Math.random()) * 2.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2*Math.random()-1);
      positions[i*3+0] = r*Math.sin(phi)*Math.cos(theta);
      positions[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
      positions[i*3+2] = r*Math.cos(phi);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: this.params.intensity },
        uGlitch: { value: this.params.glitch },
        uSpeed: { value: this.params.speed },
        uPalette: { value: this.palette.map(c => new THREE.Color(c)) }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uGlitch;
        uniform float uSpeed;
        attribute vec3 position;
        varying vec3 vPos;
        float hash(float n){ return fract(sin(n)*43758.5453123); }
        void main() {
          vPos = position;
          float t = uTime * uSpeed;
          vec3 p = position;
          // curl-like displacement
          float n = sin(dot(p, vec3(1.3,2.1,0.7)) + t) + cos(dot(p, vec3(-0.7,1.9,1.3)) - t);
          p += 0.15 * vec3(sin(n+t), cos(n-t*1.3), sin(n*0.7+t*0.9));
          // occasional glitch kick
          p += uGlitch * 0.2 * vec3(sin(t*10.0+position.x), cos(t*11.0+position.y), sin(t*9.0+position.z));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 1.0 + 2.5 * (1.0 / -gl_Position.z);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uIntensity;
        uniform vec3 uPalette[5];
        varying vec3 vPos;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float d = dot(uv, uv);
          if (d > 1.0) discard;
          float a = smoothstep(1.0, 0.0, d) * uIntensity;
          vec3 col = mix(uPalette[0], uPalette[1], clamp((vPos.x+2.5)/5.0, 0.0, 1.0));
          col = mix(col, uPalette[2], clamp((vPos.y+2.5)/5.0, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
    this.scene.fog = new THREE.FogExp2(0x020205, 0.1);
  }
  start() {}
  stop() {
    this.geometry.dispose();
    this.material.dispose();
  }
  update(dt: number, t: number) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
  }
  setPalette(colors: string[]) {
    this.palette = colors;
    this.material.uniforms.uPalette.value = colors.map(c => new THREE.Color(c));
  }
  onMacro(name: string, value: number) {
    if (name === "intensity") this.material.uniforms.uIntensity.value = value;
    if (name === "glitch") this.material.uniforms.uGlitch.value = value;
    if (name === "speed") this.material.uniforms.uSpeed.value = value;
  }
  setQuality(q: any) {}
  onExplode() {
    this.material.uniforms.uGlitch.value = Math.min(1.0, this.material.uniforms.uGlitch.value + 0.4);
    setTimeout(() => this.material.uniforms.uGlitch.value *= 0.5, 400);
  }
}
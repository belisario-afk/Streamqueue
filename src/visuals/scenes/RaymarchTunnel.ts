import * as THREE from "three";

export class TunnelScene {
  scene = new THREE.Scene();
  name = "tunnel";
  private quad: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private steps = 512;
  private palette = ["#59ffa9","#5aaaff","#ff59be","#ffe459","#ff8a59"];
  private params = { intensity: 0.7, speed: 1.0, chroma: 0.12 };

  constructor(private opts: any) {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.steps = Math.max(256, Math.min(1024, this.opts.quality().raymarchSteps));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSteps: { value: this.steps },
        uPalette: { value: this.palette.map(c => new THREE.Color(c)) },
        uIntensity: { value: this.params.intensity },
        uSpeed: { value: this.params.speed },
        uChroma: { value: this.params.chroma }
      },
      fragmentShader: `
        precision highp float;
        uniform float uTime, uSteps, uIntensity, uSpeed, uChroma;
        uniform vec3 uPalette[5];
        varying vec2 vUv;
        float sdTorus( vec3 p, vec2 t ) {
          vec2 q = vec2(length(p.xz)-t.x,p.y);
          return length(q)-t.y;
        }
        float map(vec3 p, out vec3 col) {
          float k = 0.0;
          // kaleidoscope fold
          p.xy = abs(p.xy); p.xz = abs(p.xz);
          float d = sdTorus(p + vec3(0.0, 0.0, sin(uTime*0.5)*0.3), vec2(1.0, 0.25));
          k = smoothstep(1.0, 0.0, d+0.3);
          col = mix(uPalette[0], uPalette[1], k);
          return d;
        }
        vec3 raymarch(vec3 ro, vec3 rd){
          float t = 0.0;
          vec3 col = vec3(0.0);
          for (int i=0; i<1024; i++){
            if (float(i) > uSteps) break;
            vec3 p = ro + rd * t;
            vec3 c; float d = map(p, c);
            float glow = clamp(0.02 / max(0.001, d+0.02), 0.0, 1.0);
            col += c * glow * 0.015 * uIntensity;
            t += clamp(d*0.6, 0.01, 0.2);
            if (t > 20.0) break;
          }
          return col;
        }
        void main(){
          vec2 uv = (gl_FragCoord.xy / vec2(${Math.max(1, window.innerWidth)}., ${Math.max(1, window.innerHeight)}.)) * 2.0 - 1.0;
          uv.x *= ${window.innerWidth / Math.max(1, window.innerHeight)}.;
          float t = uTime * uSpeed;
          vec3 ro = vec3(0.0, 0.0, -4.0 + sin(t*0.2)*0.5);
          vec3 rd = normalize(vec3(uv, 1.5));
          vec3 col = raymarch(ro, rd);
          // chromatic aberration
          vec2 shift = uv * uChroma * 0.001;
          vec3 colR = raymarch(ro, normalize(vec3(uv+shift, 1.5)));
          vec3 colB = raymarch(ro, normalize(vec3(uv-shift, 1.5)));
          col = vec3(colR.r, col.g, colB.b);
          col = pow(col, vec3(1.2));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`
    });
    this.quad = new THREE.Mesh(geo, this.mat);
    this.scene.add(this.quad);
  }
  start() {}
  stop() {
    this.quad.geometry.dispose(); this.mat.dispose();
  }
  update(dt: number, t: number) {
    this.mat.uniforms.uTime.value = t;
  }
  setPalette(colors: string[]) {
    this.palette = colors;
    this.mat.uniforms.uPalette.value = colors.map(c => new THREE.Color(c));
  }
  onMacro(name: string, value: number) {
    if (name === "intensity") this.mat.uniforms.uIntensity.value = value;
    if (name === "speed") this.mat.uniforms.uSpeed.value = value;
    if (name === "glitch") this.mat.uniforms.uChroma.value = 0.05 + value * 0.25;
  }
  setQuality(q: any) {
    this.mat.uniforms.uSteps.value = Math.max(256, Math.min(1024, q.raymarchSteps));
  }
  onExplode() {
    this.mat.uniforms.uIntensity.value = Math.min(3.0, (this.mat.uniforms.uIntensity.value as number) + 0.6);
    setTimeout(() => this.mat.uniforms.uIntensity.value = 0.7, 600);
  }
}
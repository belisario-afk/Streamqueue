import * as THREE from "three";

export class Fluid2DScene {
  scene = new THREE.Scene();
  name = "fluid";
  private quad: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private palette = ["#59ffa9","#5aaaff","#ff59be","#ffe459","#ff8a59"];
  private params = { intensity: 0.6, speed: 1.0, dye: 0.8, iters: 30 };
  private renderer: THREE.WebGLRenderer;

  constructor(private opts: any) {
    this.renderer = opts.renderer as THREE.WebGLRenderer;
    const res = Math.max(256, Math.min(2048, opts.quality().fluidResolution));
    const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false } as any;
    this.rtA = new THREE.WebGLRenderTarget(res, res, pars);
    this.rtB = new THREE.WebGLRenderTarget(res, res, pars);

    const geo = new THREE.PlaneGeometry(2, 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.rtA.texture },
        uTime: { value: 0 },
        uIntensity: { value: this.params.intensity },
        uDye: { value: this.params.dye },
        uPalette: { value: this.palette.map(c => new THREE.Color(c)) }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uDye;
        uniform vec3 uPalette[5];
        // pseudo fluid advection + vorticity-ish curl flow
        vec2 curl(vec2 p){
          float e=0.002;
          float n1 = texture2D(uTex, p+vec2(0.,e)).x - texture2D(uTex, p-vec2(0.,e)).x;
          float n2 = texture2D(uTex, p+vec2(e,0.)).y - texture2D(uTex, p-vec2(e,0.)).y;
          return vec2(n1, -n2);
        }
        void main(){
          vec2 uv = vUv;
          vec4 col = texture2D(uTex, uv);
          // inject dye pulses synced to time
          float pulse = smoothstep(0.99,1.0,fract(uTime*0.5));
          vec3 dye = mix(uPalette[0], uPalette[1], fract(sin(uTime)*0.5+0.5));
          col.rgb = mix(col.rgb, dye, pulse * 0.08 * uDye);
          // flow
          vec2 v = curl(uv + vec2(sin(uTime*0.2), cos(uTime*0.25))*0.05);
          uv -= v * 0.02 * (0.5 + uIntensity);
          vec3 adv = texture2D(uTex, uv).rgb;
          // decay
          adv *= 0.995;
          gl_FragColor = vec4(adv, 1.0);
        }
      `
    });
    this.quad = new THREE.Mesh(geo, this.mat);
    this.scene.add(this.quad);
  }
  start() {}
  stop() {
    this.rtA.dispose(); this.rtB.dispose();
    this.quad.geometry.dispose(); this.mat.dispose();
  }
  update(dt: number, t: number) {
    this.mat.uniforms.uTime.value = t * this.params.speed;
    // ping-pong a few iterations for smoother look
    const iters = Math.min(80, Math.max(10, this.params.iters));
    for (let i = 0; i < iters; i++) {
      this.mat.uniforms.uTex.value = this.rtA.texture;
      this.renderer.setRenderTarget(this.rtB);
      this.renderer.render(this.scene, (this.opts.camera as any));
      this.renderer.setRenderTarget(null);
      // swap
      const tmp = this.rtA; this.rtA = this.rtB; this.rtB = tmp;
    }
  }
  setPalette(colors: string[]) {
    this.palette = colors;
    this.mat.uniforms.uPalette.value = colors.map(c => new THREE.Color(c));
  }
  onMacro(name: string, value: number) {
    if (name === "intensity") this.mat.uniforms.uIntensity.value = value;
    if (name === "speed") this.params.speed = value;
  }
  setQuality(q: any) {
    this.params.iters = q.fluidIterations;
  }
  onExplode() {
    this.mat.uniforms.uDye.value = 1.5;
    setTimeout(() => this.mat.uniforms.uDye.value = 0.8, 400);
  }
}
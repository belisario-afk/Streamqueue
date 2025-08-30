import * as THREE from "three";

export class TerrainScene {
  scene = new THREE.Scene();
  name = "terrain";
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private palette = ["#59ffa9","#5aaaff","#ff59be","#ffe459","#ff8a59"];
  private params = { intensity: 0.7, speed: 1.0 };

  constructor(private opts: any) {
    const geo = new THREE.PlaneGeometry(20, 20, 256, 256);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPalette: { value: this.palette.map(c => new THREE.Color(c)) },
        uIntensity: { value: this.params.intensity },
        uSpeed: { value: this.params.speed }
      },
      vertexShader: `
        uniform float uTime, uIntensity, uSpeed;
        varying vec2 vUv;
        varying float vH;
        float fbm(vec2 p){
          float v=0.0; float a=0.5;
          for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; }
          return v;
        }
        // Simplex-like noise from IQ (compact placeholder)
        float noise(vec2 p){
          return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453);
        }
        void main(){
          vUv = uv;
          vec3 pos = position;
          float t = uTime * uSpeed;
          float n = fbm((uv*4.0)+vec2(t*0.1, -t*0.12));
          pos.z += (n - 0.5) * 2.0 * uIntensity;
          vH = n;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        varying float vH;
        uniform vec3 uPalette[5];
        void main(){
          vec3 a = mix(uPalette[4], uPalette[3], smoothstep(0.0,1.0,vH));
          vec3 b = mix(uPalette[0], uPalette[1], vH);
          vec3 c = mix(a,b,0.5);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      wireframe: false
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.rotation.x = -Math.PI/3;
    this.mesh.position.y = -2.0;
    this.scene.add(this.mesh);
    const light = new THREE.DirectionalLight(0xffffff, 0.2); light.position.set(3,5,2); this.scene.add(light);
  }
  start() {}
  stop() {
    this.mesh.geometry.dispose(); this.mat.dispose();
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
  }
  onExplode() {
    this.mat.uniforms.uIntensity.value = Math.min(3.0, (this.mat.uniforms.uIntensity.value as number) + 0.6);
    setTimeout(() => this.mat.uniforms.uIntensity.value = 0.7, 600);
  }
}
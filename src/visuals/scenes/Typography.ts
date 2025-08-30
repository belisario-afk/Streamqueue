import * as THREE from "three";

export class TypographyScene {
  scene = new THREE.Scene();
  name = "type";
  private group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private palette = ["#59ffa9","#5aaaff","#ff59be","#ffe459","#ff8a59"];
  private params = { intensity: 0.8, speed: 1.0, weight: 400, stretch: 100 };

  constructor(private opts: any) {
    const geo = new THREE.PlaneGeometry(2, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPalette: { value: this.palette.map(c => new THREE.Color(c)) },
        uIntensity: { value: this.params.intensity }
      },
      vertexShader: `
        uniform float uTime, uIntensity;
        varying vec2 vUv;
        void main(){
          vUv=uv;
          vec3 p = position;
          p.y += sin(p.x*8.0 + uTime*2.0) * 0.05 * uIntensity;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform vec3 uPalette[5];
        void main(){
          vec3 col = mix(uPalette[0], uPalette[2], vUv.x);
          float alpha = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          gl_FragColor = vec4(col, alpha);
        }`,
      transparent: true
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.group.add(this.mesh);
    this.scene.add(this.group);
  }
  start() {}
  stop() {
    this.mesh.geometry.dispose(); this.mat.dispose();
  }
  update(dt: number, t: number) {
    this.mat.uniforms.uTime.value = t * this.params.speed;
    this.group.rotation.y = Math.sin(t*0.2)*0.2;
    this.group.position.z = -1.5;
  }
  setPalette(colors: string[]) {
    this.palette = colors;
    this.mat.uniforms.uPalette.value = colors.map(c => new THREE.Color(c));
  }
  onMacro(name: string, value: number) {
    if (name === "intensity") this.mat.uniforms.uIntensity.value = value;
    if (name === "speed") this.params.speed = value;
  }
  onExplode() {
    this.params.speed = 2.5;
    setTimeout(() => this.params.speed = 1.0, 600);
  }
}
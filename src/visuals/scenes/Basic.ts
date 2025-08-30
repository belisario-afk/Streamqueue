import * as THREE from "three";
import type { IScene } from "../engine";

export class BasicScene implements IScene {
  name = "basic";
  scene = new THREE.Scene();
  private mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uPalette: {
      value: [new THREE.Color("#59ffa9"), new THREE.Color("#5aaaff"), new THREE.Color("#ff59be")]
    },
    uResolution: { value: new THREE.Vector2(1920, 1080) }
  };

  constructor() {
    const geom = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        void main(){
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform float uTime;
        uniform vec3 uPalette[3];
        uniform vec2 uResolution;

        void main(){
          vec2 uv = gl_FragCoord.xy / uResolution;
          float w = 0.5 + 0.5 * sin(uv.x * 10.0 + uTime * 0.7);
          vec3 c = mix(uPalette[0], uPalette[1], uv.x);
          c = mix(c, uPalette[2], w * 0.8);
          gl_FragColor = vec4(c, 1.0);
        }
      `
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.mesh);
  }

  start(): void {}
  stop(): void {}

  update(_dt: number, t: number): void {
    this.uniforms.uTime.value = t;

    // Try to keep resolution uniform in sync with canvas size if available
    const canvas = (this.scene as any).__rendererCanvas as HTMLCanvasElement | undefined;
    if (canvas) {
      this.uniforms.uResolution.value.set(canvas.width, canvas.height);
    }
  }

  setPalette(colors: string[]): void {
    (this.uniforms.uPalette.value as any) = [0, 1, 2].map((i) => new THREE.Color(colors[i] || "#888"));
  }

  onMacro?(name: string, value: number): void {}
}
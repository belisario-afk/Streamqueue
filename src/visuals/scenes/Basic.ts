import * as THREE from "three";
import type { IScene } from "../engine";

export class BasicScene implements IScene {
  scene = new THREE.Scene();
  name = "basic";
  private mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;
  private t = 0;

  constructor() {
    this.uniforms = {
      uTime: { value: 0 },
      uColors: { value: [new THREE.Color("#59ffa9"), new THREE.Color("#5aaaff"), new THREE.Color("#ff59be")] }
    };
    const geom = new THREE.PlaneGeometry(2, 2, 1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColors[3];

        float wave(vec2 p) {
          return 0.5 + 0.5*sin(10.0*p.x + 6.0*p.y + uTime*0.6);
        }

        void main() {
          float w = wave(vUv*vec2(1.0,1.0));
          vec3 c = mix(uColors[0], uColors[1], vUv.x);
          c = mix(c, uColors[2], w*0.7);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.scene.add(this.mesh);
  }

  start(): void {}
  stop(): void {}
  update(dt: number, t: number): void {
    this.t += dt;
    this.uniforms.uTime.value = this.t;
  }

  setPalette(colors: string[]): void {
    const cols = [
      new THREE.Color(colors[0] || "#59ffa9"),
      new THREE.Color(colors[1] || "#5aaaff"),
      new THREE.Color(colors[2] || "#ff59be")
    ];
    this.uniforms.uColors.value = cols as any;
  }

  onMacro?(name: string, value: number): void {
    // Could map intensity to subtle modulation in future
  }
}
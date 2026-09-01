/**
 * 海景背景層 —— 掛進卡包輪播那個既有的 Three.js 場景裡
 *
 * **為什麼不自己開一個 canvas**：抽卡商品頁上半部那格已經有一個 WebGL context
 * 在跑（`PackShowcase3D` 的卡包輪播）。同一塊 375×466 再開第二個 context，
 * 中低階手機會明顯發燙掉幀，而且 context 數量本來就有上限。
 * 這裡改成共用同一個 renderer：多的只是一次 draw call。
 *
 * 兩道省錢的手續（shader 本身的成本見 `lib/oceanSky.ts` 的說明）：
 *
 *   1. **半解析度**：海面畫進一張 `SKY_SCALE` 倍大小的 render target，
 *      再整張貼回畫面。天空與海是大面積的漸層，縮小看不出來，成本卻是平方關係。
 *      卡包本身照樣是全解析度 —— 它才是玩家會盯著看的東西。
 *   2. **降到 30fps**：海浪很慢，30fps 完全看不出來；卡包仍然 60fps，
 *      因為每一幀都只是把那張貼圖畫上去，不重算海面。
 *
 * 兩個常數都在下面，要調畫質／效能改它們就好。
 */
import * as THREE from 'three';
import { OCEAN_FRAGMENT_SHADER, OCEAN_VERTEX_SHADER, stopIndexAndBlend } from '@/lib/oceanSky';

/** 海面的算圖解析度（相對於畫布）。1 = 全解析度 */
const SKY_SCALE = 0.6;
/** 海面重算的頻率。卡包不受影響，仍然每幀都畫 */
const SKY_FPS = 30;

const BLIT_FRAGMENT = /* glsl */ `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }
`;

const BLIT_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export interface OceanSkyLayer {
  /** 畫布尺寸變了要叫一次（傳 drawing buffer 的像素數，不是 CSS 尺寸） */
  setSize(width: number, height: number): void;
  /**
   * 把海景畫到畫面上。要在卡包那個 scene **之前**呼叫。
   *
   * @param s        天色進度 0~1（由 `lib/oceanSky` 的時間曲線給）
   * @param sun      太陽相位（0 日出／0.5 正午／1 日落，區間外在地平線下）
   * @param waveTime 波浪用的時間（秒）
   * @param nowMs    現在時間，用來決定這一幀要不要重算海面
   * @param intervalMs 兩次重算之間至少要隔多久（預設 1000/SKY_FPS）。
   *                   `prefers-reduced-motion` 時傳一個很大的值，海就不會動
   */
  render(s: number, sun: number, waveTime: number, nowMs: number, intervalMs?: number): void;
  dispose(): void;
}

export function createOceanSkyLayer(renderer: THREE.WebGLRenderer): OceanSkyLayer {
  const quad = new THREE.PlaneGeometry(2, 2);
  /* 正交相機 + 蓋滿裁剪空間的方片：vertex shader 直接吐 clip space 座標，
     所以這顆相機其實不影響結果，只是 Three 的 render() 一定要收一個 */
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uR: { value: new THREE.Vector2(1, 1) },
    uT: { value: 0 },
    uS: { value: 0.5 },
    uSc: { value: 2 },
    uBl: { value: 0 },
    uSun: { value: 0.5 },
  };

  const oceanMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });
  const oceanScene = new THREE.Scene();
  const oceanMesh = new THREE.Mesh(quad, oceanMat);
  oceanMesh.frustumCulled = false;
  oceanScene.add(oceanMesh);

  const target = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;

  const blitMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: target.texture } },
    vertexShader: BLIT_VERTEX,
    fragmentShader: BLIT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const blitScene = new THREE.Scene();
  const blitMesh = new THREE.Mesh(quad, blitMat);
  blitMesh.frustumCulled = false;
  blitScene.add(blitMesh);

  let lastSkyAt = -Infinity;
  let painted = false;

  return {
    setSize(width: number, height: number) {
      const w = Math.max(1, Math.round(width * SKY_SCALE));
      const h = Math.max(1, Math.round(height * SKY_SCALE));
      target.setSize(w, h);
      uniforms.uR.value.set(w, h);
      // 尺寸一變舊的內容就作廢，下一幀一定要重算
      painted = false;
    },

    render(s: number, sun: number, waveTime: number, nowMs: number, intervalMs = 1000 / SKY_FPS) {
      const due = nowMs - lastSkyAt >= intervalMs;
      if (!painted || due) {
        lastSkyAt = nowMs;
        painted = true;
        const { index, blend } = stopIndexAndBlend(s);
        uniforms.uS.value = s;
        uniforms.uSc.value = index;
        uniforms.uBl.value = blend;
        uniforms.uSun.value = sun;
        uniforms.uT.value = waveTime;
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(target);
        renderer.render(oceanScene, camera);
        renderer.setRenderTarget(prev);
      }
      renderer.render(blitScene, camera);
    },

    dispose() {
      quad.dispose();
      oceanMat.dispose();
      blitMat.dispose();
      target.dispose();
    },
  };
}

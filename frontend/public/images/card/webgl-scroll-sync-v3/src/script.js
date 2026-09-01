const canvas = document.getElementById("webgl_canvas");
const gl = canvas.getContext("webgl", {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance"
});

if (!gl) {
  canvas.style.background = "#0a0a0f";
  throw new Error("WebGL not supported");
}

const vs = `
attribute vec2 a;
void main() {
  gl_Position = vec4(a, 0.0, 1.0);
}
`;

const fs = `
precision highp float;

uniform vec2  uR;
uniform float uT, uS, uSc, uBl;
uniform vec3  uBg;

#define PI 3.14159265359
#define TAU 6.28318530718
#define MARCH_STEPS 22
#define REFINE_STEPS 5

float sat(float x) {
  return clamp(x, 0.0, 1.0);
}

float smoother(float x) {
  x = sat(x);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

vec3 sCol(vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
  int si = int(uSc);
  vec3 a = c0;
  vec3 b = c1;
  if (si == 1) { a = c1; b = c2; }
  else if (si == 2) { a = c2; b = c3; }
  else if (si == 3) { a = c3; b = c4; }
  return mix(a, b, uBl);
}

float sF(float c0, float c1, float c2, float c3, float c4) {
  int si = int(uSc);
  float a = c0;
  float b = c1;
  if (si == 1) { a = c1; b = c2; }
  else if (si == 2) { a = c2; b = c3; }
  else if (si == 3) { a = c3; b = c4; }
  return mix(a, b, uBl);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float waveH(vec2 p, float t, float amp, float storm) {
  float h = 0.0;

  vec2 swell1 = normalize(vec2(1.0, 0.28));
  vec2 swell2 = normalize(vec2(-0.48, 0.88));
  vec2 swell3 = normalize(vec2(0.82, -0.16));

  swell2 = rot(storm * 0.18) * swell2;
  swell3 = rot(-storm * 0.14) * swell3;

  float d1 = dot(p, swell1);
  float d2 = dot(p, swell2);
  float d3 = dot(p, swell3);

  h += amp * 0.66 * sin(d1 * 0.42 + t * 0.38);
  h += amp * 0.22 * sin(d1 * 0.94 - t * 0.62);
  h += amp * 0.14 * sin(d2 * 1.18 - t * 0.82);
  h += amp * 0.09 * sin(d3 * 1.82 + t * 1.04);

  h += amp * (0.11 + storm * 0.07) * sin(p.x * 1.45 - t * 0.76 + p.y * 0.66);
  h += amp * (0.07 + storm * 0.05) * sin(p.x * 2.85 + t * 1.06 - p.y * 0.52);
  h += amp * (0.04 + storm * 0.03) * sin(p.x * 4.60 - t * 1.50 + p.y * 1.02);

  float micro = noise(p * 14.0 + vec2(t * 0.18, t * 0.06)) - 0.5;
  h += micro * amp * (0.010 + storm * 0.008);

  return h;
}

vec3 waveNorm(vec2 p, float t, float amp, float storm) {
  float e = 0.018;
  float hL = waveH(p - vec2(e, 0.0), t, amp, storm);
  float hR = waveH(p + vec2(e, 0.0), t, amp, storm);
  float hD = waveH(p - vec2(0.0, e), t, amp, storm);
  float hU = waveH(p + vec2(0.0, e), t, amp, storm);
  return normalize(vec3(-(hR - hL) / (2.0 * e), 1.0, -(hU - hD) / (2.0 * e)));
}

float starField(vec2 uv) {
  vec2 gv = floor(uv);
  vec2 lv = fract(uv) - 0.5;

  float h = hash(gv);
  float size = mix(0.012, 0.0025, h);
  float d = length(lv + vec2(hash(gv + 3.1) - 0.5, hash(gv + 7.3) - 0.5) * 0.25);
  float star = smoothstep(size, 0.0, d);
  star *= smoothstep(0.82, 1.0, h);
  return star;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uR * 0.5) / uR.y;

  float s = smoother(uS);

  float camY = mix(1.14, 1.03, s);
  camY += sin(s * PI * 1.4) * 0.028;
  float camZ = mix(0.08, -0.18, s);
  float pitch = mix(0.115, 0.088, s);

  vec3 ro = vec3(0.0, camY, camZ);
  vec3 rd = normalize(vec3(uv.x, uv.y - pitch, -1.4));

  float storm = smoothstep(0.80, 1.0, s);
  float night = smoothstep(0.56, 0.84, s);

  vec3 skyTop = sCol(
    vec3(0.18, 0.06, 0.24),
    vec3(0.05, 0.24, 0.68),
    vec3(0.26, 0.06, 0.04),
    vec3(0.01, 0.01, 0.05),
    vec3(0.04, 0.05, 0.09)
  );

  vec3 skyHori = sCol(
    vec3(0.92, 0.48, 0.18),
    vec3(0.42, 0.62, 0.90),
    vec3(0.88, 0.32, 0.04),
    vec3(0.03, 0.05, 0.14),
    vec3(0.15, 0.17, 0.23)
  );

  vec3 sunCol = sCol(
    vec3(1.0, 0.62, 0.22),
    vec3(1.0, 0.96, 0.80),
    vec3(1.0, 0.38, 0.05),
    vec3(0.70, 0.75, 0.94),
    vec3(0.26, 0.28, 0.34)
  );

  vec3 seaDeep = sCol(
    vec3(0.08, 0.05, 0.12),
    vec3(0.03, 0.14, 0.34),
    vec3(0.10, 0.06, 0.04),
    vec3(0.00, 0.01, 0.03),
    vec3(0.03, 0.04, 0.07)
  );

  vec3 seaShlo = sCol(
    vec3(0.28, 0.17, 0.24),
    vec3(0.09, 0.38, 0.60),
    vec3(0.24, 0.13, 0.06),
    vec3(0.04, 0.06, 0.16),
    vec3(0.07, 0.10, 0.14)
  );

  vec3 fogCol = sCol(
    vec3(0.80, 0.50, 0.30),
    vec3(0.58, 0.72, 0.90),
    vec3(0.70, 0.28, 0.05),
    vec3(0.02, 0.03, 0.08),
    vec3(0.12, 0.14, 0.18)
  );

  float sunProgress = clamp(s / 0.58, 0.0, 1.0);
  float sunAngle = sunProgress * PI;
  float sunArcX = cos(sunAngle) * -0.75;
  float sunArcY = sin(sunAngle) * 0.38 - 0.08;

  vec3 sunDir = normalize(vec3(sunArcX, sunArcY, -1.0));
  vec3 moonDir = normalize(vec3(-0.14, 0.42, -1.0));

  float waveAmp = sF(0.082, 0.070, 0.100, 0.054, 0.30);
  waveAmp += storm * 0.020;

  float fogDen = sF(0.020, 0.010, 0.022, 0.034, 0.046);
  float moonAmt = sF(0.0, 0.0, 0.05, 0.92, 0.06);

  float sunAbove = step(0.0, sunDir.y);
  float sunGlow = smoothstep(-0.10, 0.06, sunDir.y);

  vec3 col;

  if (rd.y < 0.0) {
    float tFlat = ro.y / (-rd.y);
    float stepSize = tFlat / float(MARCH_STEPS);
    float t = stepSize;

    for (int i = 0; i < MARCH_STEPS; i++) {
      vec2 wpTest = ro.xz + rd.xz * t;
      float wy = ro.y + rd.y * t;
      if (wy < waveH(wpTest, uT, waveAmp, storm)) break;
      t += stepSize;
    }

    float ta = t - stepSize;
    float tb = t;

    for (int i = 0; i < REFINE_STEPS; i++) {
      float tm = (ta + tb) * 0.5;
      vec2 wpm = ro.xz + rd.xz * tm;
      if (ro.y + rd.y * tm < waveH(wpm, uT, waveAmp, storm)) tb = tm;
      else ta = tm;
    }

    t = (ta + tb) * 0.5;

    vec2 wp = ro.xz + rd.xz * t;
    vec3 n = waveNorm(wp, uT, waveAmp, storm);
    vec3 vDir = -rd;

    float fres = pow(1.0 - clamp(dot(n, vDir), 0.0, 1.0), 4.0);

    vec3 refl = reflect(rd, n);
    float rh = clamp(refl.y, 0.0, 1.0);

    vec3 reflSky = mix(skyHori, skyTop, pow(rh, 0.42));
    reflSky = mix(reflSky, skyHori, 0.12);

    float rSun = max(dot(refl, sunDir), 0.0);
    reflSky += sunCol * pow(rSun, 120.0) * 2.0 * sunGlow;
    reflSky += sunCol * pow(rSun, 18.0) * 0.07 * sunGlow;

    if (moonAmt > 0.04) {
      float rMoon = max(dot(refl, moonDir), 0.0);
      reflSky += vec3(0.72, 0.80, 0.95) * pow(rMoon, 120.0) * 0.78 * moonAmt;
    }

    float depth = exp(-t * 0.40);
    vec3 waterC = mix(seaDeep, seaShlo, depth * 0.5);

    vec3 absorb = vec3(0.85, 0.92, 1.0);
    waterC *= mix(vec3(1.0), absorb, clamp(t * 0.25, 0.0, 1.0));

    col = mix(waterC, reflSky, 0.15 + fres * 0.34);

    float spec = pow(max(dot(reflect(-sunDir, n), vDir), 0.0), 200.0);
    col += sunCol * spec * 1.10 * sunAbove;

    float broadSpec = pow(max(dot(reflect(-sunDir, n), vDir), 0.0), 32.0);
    col += sunCol * broadSpec * 0.12 * sunGlow;

    float sunLine = pow(max(dot(reflect(rd, n), sunDir), 0.0), 8.0);
    col += sunCol * sunLine * 0.48 * smoothstep(0.0, 0.35, -rd.y) * sunGlow;

    float sparkle = noise(wp * 18.0 + vec2(uT * 0.55, uT * 0.22));
    sparkle = smoothstep(0.94, 1.0, sparkle);
    col += sunCol * sparkle * 0.08 * sunGlow * sunAbove;

    if (moonAmt > 0.04) {
      float mSpec = pow(max(dot(reflect(-moonDir, n), vDir), 0.0), 520.0);
      col += vec3(0.72, 0.80, 0.95) * mSpec * 0.09 * moonAmt;
    }

    float hC = waveH(wp, uT, waveAmp, storm);
    float hL = waveH(wp - vec2(0.025, 0.0), uT, waveAmp, storm);
    float hR = waveH(wp + vec2(0.025, 0.0), uT, waveAmp, storm);
    float hD = waveH(wp - vec2(0.0, 0.025), uT, waveAmp, storm);
    float hU = waveH(wp + vec2(0.0, 0.025), uT, waveAmp, storm);

    float curvature = hR + hL + hU + hD - 4.0 * hC;
    float foam = clamp(curvature * (24.0 + storm * 10.0), 0.0, 1.0);
    col += foam * vec3(1.0) * (0.03 + storm * 0.10);

    float fog = 1.0 - exp(-t * fogDen * 1.65);
    col = mix(col, fogCol, fog);
  } else {
    float h = clamp(rd.y, 0.0, 1.0);
    col = mix(skyHori, skyTop, pow(h, 0.38));
  }

  float horizonW = 0.008;
  float skyMix = smoothstep(-horizonW, horizonW, rd.y);

  vec3 skyCol;
  {
    float h = clamp(rd.y, 0.0, 1.0);
    skyCol = mix(skyHori, skyTop, pow(h, 0.38));

    float cloudBand = noise(rd.x * 5.5 + vec2(rd.y * 3.0, uT * 0.015));
    float cloudBand2 = noise(rd.x * 8.0 - vec2(rd.y * 4.0, uT * 0.010));
    float clouds = smoothstep(0.62, 0.86, cloudBand * 0.65 + cloudBand2 * 0.35);
    clouds *= smoothstep(-0.02, 0.24, rd.y);
    clouds *= 0.08 + storm * 0.18;

    vec3 cloudCol = mix(
      vec3(1.0, 0.82, 0.65),
      vec3(0.42, 0.48, 0.56),
      storm
    );

    skyCol = mix(skyCol, mix(skyCol * 0.97, cloudCol, 0.35), clouds);

    float sd = max(dot(rd, sunDir), 0.0);
    skyCol += sunCol * pow(sd, 380.0) * 6.8 * sunGlow;
    skyCol += sunCol * pow(sd, 22.0)  * 0.20 * sunGlow;
    skyCol += sunCol * pow(sd, 5.0)   * 0.09 * sunGlow;

    float sunDisk = smoothstep(0.99925, 0.99995, dot(rd, sunDir));
    skyCol += sunCol * sunDisk * 2.6 * sunGlow;

    float horizonBand = exp(-abs(rd.y) * 24.0);
    skyCol += sunCol * horizonBand * 0.11 * sunGlow;

    float viewSun = max(dot(rd, sunDir), 0.0);
    skyCol += sunCol * pow(viewSun, 3.0) * 0.035 * sunGlow;

    if (moonAmt > 0.04) {
      float md = max(dot(rd, moonDir), 0.0);
      skyCol += vec3(0.88, 0.92, 1.0) * pow(md, 820.0) * 7.4 * moonAmt;
      skyCol += vec3(0.88, 0.92, 1.0) * pow(md, 6.0)   * 0.045 * moonAmt;
    }

    if (night > 0.02) {
      vec2 starUv = rd.xy / max(0.12, rd.z + 1.6);
      starUv *= 140.0;
      float stars = starField(starUv) + starField(starUv * 0.55 + 11.7) * 0.65;
      stars *= smoothstep(0.02, 0.26, rd.y);
      stars *= (1.0 - storm * 0.85);
      skyCol += vec3(0.80, 0.88, 1.0) * stars * night * 0.82;
    }

    float horizonMist = exp(-abs(rd.y) * mix(38.0, 22.0, storm));
    skyCol += fogCol * horizonMist * (0.09 + storm * 0.10);

    skyCol = mix(skyCol, skyCol * vec3(0.91, 0.94, 0.98), storm * 0.22);
  }

  col = mix(col, skyCol, skyMix);

  float hEdge = smoothstep(-0.008, 0.018, rd.y);
  col = mix(fogCol, col, hEdge * 0.25 + 0.75);

  float grain = hash(gl_FragCoord.xy * 0.5 + floor(uT * 12.0)) - 0.5;
  col += grain * 0.006;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const mkShader = (type, src) => {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);

  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }

  return s;
};

const vert = mkShader(gl.VERTEX_SHADER, vs);
const frag = mkShader(gl.FRAGMENT_SHADER, fs);

if (!vert || !frag) {
  throw new Error("Shader compilation failed");
}

const prog = gl.createProgram();
gl.attachShader(prog, vert);
gl.attachShader(prog, frag);
gl.linkProgram(prog);

if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(prog));
  throw new Error("Program linking failed");
}

gl.useProgram(prog);
gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);
gl.disable(gl.BLEND);
gl.disable(gl.DITHER);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
  gl.STATIC_DRAW
);

const ap = gl.getAttribLocation(prog, "a");
gl.enableVertexAttribArray(ap);
gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

const uR = gl.getUniformLocation(prog, "uR");
const uTi = gl.getUniformLocation(prog, "uT");
const uScroll = gl.getUniformLocation(prog, "uS");
const uScene = gl.getUniformLocation(prog, "uSc");
const uBlend = gl.getUniformLocation(prog, "uBl");
const uBg = gl.getUniformLocation(prog, "uBg");

const hexToVec3 = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const bgColors = {
  dark: "#0a0a0f",
  light: "#eef4ff"
};

const updateBg = (theme) => {
  const [r, g, b] = hexToVec3(bgColors[theme] ?? bgColors.dark);
  gl.uniform3f(uBg, r, g, b);
};

const mq = window.matchMedia("(prefers-color-scheme: dark)");
const getSystemTheme = () => (mq.matches ? "dark" : "light");

let themeOverride = null;
const getActiveTheme = () => themeOverride ?? getSystemTheme();

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  updateBg(theme);
};

applyTheme(getActiveTheme());

mq.addEventListener("change", () => {
  if (!themeOverride) applyTheme(getSystemTheme());
});

const themeToggle = document.getElementById("theme_toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    themeOverride = getActiveTheme() === "dark" ? "light" : "dark";
    applyTheme(themeOverride);
  });
}

const NAMES = ["DAWN", "MIDDAY", "DUSK", "NIGHT", "STORM"];
const N = NAMES.length;

let maxScroll = 1;
let tgt = 0;
let smooth = 0;
let velocity = 0;

const scrollEase = 0.1;

let qualityScale = 1.0;
const MAX_DPR = 1.5;
const MIN_QUALITY = 0.82;
const MAX_QUALITY = 1.0;

let resizeRAF = 0;
let lastViewportW = 0;
let lastViewportH = 0;

const updateScrollMetrics = () => {
  const vh = lastViewportH || window.innerHeight;
  maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
  tgt =
    maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
};

const resize = () => {
  resizeRAF = 0;

  const vp = window.visualViewport ?? {
    width: window.innerWidth,
    height: window.innerHeight
  };

  const cssW = Math.round(vp.width);
  const cssH = Math.round(vp.height);

  if (!cssW || !cssH) return;

  lastViewportW = cssW;
  lastViewportH = cssH;

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const renderScale = dpr * qualityScale;

  const pixelW = Math.max(1, Math.round(cssW * renderScale));
  const pixelH = Math.max(1, Math.round(cssH * renderScale));

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
    gl.viewport(0, 0, pixelW, pixelH);
    gl.uniform2f(uR, pixelW, pixelH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  updateScrollMetrics();
};

const requestResize = () => {
  if (!resizeRAF) resizeRAF = requestAnimationFrame(resize);
};

resize();
window.addEventListener("resize", requestResize, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", requestResize, {
    passive: true
  });
}

window.addEventListener("scroll", updateScrollMetrics, { passive: true });

window.addEventListener("load", updateScrollMetrics, { passive: true });

window.addEventListener(
  "wheel",
  (e) => {
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.target.closest?.('input, textarea, select, [contenteditable="true"]')
    )
      return;

    e.preventDefault();

    const linePx = 16;
    const pagePx = window.innerHeight * 0.9;

    const delta =
      e.deltaMode === 1
        ? e.deltaY * linePx
        : e.deltaMode === 2
        ? e.deltaY * pagePx
        : e.deltaY;

    velocity += delta;
    velocity = Math.max(-520, Math.min(520, velocity));
  },
  { passive: false }
);

const progFill = document.getElementById("prog_fill");
const hudPct = document.getElementById("hud_pct");
const sceneName = document.getElementById("scene_name");
const dots = document.querySelectorAll(".scene-dot");

let lastHUDPct = -1;
let lastHUDScene = -1;

const updateHUD = (s) => {
  const p = Math.round(s * 100);
  const si = Math.min(N - 1, Math.floor(s * N));

  if (p !== lastHUDPct) {
    lastHUDPct = p;
    hudPct && (hudPct.textContent = String(p).padStart(3, "0") + "%");
    progFill && (progFill.style.width = `${p}%`);
  }

  if (si !== lastHUDScene) {
    lastHUDScene = si;
    sceneName && (sceneName.textContent = NAMES[si]);
    dots.forEach((d, i) => d.classList.toggle("active", i === si));
  }
};

const revealEls = [
  ...document.querySelectorAll(
    ".tag, h1, h2, .body-text, .stat-row, .cta, .h-line"
  )
];

for (const el of revealEls) {
  if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
    el.classList.add("visible");
  }
}

const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    }
  },
  {
    threshold: 0.1,
    rootMargin: "0px 0px -6% 0px"
  }
);

for (const el of revealEls) {
  io.observe(el);
}

let anchorAnim = null;

const stopAnchorAnim = () => {
  if (anchorAnim) {
    cancelAnimationFrame(anchorAnim);
    anchorAnim = null;
  }
};

const smoothScrollToY = (targetY, duration = 900) => {
  stopAnchorAnim();
  velocity = 0;

  const startY = window.scrollY;
  const diff = targetY - startY;
  const start = performance.now();

  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const e = easeInOutCubic(p);

    window.scrollTo(0, startY + diff * e);

    if (p < 1) {
      anchorAnim = requestAnimationFrame(tick);
    } else {
      anchorAnim = null;
    }
  };

  anchorAnim = requestAnimationFrame(tick);
};

window.addEventListener("wheel", stopAnchorAnim, { passive: true });
window.addEventListener("touchstart", stopAnchorAnim, { passive: true });
window.addEventListener("mousedown", stopAnchorAnim, { passive: true });
window.addEventListener("keydown", stopAnchorAnim, { passive: true });

document.querySelectorAll('a[href^="#s"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();

    const id = a.getAttribute("href");
    const target = document.querySelector(id);
    if (!target) return;

    const y = Math.max(0, Math.min(target.offsetTop, maxScroll));
    smoothScrollToY(y);
  });
});

const t0 = performance.now();
let lastNow = t0;
let fpsAccum = 0;
let fpsFrames = 0;
let lowFpsTime = 0;
let highFpsTime = 0;

const maybeAdjustQuality = (dt) => {
  fpsAccum += dt;
  fpsFrames++;

  if (fpsAccum < 0.75) return;

  const avgDt = fpsAccum / fpsFrames;
  const fps = 1 / avgDt;

  fpsAccum = 0;
  fpsFrames = 0;

  if (fps < 50) {
    lowFpsTime += 0.75;
    highFpsTime = 0;
  } else if (fps > 57) {
    highFpsTime += 0.75;
    lowFpsTime = 0;
  } else {
    lowFpsTime = 0;
    highFpsTime = 0;
  }

  if (lowFpsTime >= 1.5 && qualityScale > MIN_QUALITY) {
    qualityScale = Math.max(MIN_QUALITY, +(qualityScale - 0.06).toFixed(2));
    lowFpsTime = 0;
    requestResize();
  }

  if (highFpsTime >= 3.0 && qualityScale < MAX_QUALITY) {
    qualityScale = Math.min(MAX_QUALITY, +(qualityScale + 0.04).toFixed(2));
    highFpsTime = 0;
    requestResize();
  }
};

const frame = (now) => {
  requestAnimationFrame(frame);

  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;

  maybeAdjustQuality(dt);

  velocity *= Math.pow(0.86, dt * 60);
  if (Math.abs(velocity) < 0.02) velocity = 0;

  if (velocity !== 0) {
    window.scrollBy({
      top: velocity * scrollEase,
      behavior: "auto"
    });
  }

  smooth += (tgt - smooth) * (1 - Math.exp(-dt * 8));

  const raw = smooth * (N - 1);
  const si = Math.min(Math.floor(raw), N - 2);
  const bl = raw - si;

  updateHUD(smooth);

  gl.uniform1f(uTi, (now - t0) / 1000);
  gl.uniform1f(uScroll, smooth);
  gl.uniform1f(uScene, si);
  gl.uniform1f(uBlend, bl);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

requestAnimationFrame(frame);

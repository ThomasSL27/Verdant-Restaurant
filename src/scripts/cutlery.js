import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { gsap } from "gsap";

/* ------------------------------------------------------------------ *
 *  Scene setup
 * ------------------------------------------------------------------ */
// This module is only imported on non-mobile screens (see index.astro).
const canvas = document.getElementById("cutlery-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // cap fill cost
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

const CAM_Z = 7;
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, CAM_Z);

// Soft studio reflections so the metal reads as polished silver.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const key = new THREE.DirectionalLight(0xfff4e6, 2.5);
key.position.set(4, 7, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc6ac, 1.6); // forest-green rim
rim.position.set(-6, 3, -4);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.85);
fill.position.set(-2, -4, 4);
scene.add(fill);
scene.add(new THREE.AmbientLight(0xffffff, 0.22));

/* ------------------------------------------------------------------ *
 *  Material — polished stainless flatware
 * ------------------------------------------------------------------ */
const silver = new THREE.MeshPhysicalMaterial({
  color: 0xdadde0,
  metalness: 1.0,
  roughness: 0.1,
  clearcoat: 0.5,
  clearcoatRoughness: 0.18,
  envMapIntensity: 1.35,
});

const EXTRUDE = {
  depth: 0.07,
  bevelEnabled: true,
  bevelThickness: 0.05,
  bevelSize: 0.04,
  bevelSegments: 6,
  curveSegments: 32,
};

// Bow the flat silhouette along its length so it reads as real, curved
// flatware (a gentle scoop) instead of a flat cut-out.
function bend(geo, amount) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const yLen = max.y - min.y;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / yLen;       // 0 bottom -> 1 top
    const bow = amount * Math.pow((t - 0.5) * 2, 2); // ends lift toward camera
    pos.setZ(i, pos.getZ(i) + bow);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function finishMesh(shape, bowAmount) {
  const geo = new THREE.ExtrudeGeometry(shape, EXTRUDE);
  bend(geo, bowAmount);
  geo.center();
  return new THREE.Mesh(geo, silver);
}

/* ------------------------------------------------------------------ *
 *  Procedural FORK — flat silhouette traced up the right edge,
 *  across four tapered tines, and down the mirrored left edge.
 * ------------------------------------------------------------------ */
function buildFork() {
  const s = new THREE.Shape();
  const rightEdge = [
    [0.0, -2.30],
    [0.135, -2.14],
    [0.155, -1.5],
    [0.118, -0.5],
    [0.085, 0.05],   // narrow neck
    [0.165, 0.42],   // shoulder of head
    [0.30, 0.78],    // widest
    [0.305, 1.02],   // base of outer tine
  ];
  s.moveTo(rightEdge[0][0], rightEdge[0][1]);
  for (let i = 1; i < rightEdge.length; i++) s.lineTo(rightEdge[i][0], rightEdge[i][1]);

  const centers = [0.225, 0.075, -0.075, -0.225];
  const tw = 0.052, tipY = 1.62, shoulderY = 1.5, slotY = 1.06;
  centers.forEach((c, i) => {
    s.lineTo(c + tw, shoulderY);
    s.lineTo(c, tipY);
    s.lineTo(c - tw, shoulderY);
    if (i < centers.length - 1) {
      s.lineTo(c - tw, slotY);
      s.lineTo(centers[i + 1] + tw, slotY);
    }
  });

  s.lineTo(-0.305, 1.02);
  for (let i = rightEdge.length - 2; i >= 1; i--) s.lineTo(-rightEdge[i][0], rightEdge[i][1]);
  s.closePath();

  return finishMesh(s, 0.16);
}

/* ------------------------------------------------------------------ *
 *  Procedural KNIFE — table-knife silhouette: handle, bolster,
 *  straight spine, curved belly, rounded tip.
 * ------------------------------------------------------------------ */
function buildKnife() {
  const pts = [
    [0.0, -2.35], [0.13, -2.2], [0.15, -1.6], [0.135, -0.7],
    [0.115, -0.18], [0.1, 0.05], [0.095, 0.7], [0.095, 1.35],
    [0.06, 1.62], [0.0, 1.78],            // rounded tip
    [-0.12, 1.46], [-0.18, 1.05], [-0.205, 0.55], // belly
    [-0.155, 0.1], [-0.115, -0.18],       // heel + bolster
    [-0.135, -0.7], [-0.15, -1.6], [-0.13, -2.2],
  ];
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return finishMesh(s, 0.08);
}

const fork = buildFork();
const knife = buildKnife();
scene.add(fork, knife);

const BASE_SCALE = 0.7;
const TILT_X = 0.1;
fork.rotation.x = TILT_X;
knife.rotation.x = TILT_X;
fork.rotation.y = -0.2;
knife.rotation.y = 0.2;

/* ------------------------------------------------------------------ *
 *  Responsive layout — visible half-width/height at the z=0 plane,
 *  so the cutlery hugs the screen edges on any aspect ratio.
 * ------------------------------------------------------------------ */
let halfH = 0, halfW = 0;
let s2Scroll = 0; // scrollY at which section 2 is centred

function computeView() {
  halfH = Math.tan((camera.fov * Math.PI) / 180 / 2) * CAM_Z;
  halfW = halfH * camera.aspect;
  const phil = document.getElementById("philosophy");
  s2Scroll = phil.offsetTop + phil.offsetHeight / 2 - window.innerHeight / 2;
}

// Fractions of the visible half-width for each rest state.
const HERO_FRAC = 0.86;   // far out, clear of the big title
const S2_FRAC = 0.6;      // snug beside the section-2 text
const HERO_ROT = 10;      // degrees, tilted outward in the hero

const entrance = { s: 0 }; // pop-in multiplier
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* Pop-in: scale up in place inside the hero with a springy overshoot.
 * Each tween tick requests a single frame; once it completes there is
 * nothing left to animate, so rendering stops until the next scroll. */
gsap.to(entrance, {
  s: 1,
  duration: 0.9,
  ease: "back.out(2.2)",
  delay: 0.25,
  onUpdate: scheduleRender,
  onComplete: scheduleRender,
});

/* ------------------------------------------------------------------ *
 *  Render loop — position is derived from scroll every frame, so the
 *  pieces are locked to the page: they travel hero -> section 2, park
 *  there, then scroll up out of view together WITH section 2 (no fade),
 *  and only ever move while the scrollbar moves.
 * ------------------------------------------------------------------ */
let rafId = null;

// Draw one frame for the current scroll position. No continuous loop —
// the utensils are static once settled, so we only redraw on change.
function renderFrame() {
  const y = window.scrollY;
  const p1 = clamp01(y / Math.max(s2Scroll, 1));          // hero -> section 2
  const p2 = clamp01((y - s2Scroll) / window.innerHeight); // section 2 -> exit upward

  const baseX = lerp(halfW * HERO_FRAC, halfW * S2_FRAC, p1);
  const baseY = lerp(0.1, 0.0, p1) + p2 * (halfH + 2.0);
  const rot = lerp(HERO_ROT, 0, p1);
  const s = BASE_SCALE * entrance.s;

  fork.position.set(-baseX, baseY, 0);
  knife.position.set(baseX, baseY, 0);
  fork.rotation.z = THREE.MathUtils.degToRad(-rot);
  knife.rotation.z = THREE.MathUtils.degToRad(rot);
  fork.scale.setScalar(s);
  knife.scale.setScalar(s);

  renderer.render(scene, camera);
}

// Coalesce many triggers (scroll / tween ticks) into one frame.
function scheduleRender() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    renderFrame();
  });
}

computeView();
scheduleRender(); // initial paint

window.addEventListener("scroll", scheduleRender, { passive: true });

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  computeView();
  scheduleRender();
});

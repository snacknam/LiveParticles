// ==== 설정 변수들 ====
const BACKGROUND_COLOR = '#EFF2F6';
const NORMAL_COLOR_HEX = '#2B7FFF';

const GLOW_COLOR_HEX     = '#FF6900';
const GLOW_SIZE          = 1;
const GLOW_OPACITY       = 1;
const GLOW_INNER_STOP    = 0.04;
const GLOW_MID_STOP      = 0.1;
const GLOW_OUTER_STOP    = 1.0;
const GLOW_FADE_DURATION = 500;

const SPRING_K     = 10;
const DAMPING      = 2.0;
const HOLD_TIME    = 0;
const MIN_INTERVAL = 2000;
const MAX_INTERVAL = 4000;

// ==== 씬/카메라/렌더러 ====
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);

const camera = new THREE.PerspectiveCamera(
  80, window.innerWidth / window.innerHeight, 0.1, 100
);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.sortObjects = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// 루트 그룹: 파티클과 글로우 모두 여기에 추가해 회전
const root = new THREE.Group();
scene.add(root);

// ==== 텍스처 헬퍼 ====
function createCircleTexture(colorHex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function createGlowTexture(colorHex) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(colorHex);
  const r = Math.floor(c.r*255), g = Math.floor(c.g*255), b = Math.floor(c.b*255);

  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0,                    `rgba(${r},${g},${b},${GLOW_OPACITY})`);
  grad.addColorStop(GLOW_INNER_STOP,      `rgba(${r},${g},${b},${GLOW_OPACITY*0.6})`);
  grad.addColorStop(GLOW_MID_STOP,        `rgba(${r},${g},${b},${GLOW_OPACITY*0.3})`);
  grad.addColorStop(GLOW_OUTER_STOP,      'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0,0,size,size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ==== 파티클 그룹 생성 (3가지 크기) ====
const TOTAL_PARTICLES = 1000;
const PARTICLE_SIZES  = [0.02, 0.04, 0.05];
const GROUP_COUNT     = Math.floor(TOTAL_PARTICLES / PARTICLE_SIZES.length);
const circleTex       = createCircleTexture(NORMAL_COLOR_HEX);

const particleGroups = [];
for (let gi = 0; gi < PARTICLE_SIZES.length; gi++) {
  const size  = PARTICLE_SIZES[gi];
  const count = gi < PARTICLE_SIZES.length - 1
    ? GROUP_COUNT
    : TOTAL_PARTICLES - GROUP_COUNT * (PARTICLE_SIZES.length - 1);

  const posArr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r     = THREE.MathUtils.randFloat(1.5, 2.5);
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    posArr[3*i]   = r * Math.sin(phi) * Math.cos(theta);
    posArr[3*i+1] = r * Math.sin(phi) * Math.sin(theta);
    posArr[3*i+2] = r * Math.cos(phi);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));

  const mat = new THREE.PointsMaterial({
    size,
    map: circleTex,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const points = new THREE.Points(geom, mat);
  root.add(points);
  particleGroups.push({ points, geom });
}

// ==== 줌인/줌아웃 이벤트 ====
window.addEventListener('wheel', e => {
  camera.position.z += e.deltaY * 0.005;
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, 2, 15);
});

// ==== Glow 애니메이션 상태 ====
const bounces = [];
let lastTime = 0;

// ==== Glow 트리거 ====
function triggerGlow() {
  const gi = Math.floor(Math.random() * particleGroups.length);
  const { geom } = particleGroups[gi];
  const posAttr  = geom.attributes.position;

  const idx = Math.floor(Math.random() * posAttr.count);
  const ox  = posAttr.getX(idx);
  const oy  = posAttr.getY(idx);
  const oz  = posAttr.getZ(idx);
  const orig = new THREE.Vector3(ox, oy, oz);
  const peak = orig.clone().multiplyScalar(1.2);

  const glowMat = new THREE.SpriteMaterial({
    map: createGlowTexture(GLOW_COLOR_HEX),
    blending: THREE.NormalBlending,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(GLOW_SIZE, GLOW_SIZE, 1);
  glow.position.copy(orig);
  glow.renderOrder = 999;
  root.add(glow);

  bounces.push({
    glow, orig, peak,
    pos: orig.clone(),
    vel: new THREE.Vector3(),
    k: SPRING_K, c: DAMPING,
    phase: 'outward',
    holdStart: 0,
    fadePhase: 'in',
    fadeStart: performance.now()
  });
}

// 랜덤 간격 호출
(function scheduleNext(){
  setTimeout(()=>{
    triggerGlow();
    scheduleNext();
  }, MIN_INTERVAL + Math.random()*(MAX_INTERVAL - MIN_INTERVAL));
})();

// ==== 애니메이션 루프 ====
function animate(time) {
  requestAnimationFrame(animate);

  // 루트 그룹 회전 => 파티클과 Glow 모두 함께 돌림
  const slowY = time * 0.00005;
  const slowX = Math.sin(time * 0.00003) * 0.2;
  root.rotation.y = slowY;
  root.rotation.x = slowX;

  const now = performance.now();
  const dt  = (time - lastTime) / 1000;

  for (let i = bounces.length - 1; i >= 0; i--) {
    const bd = bounces[i];
    const { glow, orig, peak, vel, k, c } = bd;

    // fade in
    if (bd.fadePhase === 'in') {
      const fe = now - bd.fadeStart;
      glow.material.opacity = Math.min(fe/GLOW_FADE_DURATION,1)*GLOW_OPACITY;
      if (fe >= GLOW_FADE_DURATION) bd.fadePhase = null;
    }

    // spring 애니메이션
    if (bd.phase==='outward' || bd.phase==='return') {
      const target = bd.phase==='outward'? peak : orig;
      const disp   = bd.pos.clone().sub(target);
      const Fsp    = disp.multiplyScalar(-k);
      const Fd     = vel.clone().multiplyScalar(-c);
      const acc    = Fsp.add(Fd);
      vel.add(acc.multiplyScalar(dt));
      bd.pos.add(vel.clone().multiplyScalar(dt));
      glow.position.copy(bd.pos);

      if (bd.phase==='outward'
        && bd.pos.distanceTo(peak)<0.01
        && vel.length()<0.01) {
        bd.phase     = 'hold';
        bd.holdStart = time;
      }
      if (bd.phase==='return'
        && bd.pos.distanceTo(orig)<0.01
        && vel.length()<0.01) {
        bd.phase     = 'done';
        bd.fadePhase = 'out';
        bd.fadeStart = now;
      }
    } else if (bd.phase==='hold') {
      if (time - bd.holdStart >= HOLD_TIME) {
        bd.phase = 'return';
        bd.vel.set(0,0,0);
      }
    }

    // fade out
    if (bd.fadePhase === 'out') {
      const fe = now - bd.fadeStart;
      glow.material.opacity = Math.max(1 - fe/GLOW_FADE_DURATION,0)*GLOW_OPACITY;
      if (fe >= GLOW_FADE_DURATION) {
        root.remove(glow);
        bounces.splice(i,1);
      }
    }
  }

  lastTime = time;
  renderer.render(scene, camera);
}
animate(0);

// ==== 리사이즈 대응 ====
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

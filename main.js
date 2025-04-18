const BACKGROUND_COLOR = '#FFFFFF';
const NORMAL_COLOR_HEX = '#2B7FFF';

const GLOW_COLOR_HEX     = '#FF6900';
const GLOW_SIZE          = 1;
const GLOW_OPACITY       = 0.7;
const GLOW_INNER_STOP    = 0.05;
const GLOW_MID_STOP      = 0.2;
const GLOW_OUTER_STOP    = 1.0;
const GLOW_FADE_DURATION = 500;   // fade in/out duration
const GLOW_HOLD_DURATION = 3000;   // full opacity hold

const MIN_INTERVAL = 1000;
const MAX_INTERVAL = 3000;

// 장면 세팅
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);

const camera = new THREE.PerspectiveCamera(
  80,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.sortObjects = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// 회전 그룹
const root = new THREE.Group();
scene.add(root);

// 텍스처 헬퍼
function createCircleTexture(colorHex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function createGlowTexture(colorHex) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(colorHex);
  const r = Math.floor(c.r * 255),
        g = Math.floor(c.g * 255),
        b = Math.floor(c.b * 255);

  const grad = ctx.createRadialGradient(
    size/2, size/2, 0,
    size/2, size/2, size/2
  );
  grad.addColorStop(0,                    `rgba(${r},${g},${b},${GLOW_OPACITY})`);
  grad.addColorStop(GLOW_INNER_STOP,      `rgba(${r},${g},${b},${GLOW_OPACITY * 0.6})`);
  grad.addColorStop(GLOW_MID_STOP,        `rgba(${r},${g},${b},${GLOW_OPACITY * 0.3})`);
  grad.addColorStop(GLOW_OUTER_STOP,      'rgba(0,0,0,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// 파티클 생성
const TOTAL_PARTICLES = 1000;
const PARTICLE_SIZES  = [0.02, 0.03, 0.04];
const GROUP_COUNT     = Math.floor(TOTAL_PARTICLES / PARTICLE_SIZES.length);
const circleTex       = createCircleTexture(NORMAL_COLOR_HEX);

const particleGroups = [];
for (let gi = 0; gi < PARTICLE_SIZES.length; gi++) {
  const size  = PARTICLE_SIZES[gi];
  const count = (gi < PARTICLE_SIZES.length - 1)
    ? GROUP_COUNT
    : TOTAL_PARTICLES - GROUP_COUNT * (PARTICLE_SIZES.length - 1);

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r     = THREE.MathUtils.randFloat(1.5, 2.5);
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    positions[3*i]   = r * Math.sin(phi) * Math.cos(theta);
    positions[3*i+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[3*i+2] = r * Math.cos(phi);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    size,
    map: circleTex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    dithering: true
  });

  const points = new THREE.Points(geom, mat);
  root.add(points);
  particleGroups.push({ geom });
}

// 줌인/줌아웃 리스너
window.addEventListener('wheel', e => {
  camera.position.z += e.deltaY * 0.005;
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, 2, 15);
});

// Glow 애니메이션 상태
const glows = [];
let lastTime = 0;

// Glow 트리거
function triggerGlow() {
  // 랜덤 그룹 + 랜덤 인덱스
  const gi = Math.floor(Math.random() * particleGroups.length);
  const { geom } = particleGroups[gi];
  const posAttr = geom.attributes.position;
  const idx = Math.floor(Math.random() * posAttr.count);

  // 위치
  const ox = posAttr.getX(idx);
  const oy = posAttr.getY(idx);
  const oz = posAttr.getZ(idx);

  // 스프라이트 생성
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
  glow.position.set(ox, oy, oz);
  glow.renderOrder = 999;
  root.add(glow);

  glows.push({
    glow,
    start: performance.now(),
    phase: 'in'
  });
}

// 랜덤 간격으로 계속 트리거
(function scheduleNext(){
  setTimeout(()=>{
    triggerGlow();
    scheduleNext();
  }, MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL));
})();

// 애니메이션 루프
function animate(time) {
  requestAnimationFrame(animate);

  // 그룹 회전
  root.rotation.y = time * 0.00005;
  root.rotation.x = Math.sin(time * 0.00003) * 0.2;

  const now = performance.now();

  // Glow 애니메이션 처리
  for (let i = glows.length - 1; i >= 0; i--) {
    const g = glows[i];
    const elapsed = now - g.start;

    if (g.phase === 'in') {
      // fade in
      const t = elapsed / GLOW_FADE_DURATION;
      g.glow.material.opacity = Math.min(t, 1) * GLOW_OPACITY;
      if (t >= 1) {
        g.phase = 'hold';
        g.start = now;
      }

    } else if (g.phase === 'hold') {
      // hold at full opacity
      if (elapsed >= GLOW_HOLD_DURATION) {
        g.phase = 'out';
        g.start = now;
      }

    } else if (g.phase === 'out') {
      // fade out
      const t = elapsed / GLOW_FADE_DURATION;
      g.glow.material.opacity = Math.max(1 - t, 0) * GLOW_OPACITY;
      if (t >= 1) {
        root.remove(g.glow);
        glows.splice(i, 1);
      }
    }
  }

  lastTime = time;
  renderer.render(scene, camera);
}

animate(0);


// 리사이즈 대응
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

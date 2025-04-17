// ==== 설정 변수들 ====
const BACKGROUND_COLOR = '#000000';

const NORMAL_COLOR_HEX = '#FFFFFF';
const BOUNCE_COLOR_HEX = '#FF8903';

const SPRING_K     = 10;     // 스프링 강도
const DAMPING      = 2.0;    // 감쇠 계수
const HOLD_TIME    = 1000;   // 최고점에서 머무르는 시간(ms)
const MIN_INTERVAL = 100;    // 바운스 트리거 최소간격(ms)
const MAX_INTERVAL = 500;   // 바운스 트리거 최대간격(ms)

// ==== 씬/카메라/렌더러 ====
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ==== 텍스처 & 색상 헬퍼 ====
function createCircleTexture(colorHex) {
  const size   = 128;
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx     = canvas.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}
// hex → normalized RGB로 변환
function hexToRGBNorm(hex) {
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
}

const normalRGB = hexToRGBNorm(NORMAL_COLOR_HEX);
const bounceRGB = hexToRGBNorm(BOUNCE_COLOR_HEX);
const whiteTex  = createCircleTexture(NORMAL_COLOR_HEX);

// ==== 파티클 그룹 생성 ====
const totalParticles = 1000;
const groupCounts    = [
  Math.floor(totalParticles / 3),
  Math.floor(totalParticles / 3),
  totalParticles - 2 * Math.floor(totalParticles / 3)
];
const sizes = [0.02, 0.03, 0.04];

const particleGroups = [];
for (let g = 0; g < 3; g++) {
  const count  = groupCounts[g];
  const posArr = new Float32Array(count*3);
  const colArr = new Float32Array(count*3);
  for (let i = 0; i < count; i++) {
    const r     = THREE.MathUtils.randFloat(1.5, 2.5);
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    posArr[3*i]   = r * Math.sin(phi) * Math.cos(theta);
    posArr[3*i+1] = r * Math.sin(phi) * Math.sin(theta);
    posArr[3*i+2] = r * Math.cos(phi);
    colArr[3*i]   = normalRGB.r;
    colArr[3*i+1] = normalRGB.g;
    colArr[3*i+2] = normalRGB.b;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geom.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));

  const mat = new THREE.PointsMaterial({
    size: sizes[g],
    map: whiteTex,
    transparent: true,
    alphaTest: 0.1,
    depthWrite: false,
    vertexColors: true
  });

  const points = new THREE.Points(geom, mat);
  scene.add(points);
  particleGroups.push(points);
}

// ==== 줌 인/아웃 ====
window.addEventListener('wheel', e => {
  camera.position.z += e.deltaY * 0.005;
  camera.position.z = Math.max(2, Math.min(15, camera.position.z));
});

// ==== 바운스 애니메이션 상태 ====
const bounces = [];
let lastTime = 0;

// ==== 바운스 트리거 ====
function triggerBounce() {
  const g       = Math.floor(Math.random() * particleGroups.length);
  const group   = particleGroups[g];
  const posAttr = group.geometry.attributes.position;
  const colAttr = group.geometry.attributes.color;
  const idx     = Math.floor(Math.random() * posAttr.count);

  const ox = posAttr.getX(idx), oy = posAttr.getY(idx), oz = posAttr.getZ(idx);
  const orig = new THREE.Vector3(ox, oy, oz);
  const peak = orig.clone().addScaledVector(orig.clone().normalize(), 0.5);

  // 색상 변경
  colAttr.setXYZ(idx, bounceRGB.r, bounceRGB.g, bounceRGB.b);
  colAttr.needsUpdate = true;

  bounces.push({
    group, idx, orig, peak,
    pos: orig.clone(), vel: new THREE.Vector3(),
    k: SPRING_K, c: DAMPING,
    phase: 'outward', holdStart: 0
  });
}

// 랜덤 간격으로 계속 트리거
(function scheduleNext(){
  const t = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
  setTimeout(()=>{
    triggerBounce();
    scheduleNext();
  }, t);
})();

// ==== 애니메이션 루프 ====
function animate(time) {
  requestAnimationFrame(animate);

  // 회전
  const slowY = time * 0.00005;
  const slowX = Math.sin(time * 0.00003) * 0.2;
  particleGroups.forEach(p=>{
    p.rotation.y = slowY;
    p.rotation.x = slowX;
  });

  const dt = (time - lastTime)/1000;
  for (let i = bounces.length - 1; i >= 0; i--) {
    const bd      = bounces[i];
    const {group, idx, orig, peak, vel, k, c} = bd;
    const posAttr = group.geometry.attributes.position;
    const colAttr = group.geometry.attributes.color;

    if (bd.phase==='outward' || bd.phase==='return') {
      const target = (bd.phase==='outward')? peak : orig;
      const disp   = bd.pos.clone().sub(target);
      const Fsp    = disp.multiplyScalar(-k);
      const Fd     = vel.clone().multiplyScalar(-c);
      const acc    = Fsp.add(Fd);
      vel.add(acc.multiplyScalar(dt));
      bd.pos.add(vel.clone().multiplyScalar(dt));
      posAttr.setXYZ(idx, bd.pos.x, bd.pos.y, bd.pos.z);
      posAttr.needsUpdate = true;

      if (bd.phase==='outward' && bd.pos.distanceTo(peak)<0.01 && vel.length()<0.01) {
        bd.phase     = 'hold';
        bd.holdStart = time;
        vel.set(0,0,0);
        bd.pos.copy(peak);
      }
      if (bd.phase==='return' && bd.pos.distanceTo(orig)<0.01 && vel.length()<0.01) {
        posAttr.setXYZ(idx, orig.x, orig.y, orig.z);
        posAttr.needsUpdate = true;
        colAttr.setXYZ(idx, normalRGB.r, normalRGB.g, normalRGB.b);
        colAttr.needsUpdate = true;
        bounces.splice(i,1);
      }

    } else if (bd.phase==='hold') {
      if (time - bd.holdStart >= HOLD_TIME) {
        bd.phase = 'return';
        bd.vel.set(0,0,0);
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
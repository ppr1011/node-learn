/*
 * render3d.js —— 真 3D 渲染器(Three.js),与 index.html 的 2D render() 并行存在。
 *
 * 设计要点(见 plans/parallel-wishing-seal.md):
 *  · 只读消费 index.html 里的全局状态(players/enemies/obstacles/shelters/zones/
 *    mapWidth/mapHeight/myId…)—— 这些是内联 classic script 的顶层 let,同域 classic
 *    script 可在函数调用时读到(与 pathfind.js 的 Pathfinder 同一机制)。
 *  · 与 2D render() 互斥:index.html 末尾据 ?r=3d 决定启动哪一个循环。
 *  · Three.js 由 <script type=module> 通过 import map 载入并挂到 window.THREE。
 *  · 世界坐标映射:世界 (x, y) → 场景 (x, 高度, z=y);地面在 XZ 平面(y=0),
 *    高度成为真正的竖直轴,深度缓冲取代 2D 的按 y 画家排序。
 *  · 正交(dimetric)相机:轻微俯角,lerp 跟随本地玩家。
 *
 * 本文件当前覆盖 Phase 0(贴图上传验证)+ Phase 1(静态世界骨架 + 相机跟随 +
 * 本地玩家 hero 广告牌)。Phase 2/3 会在此扩展全体实体广告牌与 InstancedMesh 静物。
 */
(function () {
  'use strict';

  // 相机俯角方向(从目标指向相机的方向向量,决定 dimetric 视角);数值越"竖"越接近俯视
  const CAM_DIR = { x: 0, y: 1000, z: 700 }; // atan(1000/700) ≈ 55° 俯角
  const CAM_DIST = 2500;                     // 正交下距离只影响近/远裁剪,取大值确保场景在视锥内
  const HERO_SIZE = 64;                      // 本地玩家广告牌世界尺寸(2D 里约 30px,3D 放大些更清晰)
  const CAM_LERP = 0.1;                      // 相机跟随缓动(对齐 2D 的 0.1,见 index.html:4496)

  let THREE = null;
  let renderer, scene, camera, canvas3d;
  let heroSprite = null, heroTex = null;
  let zoneMeshBuilt = false;
  let boundaryBuilt = false;
  let lastTime = 0;
  let running = false;

  // ── 工具 ───────────────────────────────────────────────────
  // 帧率无关插值系数:base 是"每 1/60s 的比例",换算到任意 dt(见方案 20Hz 平滑说明)
  function fadeAlpha(base, dtMs) {
    return 1 - Math.pow(1 - base, (dtMs / 1000) * 60);
  }

  function getCanvas() {
    let c = document.getElementById('canvas3d');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'canvas3d';
      const base = document.getElementById('canvas');
      // 插到 2D #canvas 之后、minimap/sidebar 之前 → DOM 顺序让小地图/侧栏叠在上层
      base.parentNode.insertBefore(c, base.nextSibling);
    }
    return c;
  }

  function syncSize() {
    const base = document.getElementById('canvas');
    const w = base.clientWidth, h = base.clientHeight;
    if (w === 0 || h === 0) return;
    // 覆盖到 #canvas 的盒子上(#game-container 为 position:relative)
    canvas3d.style.position = 'absolute';
    canvas3d.style.left = base.offsetLeft + 'px';
    canvas3d.style.top = base.offsetTop + 'px';
    canvas3d.style.width = w + 'px';
    canvas3d.style.height = h + 'px';
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);
    // 正交视锥:竖直方向大致 1 世界单位≈1 屏幕像素(与 2D 观感接近),随俯角前缩
    const halfH = h * 0.5, halfW = w * 0.5;
    camera.left = -halfW; camera.right = halfW;
    camera.top = halfH; camera.bottom = -halfH;
    camera.near = 1; camera.far = 8000;
    camera.updateProjectionMatrix();
  }

  // ── 场景搭建 ────────────────────────────────────────────────
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#132713'); // 深绿,呼应 2D 背景 #1c3c1c

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);

    // 大地面(略大于地图,避免边缘露底)
    const groundGeo = new THREE.PlaneGeometry(mapWidth + 2000, mapHeight + 2000);
    const groundMat = new THREE.MeshBasicMaterial({ color: '#1c3c1c' });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; // 躺平到 XZ 平面
    ground.position.set(mapWidth / 2, 0, mapHeight / 2);
    scene.add(ground);
  }

  // 4 条难度带地块(数据来自服务端 zones;到齐后建一次)
  function buildZones() {
    if (zoneMeshBuilt || !Array.isArray(zones) || zones.length === 0) return;
    for (const z of zones) {
      const b = z.bounds;
      const geo = new THREE.PlaneGeometry(b.w, b.h);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(z.color || '#2c5a2c'),
        transparent: true,
        opacity: 0.28, // 叠在深绿地面上做淡色带,呼应 2D 的地面着色
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(b.x + b.w / 2, 0.4, b.y + b.h / 2); // 略高于地面避免 z-fighting
      scene.add(m);
    }
    zoneMeshBuilt = true;
  }

  // 地图边界线框
  function buildBoundary() {
    if (boundaryBuilt) return;
    const pts = [
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(mapWidth, 2, 0),
      new THREE.Vector3(mapWidth, 2, mapHeight),
      new THREE.Vector3(0, 2, mapHeight),
      new THREE.Vector3(0, 2, 0),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#3a7a3a' });
    scene.add(new THREE.Line(geo, mat));
    boundaryBuilt = true;
  }

  // 本地玩家 hero 广告牌(Phase 0 的贴图上传验证 + Phase 1 的可见锚点)
  function ensureHero() {
    if (heroSprite || !heroTex) return;
    const geo = new THREE.PlaneGeometry(HERO_SIZE, HERO_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      map: heroTex,
      transparent: true,
      alphaTest: 0.5, // 像素图硬边;避免半透明边缘写深度导致穿插
    });
    heroSprite = new THREE.Mesh(geo, mat);
    scene.add(heroSprite);
  }

  function loadHeroTexture() {
    const loader = new THREE.TextureLoader();
    loader.load('assets/player/hero.png', (tex) => {
      tex.magFilter = THREE.NearestFilter; // 像素图保持锐利
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      heroTex = tex;
    });
  }

  // ── 每帧 ───────────────────────────────────────────────────
  function frameStep(now) {
    if (!running) return;
    requestAnimationFrame(frameStep);
    const dt = lastTime ? Math.min(100, now - lastTime) : 16;
    lastTime = now;

    syncSize();
    buildZones();
    buildBoundary();

    const me = (typeof players !== 'undefined') ? players[myId] : null;
    if (me) {
      // 权威位置在 targetX/targetY(WS 设置,见 index.html:1443),这里做本地插值
      if (me.x == null) me.x = me.targetX ?? 0;
      if (me.y == null) me.y = me.targetY ?? 0;
      const a = fadeAlpha(0.28, dt);
      me.x += ((me.targetX ?? me.x) - me.x) * a;
      me.y += ((me.targetY ?? me.y) - me.y) * a;

      // 相机 dimetric 跟随:目标为玩家落点,相机在其上方偏后
      const tgt = new THREE.Vector3(me.x, 0, me.y);
      const dir = new THREE.Vector3(CAM_DIR.x, CAM_DIR.y, CAM_DIR.z).normalize();
      const want = tgt.clone().add(dir.multiplyScalar(CAM_DIST));
      const la = fadeAlpha(CAM_LERP, dt);
      camera.position.lerp(want, la);
      camera.lookAt(me.x, 0, me.y);

      // 本地玩家广告牌
      ensureHero();
      if (heroSprite) {
        heroSprite.position.set(me.x, HERO_SIZE / 2, me.y);
        heroSprite.quaternion.copy(camera.quaternion); // 始终面向相机
        const faceLeft = Math.cos(me.facing || 0) < 0;   // 与 2D 一致(index.html:4164)
        heroSprite.scale.x = faceLeft ? -1 : 1;
      }
    }

    renderer.render(scene, camera);
  }

  // ── 启动 ───────────────────────────────────────────────────
  function init3D() {
    THREE = window.THREE;
    canvas3d = getCanvas();
    renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    buildScene();
    syncSize();
    loadHeroTexture();
    window.addEventListener('resize', () => { if (running) syncSize(); });
    running = true;
    lastTime = 0;
    requestAnimationFrame(frameStep);
    console.log('[render3d] 3D renderer started');
  }

  // 等 THREE 就绪 + 本地玩家已入场(myId 有值)再启动;超时则回退 2D
  window.startRender3D = function () {
    const t0 = performance.now();
    (function wait() {
      const haveThree = !!window.THREE;
      const haveMe = (typeof myId !== 'undefined') && myId != null;
      if (haveThree && haveMe) { init3D(); return; }
      if (performance.now() - t0 > 15000) {
        console.warn('[render3d] Three.js 或玩家状态未就绪,回退 2D 渲染');
        if (typeof window.render === 'function') requestAnimationFrame(window.render);
        return;
      }
      requestAnimationFrame(wait);
    })();
  };
})();

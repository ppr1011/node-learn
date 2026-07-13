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
 * 覆盖:Phase 1(世界骨架 + 相机跟随)+ Phase 2(玩家/敌人广告牌)+
 *       Phase 3(树/石 InstancedMesh、小屋、篝火、安全圈)。
 */
(function () {
  'use strict';

  // 相机俯角方向(从目标指向相机;越"竖"越接近俯视)
  const CAM_DIR = { x: 0, y: 1000, z: 700 }; // atan(1000/700) ≈ 55° 俯角
  const CAM_DIST = 2500;   // 正交下只影响近/远裁剪,取大值确保场景在视锥内
  const CAM_LERP = 0.1;    // 相机跟随缓动(对齐 2D 的 0.1)
  const VIEW = 1.2;        // 视野放大系数(>1 看到更多世界)
  const HERO_SIZE = 46;    // 玩家广告牌世界尺寸(2D 约 30px)
  const ENEMY_BASE = 40;   // 敌人广告牌基准尺寸(再乘各 kind 的 scale)

  // 敌人各 kind 体型缩放(对齐 2D 的 ENEMY_VIS.scale)
  const ENEMY_SCALE = { slime: 1, skeleton: 1, demon: 1, orc: 1.15, wraith: 1.05, golem: 1.5, dragon: 1.8 };
  const ENEMY_SPRITE = {
    slime: 'assets/enemies/slime.png', skeleton: 'assets/enemies/skeleton.png',
    demon: 'assets/enemies/demon.png', orc: 'assets/enemies/orc.png',
    wraith: 'assets/enemies/wraith.png', golem: 'assets/enemies/golem.png',
    dragon: 'assets/enemies/dragon.png',
  };
  // 树冠配色(对齐 2D drawTree 的 palettes 顶色)
  const TREE_CANOPY = ['#2a8030', '#2a7a66', '#455e32'];

  let THREE = null;
  let renderer, scene, camera, canvas3d;
  const texCache = {};                 // path → THREE.Texture
  const sprites = new Map();           // entityId → { mesh, prevX, faceLeft }
  let staticsBuilt = false;
  let heroTex = null;
  let lastTime = 0, running = false;

  // ── 工具 ───────────────────────────────────────────────────
  function fadeAlpha(base, dtMs) { return 1 - Math.pow(1 - base, (dtMs / 1000) * 60); }

  function loadTex(path) {
    if (texCache[path]) return texCache[path];
    const t = new THREE.TextureLoader().load(path);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
    texCache[path] = t;
    return t;
  }

  function getCanvas() {
    let c = document.getElementById('canvas3d');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'canvas3d';
      const base = document.getElementById('canvas');
      base.parentNode.insertBefore(c, base.nextSibling); // 在 minimap/sidebar 之前 → 它们叠在上层
    }
    return c;
  }

  function syncSize() {
    const base = document.getElementById('canvas');
    const w = base.clientWidth, h = base.clientHeight;
    if (!w || !h) return;
    canvas3d.style.position = 'absolute';
    canvas3d.style.left = base.offsetLeft + 'px';
    canvas3d.style.top = base.offsetTop + 'px';
    canvas3d.style.width = w + 'px';
    canvas3d.style.height = h + 'px';
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);
    const halfH = h * 0.5 * VIEW, halfW = w * 0.5 * VIEW;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.near = 1; camera.far = 8000;
    camera.updateProjectionMatrix();
  }

  // ── 场景 & 灯光 ────────────────────────────────────────────
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#132713');
    scene.fog = new THREE.Fog('#132713', 1800, 3200); // 远处淡出,增强纵深

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);

    // 灯光:半球环境光 + 左上方向光(呼应 2D「光从左上」),让静物侧面有明暗 → 立体感
    scene.add(new THREE.HemisphereLight(0xbcd0e0, 0x26402a, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.75);
    dir.position.set(-1, 2, -1);
    scene.add(dir);

    // 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(mapWidth + 2000, mapHeight + 2000),
      new THREE.MeshLambertMaterial({ color: '#1c3c1c' })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(mapWidth / 2, 0, mapHeight / 2);
    scene.add(ground);

    // 难度带(淡色地块)
    if (Array.isArray(zones)) for (const z of zones) {
      const b = z.bounds;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(b.w, b.h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(z.color || '#2c5a2c'), transparent: true, opacity: 0.25 })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(b.x + b.w / 2, 0.4, b.y + b.h / 2);
      scene.add(m);
    }
  }

  // ── 静物:树/石 InstancedMesh + 小屋/篝火/安全圈 ─────────────
  function buildStatics() {
    if (staticsBuilt || !Array.isArray(obstacles) || obstacles.length === 0) return;

    const trees = obstacles.filter(o => o.type === 'tree');
    const rocks = obstacles.filter(o => o.type === 'rock');
    const M = new THREE.Matrix4();
    const P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    const col = new THREE.Color();

    // 树干(所有树共用一个 InstancedMesh;几何以 size=1 为基准,按 size 整体缩放)
    if (trees.length) {
      const trunkGeo = new THREE.CylinderGeometry(0.11, 0.2, 0.9, 6); trunkGeo.translate(0, 0.45, 0);
      const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#5a3617' }), trees.length);
      const canopyGeo = new THREE.IcosahedronGeometry(0.8, 1); canopyGeo.translate(0, 1.35, 0); canopyGeo.scale(1, 0.85, 1);
      const canopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({}), trees.length);
      trees.forEach((o, i) => {
        P.set(o.x, 0, o.y); Q.identity(); S.setScalar(o.size);
        M.compose(P, Q, S);
        trunk.setMatrixAt(i, M); canopy.setMatrixAt(i, M);
        canopy.setColorAt(i, col.set(TREE_CANOPY[o.variant % 3]));
      });
      trunk.instanceMatrix.needsUpdate = true; canopy.instanceMatrix.needsUpdate = true;
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
      scene.add(trunk); scene.add(canopy);
    }

    // 巨砾(低模、纵向压扁、半埋地;按 variant 取灰度)
    if (rocks.length) {
      const rockGeo = new THREE.DodecahedronGeometry(1, 0);
      const rock = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({}), rocks.length);
      const grays = ['#7a7d84', '#6b6e75', '#868a90'];
      rocks.forEach((o, i) => {
        const r = o.radius;
        P.set(o.x, r * 0.35, o.y); Q.identity(); S.set(r, r * 0.7, r);
        M.compose(P, Q, S);
        rock.setMatrixAt(i, M);
        rock.setColorAt(i, col.set(grays[o.variant % 3]));
      });
      rock.instanceMatrix.needsUpdate = true;
      if (rock.instanceColor) rock.instanceColor.needsUpdate = true;
      scene.add(rock);
    }

    // 避难所:小屋 + 安全圈 + 门口篝火(数量少,普通 mesh)
    if (Array.isArray(shelters)) for (const s of shelters) {
      const g = new THREE.Group();
      // 墙体
      const walls = new THREE.Mesh(new THREE.BoxGeometry(92, 44, 64), new THREE.MeshLambertMaterial({ color: '#b98d55' }));
      walls.position.set(s.x, 22, s.y);
      g.add(walls);
      // 四坡屋顶(4 面锥体=金字塔),用避难所色
      const roof = new THREE.Mesh(new THREE.ConeGeometry(72, 40, 4), new THREE.MeshLambertMaterial({ color: new THREE.Color(s.color || '#3a9a40') }));
      roof.position.set(s.x, 44 + 20, s.y);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      scene.add(g);
      // 安全圈(地面圆环)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(s.radius - 8, s.radius, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color || '#3a9a40'), transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.6, s.y);
      scene.add(ring);
      // 篝火(柴堆 + 发光锥)
      if (s.campfire) {
        const logs = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 6, 8), new THREE.MeshLambertMaterial({ color: '#3a2412' }));
        logs.position.set(s.campfire.x, 3, s.campfire.y);
        scene.add(logs);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(8, 22, 8), new THREE.MeshBasicMaterial({ color: '#ff8a2a' }));
        flame.position.set(s.campfire.x, 16, s.campfire.y);
        scene.add(flame);
        const light = new THREE.PointLight(0xffa040, 1.2, 260, 2);
        light.position.set(s.campfire.x, 30, s.campfire.y);
        scene.add(light);
      }
    }

    staticsBuilt = true;
  }

  // ── 实体广告牌(玩家 + 敌人)────────────────────────────────
  function makeSprite(tex, size) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 })
    );
    mesh.renderOrder = 10;
    scene.add(mesh);
    return mesh;
  }

  function updateEntity(id, ent, tex, size, faceFromFacing) {
    if (ent.x == null) ent.x = ent.targetX ?? 0;
    if (ent.y == null) ent.y = ent.targetY ?? 0;
    let rec = sprites.get(id);
    if (!rec) { rec = { mesh: makeSprite(tex, size), prevX: ent.x }; sprites.set(id, rec); rec._size = size; }
    // 尺寸变化(如切换 kind)时重建几何——这里 kind 恒定,跳过
    const mesh = rec.mesh;
    mesh.visible = true;
    mesh.position.set(ent.x, size / 2, ent.y);
    mesh.quaternion.copy(camera.quaternion);
    // 朝向:玩家用 facing,敌人用位移方向(服务端不发敌人朝向)
    let faceLeft = rec.faceLeft || false;
    if (faceFromFacing) faceLeft = Math.cos(ent.facing || 0) < 0;
    else { const dx = ent.x - rec.prevX; if (Math.abs(dx) > 0.5) faceLeft = dx < 0; }
    rec.faceLeft = faceLeft; rec.prevX = ent.x;
    mesh.scale.x = faceLeft ? -1 : 1;
  }

  function updateEntities(dt) {
    const seen = new Set();
    const pa = fadeAlpha(0.28, dt), ea = fadeAlpha(0.22, dt);

    if (typeof players !== 'undefined') for (const id in players) {
      const p = players[id];
      if (p.x == null) { p.x = p.targetX ?? 0; p.y = p.targetY ?? 0; }
      p.x += ((p.targetX ?? p.x) - p.x) * pa;
      p.y += ((p.targetY ?? p.y) - p.y) * pa;
      updateEntity('p' + id, p, heroTex, HERO_SIZE, true);
      seen.add('p' + id);
    }
    if (typeof enemies !== 'undefined') for (const eid in enemies) {
      const e = enemies[eid];
      if (e.isDead) continue; // 死亡敌人暂不渲染(Phase 5 再补淡标记)
      if (e.x == null) { e.x = e.targetX ?? 0; e.y = e.targetY ?? 0; }
      e.x += ((e.targetX ?? e.x) - e.x) * ea;
      e.y += ((e.targetY ?? e.y) - e.y) * ea;
      const sc = ENEMY_SCALE[e.kind] || 1;
      updateEntity('e' + eid, e, loadTex(ENEMY_SPRITE[e.kind] || ENEMY_SPRITE.slime), ENEMY_BASE * sc, false);
      seen.add('e' + eid);
    }
    // 回收消失实体的广告牌
    for (const [id, rec] of sprites) {
      if (!seen.has(id)) { scene.remove(rec.mesh); rec.mesh.geometry.dispose(); rec.mesh.material.dispose(); sprites.delete(id); }
    }
  }

  // ── 每帧 ───────────────────────────────────────────────────
  function frameStep(now) {
    if (!running) return;
    requestAnimationFrame(frameStep);
    const dt = lastTime ? Math.min(100, now - lastTime) : 16;
    lastTime = now;

    syncSize();
    buildStatics();

    const me = (typeof players !== 'undefined') ? players[myId] : null;
    if (me) {
      if (me.x == null) { me.x = me.targetX ?? 0; me.y = me.targetY ?? 0; }
      const tgt = new THREE.Vector3(me.x, 0, me.y);
      const dir = new THREE.Vector3(CAM_DIR.x, CAM_DIR.y, CAM_DIR.z).normalize();
      const want = tgt.clone().add(dir.multiplyScalar(CAM_DIST));
      camera.position.lerp(want, fadeAlpha(CAM_LERP, dt));
      camera.lookAt(me.x, 0, me.y);
    }

    updateEntities(dt);
    renderer.render(scene, camera);
  }

  // ── 启动 ───────────────────────────────────────────────────
  function init3D() {
    THREE = window.THREE;
    canvas3d = getCanvas();
    renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    buildScene();
    syncSize();
    heroTex = loadTex('assets/player/hero.png');
    window.addEventListener('resize', () => { if (running) syncSize(); });
    running = true; lastTime = 0;
    requestAnimationFrame(frameStep);
    console.log('[render3d] 3D renderer started');
  }

  // 等 THREE 就绪 + 本地玩家已入场(myId 有值)再启动;超时则回退 2D
  window.startRender3D = function () {
    const t0 = performance.now();
    (function wait() {
      if (window.THREE && typeof myId !== 'undefined' && myId != null) { init3D(); return; }
      if (performance.now() - t0 > 15000) {
        console.warn('[render3d] 未就绪,回退 2D 渲染');
        if (typeof window.render === 'function') requestAnimationFrame(window.render);
        return;
      }
      requestAnimationFrame(wait);
    })();
  };
})();

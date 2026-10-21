import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_WIDTH, wrap } from './physics.js';

const palette = { grass: 0xa9cf72, darkGrass: 0x83b65a, road: 0x677e79, cream: 0xfff4cf, orange: 0xf98755, pink: 0xf5adad, mint: 0x8dd2c3 };
export function createWorld(canvas, quality = 'auto') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0xe5f1de);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe5f1de);
  scene.fog = new THREE.Fog(0xe5f1de, 240, 650);
  const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 1, 800);
  scene.add(new THREE.HemisphereLight(0xfff9e5, 0x779d69, 2.6));
  const sun = new THREE.DirectionalLight(0xffeed5, 3.2);
  sun.position.set(-65, 130, 70);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 1, far: 400 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = .08;
  sun.shadow.bias = -.0002;
  scene.add(sun);
  const materialCache = new Map();
  function mat(color, extra = {}) {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: .8, ...extra }));
    return materialCache.get(key);
  }
  const geometries = { cube: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 12, 8), cylinder: new THREE.CylinderGeometry(1, 1, 1, 10), cone: new THREE.ConeGeometry(1, 1, 8) };
  function shape(type, color, x, y, z, sx, sy, sz, parent = scene, shadow = true) {
    const mesh = new THREE.Mesh(geometries[type], typeof color === 'object' ? color : mat(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  let seed = 8342;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // A real continuous, elevated road, sampled at equal arc-length intervals.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(5, .15, 78), new THREE.Vector3(64, .15, 69),
    new THREE.Vector3(94, .15, 25), new THREE.Vector3(86, .15, -34),
    new THREE.Vector3(48, 1.5, -69), new THREE.Vector3(1, 4.4, -79),
    new THREE.Vector3(-53, .15, -65), new THREE.Vector3(-87, .15, -29),
    new THREE.Vector3(-83, .15, 22), new THREE.Vector3(-55, .15, 65)
  ], true, 'catmullrom', .45);
  const trackLength = path.getLength();
  const samples = Array.from({ length: 720 }, (_, i) => {
    const u = i / 720, point = path.getPointAt(u), tangent = path.getTangentAt(u).normalize();
    return { u, point, tangent, normal: new THREE.Vector3(tangent.z, 0, -tangent.x).normalize() };
  });
  function ribbon(inner, outer, color, elevation = 0, n = 720) {
    const vertices = [], indices = [];
    for (let i = 0; i <= n; i++) {
      const s = samples[i % samples.length];
      for (const side of [inner, outer]) vertices.push(s.point.x + s.normal.x * side, s.point.y + elevation, s.point.z + s.normal.z * side);
      if (i < n) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat(color, { side: THREE.DoubleSide })); mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  // Floating island with a rounded coastline and layered edges.
  const islandShape = new THREE.Shape();
  for (let i = 0; i <= 100; i++) {
    const a = i / 100 * Math.PI * 2;
    const r = 1 + .025 * Math.sin(a * 5) + .018 * Math.cos(a * 7);
    const x = Math.cos(a) * 124 * r, z = Math.sin(a) * 105 * r;
    if (i === 0) islandShape.moveTo(x, z); else islandShape.lineTo(x, z);
  }
  const islandGeometry = new THREE.ExtrudeGeometry(islandShape, { depth: 8, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 3.5, bevelThickness: 2.5, curveSegments: 8 });
  islandGeometry.rotateX(-Math.PI / 2);
  const island = new THREE.Mesh(islandGeometry, [mat(palette.grass), mat(0xc9bd86)]);
  island.position.y = -10.7; island.receiveShadow = true; island.castShadow = true; scene.add(island);
  shape('cylinder', 0xd8e8bf, 0, -14, 0, 135, 2, 115, scene, false);
  // Border strips stay beside the road instead of overlapping its surface.
  // This also avoids depth-buffer flicker on mobile and far-away menu cameras.
  ribbon(-8.1, -6.6, 0xb7d28c, -.04);
  ribbon(6.6, 8.1, 0xb7d28c, -.04);
  ribbon(-6.6, -6, 0xfff4d7, .01);
  ribbon(6, 6.6, 0xfff4d7, .01);
  ribbon(-TRACK_WIDTH / 2, TRACK_WIDTH / 2, palette.road, .04);
  // Hand-painted curb blocks and dashed center line.
  for (let i = 0; i < 180; i++) {
    const s = samples[i * 4];
    if (i % 3 === 0) {
      const dash = shape('cube', 0xe8e9cd, s.point.x, s.point.y + .075, s.point.z, .17, .025, 2.3, scene, false);
      dash.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    }
    for (const side of [-1, 1]) {
      const block = shape('cube', i % 2 ? 0xfff5d6 : 0xf39a78, s.point.x + s.normal.x * side * 6.35, s.point.y + .08, s.point.z + s.normal.z * side * 6.35, .56, .11, trackLength / 180 + .08, scene, false);
      block.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    }
  }

  function nearest(x, z) {
    let best = Infinity, index = 0;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i].point, d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) { best = d; index = i; }
    }
    const s = samples[index];
    return { ...s, index, distance: Math.sqrt(best), lateral: (x - s.point.x) * s.normal.x + (z - s.point.z) * s.normal.z };
  }
  const obstacles = [];
  function tree(x, z, scale = 1, pine = false) {
    const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group);
    shape('cylinder', 0xa28a61, 0, 1.9 * scale, 0, .42 * scale, 3.8 * scale, .42 * scale, group);
    if (pine) {
      for (let i = 0; i < 3; i++) shape('cone', [0x6e9b61, 0x80ac68, 0x94bb77][i], 0, (3 + i * 1.5) * scale, 0, (2.8 - i * .6) * scale, 4 * scale, (2.8 - i * .6) * scale, group);
    } else {
      shape('sphere', 0x75aa65, -.9 * scale, 5 * scale, 0, 2.6 * scale, 3 * scale, 2.4 * scale, group);
      shape('sphere', 0x93bf70, .9 * scale, 5.7 * scale, .1, 2.8 * scale, 3.2 * scale, 2.6 * scale, group);
    }
    obstacles.push({ x, z, radius: 1.05 * scale });
  }
  for (let i = 0; i < 140; i++) {
    const x = (random() - .5) * 228, z = (random() - .5) * 190;
    if ((x / 115) ** 2 + (z / 97) ** 2 > 1 || nearest(x, z).distance < 13 || (x > -24 && x < 47 && z > -40 && z < 36)) continue;
    tree(x, z, .6 + random() * .65, random() > .55);
  }
  // Friendly rolling hills, kept away from the racing surface.
  for (const [x, z, sx, sy, sz] of [[-29,-24,22,10,18],[38,13,17,7,22],[1,-45,16,6,12],[-105,-54,13,9,13],[65,88,17,7,10]]) {
    shape('sphere', 0x98c56d, x, -2.5, z, sx, sy, sz);
    obstacles.push({ x, z, radius: Math.min(sx, sz) * .7 });
  }
  function house(x, z, color, roofColor, angle = 0, scale = 1) {
    const group = new THREE.Group(); group.position.set(x, .2, z); group.rotation.y = angle; group.scale.setScalar(scale); scene.add(group);
    shape('cube', color, 0, 3, 0, 8, 6, 7, group);
    const roofGeometry = new THREE.CylinderGeometry(1, 1, 1, 3);
    const roof = new THREE.Mesh(roofGeometry, mat(roofColor)); roof.scale.set(6.5, 9, 4); roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.position.y = 7; roof.castShadow = true; group.add(roof);
    shape('cube', 0xe7f6ec, -2, 3.6, 3.53, 1.5, 1.8, .1, group);
    shape('cube', 0xe7f6ec, 2, 3.6, 3.53, 1.5, 1.8, .1, group);
    shape('cube', 0x688e80, 0, 1.5, 3.57, 1.6, 3, .15, group);
    shape('cube', 0xffe6c2, -2, 3.6, 3.61, 1.7, .13, .12, group);
    shape('cube', 0xffe6c2, 2, 3.6, 3.61, 1.7, .13, .12, group);
    shape('cube', 0xf9e1bc, 2.5, 8.4, -1, 1.4, 3, 1.4, group);
    obstacles.push({ x, z, radius: 6 * scale });
  }
  house(14, 17, 0xf4ce8e, 0xe99372, -.35, 1.2);
  house(31, 6, 0xb8d4bd, 0x78aaa0, -.35, .9);
  house(6, -4, 0xeeb6ad, 0xcc8273, -.35, .9);
  house(33, -13, 0xf4dea3, 0xb7ba83, -.35, .7);
  // Plaza and little flower beds.
  shape('cylinder', 0xe4d8ae, 11, -.02, 9, 21, .12, 20, scene, false);
  for (let i = 0; i < 40; i++) {
    const a = random() * Math.PI * 2, r = 9 + random() * 28, x = Math.sin(a) * r + 10, z = Math.cos(a) * r + 5;
    if (nearest(x,z).distance < 10) continue;
    shape('sphere', [0xf5d38e,0xf4b8bd,0xf5eee1][i % 3], x, .4, z, .4, .5, .4, scene, false);
  }
  // A small pond beside the bridge.
  const water = shape('cylinder', mat(0x91d1c3, { metalness: .12, roughness: .28 }), -4, -.02, -61, 22, .13, 10, scene, false);
  const waterRing = shape('cylinder', 0xc2d4a1, -4, -.18, -61, 24, .18, 12, scene, false);
  void waterRing;
  // Bridge guardrails, posts, and supports follow the elevated road.
  for (let i = 330; i < 395; i += 3) {
    const s = samples[i];
    for (const side of [-1, 1]) {
      const post = shape('cube', 0xf1e1bb, s.point.x + s.normal.x * side * 6.8, s.point.y + .9, s.point.z + s.normal.z * side * 6.8, .35, 1.8, .35);
      const rail = shape('cube', 0xf6e5bf, post.position.x, s.point.y + 1.6, post.position.z, .3, .32, 2.6);
      rail.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    }
    if (i % 9 === 0) shape('cube', 0xb9ac8d, s.point.x, s.point.y / 2 - .4, s.point.z, 9, s.point.y + .8, 1.5);
  }
  function board(text, bg, fg = '#fff6d6', width = 6, height = 2) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 55px sans-serif'; ctx.fillText(text, 256, 68);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.BoxGeometry(width, height, .3), [mat(bg),mat(bg),mat(bg),mat(bg),new THREE.MeshStandardMaterial({map:texture,roughness:.8}),new THREE.MeshStandardMaterial({map:texture,roughness:.8})]);
  }
  // Start arch and checkered start line.
  const start = samples[0], arch = new THREE.Group(); arch.position.copy(start.point); arch.rotation.y = Math.atan2(start.tangent.x, start.tangent.z); scene.add(arch);
  for (const side of [-1,1]) {
    shape('cube', 0xf1dfad, side * 7.1, 4.3, 0, .65, 8.6, .65, arch);
    shape('cube', 0xf48759, side * 7.1, 1.3, 0, 1.4, 2.6, 1.3, arch);
  }
  const startBoard = board('SUNNY VALLEY', '#f68c59', '#fff5db', 15.1, 2.3); startBoard.position.y = 8.1; arch.add(startBoard);
  for (let x = 0; x < 12; x++) for (let z = 0; z < 3; z++) shape('cube', (x + z) % 2 ? 0xfaf2d7 : 0x354d48, x - 5.5, .095, z * .85 - .85, 1, .025, .85, arch, false);
  // Three clearly visible checkpoint flags.
  for (const u of [.25,.5,.75]) {
    const s = samples[Math.floor(u * 720)];
    for (const side of [-1,1]) {
      const g = new THREE.Group(); g.position.copy(s.point).addScaledVector(s.normal, side * 7.6); g.rotation.y = Math.atan2(s.tangent.x, s.tangent.z); scene.add(g);
      shape('cylinder', 0xf9ebcb, 0, 3, 0, .13, 6, .13, g);
      shape('cube', 0xfac877, side * .9, 5.4, 0, 1.8, 1.2, .06, g);
    }
  }
  // A wide, open tunnel with room for all racers.
  const tunnelSample = samples[205], tunnel = new THREE.Group(); tunnel.position.copy(tunnelSample.point); tunnel.rotation.y = Math.atan2(tunnelSample.tangent.x,tunnelSample.tangent.z); scene.add(tunnel);
  for (const side of [-1,1]) shape('cube', 0xd2c5a0, side * 7.7, 3.2, 0, 2.2, 6.4, 11, tunnel);
  shape('cube', 0xa4bf75, 0, 7, 0, 17.6, 2.2, 11, tunnel);
  shape('cube', 0xb7cd8e, 0, 8.3, 0, 16.6, .7, 10, tunnel);
  for (const z of [-5.6,5.6]) {
    shape('cube', 0xe2d6b4, -7.7, 3.3, z, 2.5, 6.6, .4, tunnel);
    shape('cube', 0xe2d6b4, 7.7, 3.3, z, 2.5, 6.6, .4, tunnel);
  }
  const tunnelBoard = board('HAPPY TRAILS', '#799d70', '#fff1cd', 9, 1.2); tunnelBoard.position.set(0,7.1,5.8); tunnel.add(tunnelBoard);
  // Road signs and candy-colored safety barriers at the sharper curves.
  for (const n of [90,145,260,440,530,620]) {
    const s=samples[n],g=new THREE.Group(); g.position.copy(s.point).addScaledVector(s.normal,9);g.rotation.y=Math.atan2(s.tangent.x,s.tangent.z);scene.add(g);
    shape('cylinder',0xd2c09b,0,1.8,0,.12,3.6,.12,g);
    const sign=board('› › ›','#f7d88f','#58775c',3.5,1.5);sign.position.y=3.4;g.add(sign);
    for(let j=-2;j<=2;j++) { const k=samples[(n+j*4+720)%720],b=shape('cube',j%2?0xf5e7c5:0xf39e80,k.point.x+k.normal.x*7.4,k.point.y+.7,k.point.z+k.normal.z*7.4,.7,1.4,2.8);b.rotation.y=Math.atan2(k.tangent.x,k.tangent.z); }
  }
  // Windmill and gently moving clouds bring the miniature world to life.
  const windmill = new THREE.Group();windmill.position.set(-39,0,29);scene.add(windmill);
  shape('cone',0xf6e1b5,0,5,0,3,10,3,windmill);
  shape('cone',0xe6a080,0,11,0,3.2,3.5,3.2,windmill);
  const blades=new THREE.Group();blades.position.set(0,9,2.1);windmill.add(blades);
  for(let i=0;i<2;i++){const arm=shape('cube',0xffedc5,0,0,0,.6,12,.25,blades);arm.rotation.z=i*Math.PI/2;}
  shape('sphere',0xe7bc83,0,9,2.3,.8,.8,.5,windmill);
  obstacles.push({x:-39,z:29,radius:3});
  const clouds=[];
  for(let i=0;i<9;i++){
    const g=new THREE.Group(); g.position.set((random()-.5)*320,35+random()*22,(random()-.5)*250);scene.add(g);
    for(let j=0;j<4;j++)shape('sphere',0xfffdf0,(j-1.5)*4,j%2*1.4,0,4.7,2.4+j%2,3,g,false);
    clouds.push({mesh:g,phase:random()*6});
  }
  const balloons=[];
  for(const [x,z,color] of [[-60,95,0xf5ae8a],[-55,94,0xf7d58c],[-57,98,0xc4d6b0]]){
    const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);shape('sphere',color,0,13,0,2.2,2.8,2.2,g);shape('cylinder',0x9d9e7c,0,7,0,.025,10,.025,g,false);balloons.push(g);
  }
  const carMaterials=[];
  // Batch static scenery by material. Trees and curb blocks share a handful of
  // draw calls instead of creating hundreds of individual GPU submissions.
  scene.updateMatrixWorld(true);
  const movingRoots = new Set([water, blades, ...clouds.map(c=>c.mesh), ...balloons]);
  const batches = new Map();
  scene.traverse(object=>{
    if(!object.isMesh||Array.isArray(object.material))return;
    for(let parent=object;parent;parent=parent.parent)if(movingRoots.has(parent))return;
    const key=`${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    if(!batches.has(key))batches.set(key,[]);
    batches.get(key).push(object);
  });
  for(const meshes of batches.values()){
    if(meshes.length<2)continue;
    const pieces=meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    const merged=mergeGeometries(pieces);
    pieces.forEach(piece=>piece.dispose());
    if(!merged)continue;
    const batch=new THREE.Mesh(merged,meshes[0].material);
    batch.castShadow=meshes[0].castShadow;batch.receiveShadow=meshes[0].receiveShadow;
    meshes.forEach(mesh=>mesh.removeFromParent());scene.add(batch);
  }
  function createCar(color) {
    const group=new THREE.Group(), body=new THREE.Group();group.add(body);
    const paint=new THREE.MeshStandardMaterial({color,roughness:.35,metalness:.08});carMaterials.push(paint);
    shape('cube',paint,0,.8,0,1.85,.63,3.45,body);
    shape('sphere',paint,0,.88,1.05,.93,.42,.84,body);
    shape('sphere',paint,0,.91,-1.12,.93,.38,.7,body);
    shape('cube',0x426b68,0,1.32,-.25,1.4,.65,1.65,body);
    shape('sphere',paint,0,1.66,-.32,.79,.16,.93,body);
    shape('cube',0xc0e5da,0,1.39,.6,1.25,.48,.04,body);
    shape('cube',0x98c1b8,-.725,1.4,-.25,.03,.43,1.27,body);
    shape('cube',0x98c1b8,.725,1.4,-.25,.03,.43,1.27,body);
    shape('cube',0xffedc9,0,.65,1.76,1.5,.22,.1,body);
    shape('cube',0xffedc9,0,.65,-1.72,1.55,.19,.13,body);
    shape('cube',0xffe5b3,0,.97,1.1,.19,.02,.85,body);
    const headlightMaterial=new THREE.MeshStandardMaterial({color:0xfff4c4,emissive:0xffd989,emissiveIntensity:1.3});
    for(const side of [-1,1])shape('sphere',headlightMaterial,side*.61,.94,1.71,.22,.17,.1,body);
    const brakeMaterial=new THREE.MeshStandardMaterial({color:0xe87266,emissive:0xff2922,emissiveIntensity:.2});
    for(const side of [-1,1])shape('cube',brakeMaterial,side*.65,.91,-1.72,.3,.17,.08,body);
    const wheels=[],frontPivots=[];
    for(const side of [-1,1])for(const z of [-1.04,1.08]){
      const pivot=new THREE.Group();pivot.position.set(side*.96,.51,z);body.add(pivot);
      const wheel=shape('cylinder',0x344a43,0,0,0,.43,.32,.43,pivot);wheel.rotation.z=Math.PI/2;
      const hub=shape('cylinder',0xffe4b9,side*.18,0,0,.23,.03,.23,pivot);hub.rotation.z=Math.PI/2;
      const wheelRoll=new THREE.Group();pivot.remove(wheel,hub);wheelRoll.add(wheel,hub);pivot.add(wheelRoll);wheels.push(wheelRoll);
      if(z>0)frontPivots.push(pivot);
    }
    shape('cube',paint,0,1.24,-1.6,1.99,.12,.43,body);
    scene.add(group);
    return {group,body,paint,brakeMaterial,wheels,frontPivots,setColor:hex=>paint.color.set(hex)};
  }
  const player=createCar('#fb8654');
  for(const side of [-1,1]){
    const light=new THREE.SpotLight(0xffecc1,14,24,.42,.7,1);
    light.position.set(side*.6,.95,1.65);light.target.position.set(side*.6,.05,14);
    player.group.add(light,light.target);
  }
  const opponents=['#8fb6df','#eeb2cb','#e4c96a'].map(createCar);
  // Reused dust points avoid allocating particles during every frame.
  const dustCount=80,dustData=new Float32Array(dustCount*3),dustLife=new Float32Array(dustCount);
  const dustGeometry=new THREE.BufferGeometry();dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustData,3));
  const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xf5e3b8,size:.46,transparent:true,opacity:.6,depthWrite:false}));dust.frustumCulled=false;scene.add(dust);
  dustData.fill(-100);let dustIndex=0;
  function emitDust(x,y,z){dustData[dustIndex*3]=x+(random()-.5);dustData[dustIndex*3+1]=y+.3;dustData[dustIndex*3+2]=z;dustLife[dustIndex]=1;dustIndex=(dustIndex+1)%dustCount;}
  function animate(time,dt){
    blades.rotation.z=time*.35;
    clouds.forEach((c,i)=>{c.mesh.position.x+=Math.sin(time*.1+i)*dt*.4;c.mesh.position.y+=Math.sin(time*.4+c.phase)*dt*.25;});
    balloons.forEach((b,i)=>{b.rotation.z=Math.sin(time*.7+i)*.06;});
    water.scale.y=.13*(1+Math.sin(time)*.05);
    for(let i=0;i<dustCount;i++)if(dustLife[i]>0){dustLife[i]-=dt*1.6;dustData[i*3+1]+=dt*.8;if(dustLife[i]<=0)dustData[i*3+1]=-100;}
    dustGeometry.attributes.position.needsUpdate=true;
  }
  function setQuality(value){
    const low=value==='low'||(value==='auto'&&(navigator.hardwareConcurrency<=4||matchMedia('(pointer:coarse)').matches));
    renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.8));renderer.shadowMap.enabled=!low;
  }
  setQuality(quality);
  return {renderer,scene,camera,path,trackLength,samples,nearest,obstacles,player,opponents,emitDust,animate,setQuality,wrap};
}

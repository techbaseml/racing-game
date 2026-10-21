import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/outfit/latin-700.css';
import '@fontsource/outfit/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import * as THREE from 'three';
import { createWorld } from './world.js';
import { GameAudio } from './audio.js';
import { MAX_SPEED, LAP_COUNT, wrap, clamp, angleDifference, stepVehicle, createProgress, advanceProgress, formatTime } from './physics.js';

const $ = selector => document.querySelector(selector);
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`turbo-${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`turbo-${key}`, JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ } }
};
const colors = [ ['#fb8654','Tangerine dream'], ['#8ab6dc','Blue sky cruiser'], ['#e9a8c6','Berry speedy'], ['#a5c97a','Little leaf'], ['#e8c364','Sunshine sprint'] ];
const savedSettings = storage.get('settings', {});
const settings = { muted: savedSettings.muted === true, quality: ['auto','high','low'].includes(savedSettings.quality) ? savedSettings.quality : 'auto' };
let carColor = storage.get('color', colors[0][0]);
if (!colors.some(c => c[0] === carColor)) carColor = colors[0][0];
const audio = new GameAudio(settings.muted);
let world;
try {
  world = createWorld($('#world'), settings.quality);
} catch (error) {
  $('#loading').classList.add('hidden'); $('#fatal').classList.remove('hidden');
  $('#fatal-message').textContent = 'This browser could not start 3D graphics. Enable WebGL or hardware acceleration, then try again in a recent version of Chrome, Safari, Firefox, or Edge.';
  console.error(error);
  throw error;
}
const { renderer, scene, camera, path, samples, player, opponents } = world;
player.setColor(carColor);
let state = 'menu', mode = 'race', previousState = 'playing';
let elapsed = 0, lapStarted = 0, lastLap = 0, countdownTime = 0, countdownNumber = 0;
let progress = createProgress(.009), car = { x:0, z:0, heading:0, speed:0, steer:0 };
let racePosition = 1, messageTime = 0, collisionCooldown = 0, shake = 0, lastSafeU = .009;
let actualQuality = settings.quality, slowFrames = 0, qualityFrames = 0;
let lastDialogFocus = null, dialogType = null;
const ai = opponents.map((visual,i) => ({ visual, distance: -.012 - i*.014, speed: 24.5 + i*.65, lane: [-2.7,2.7,0][i], finished: false }));
const keys = new Set(), pointers = new Map();
const keyActions = { KeyW:'accelerate', ArrowUp:'accelerate', KeyS:'brake', ArrowDown:'brake', KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right', Space:'handbrake' };
const input = { accelerate:false, brake:false, left:false, right:false, handbrake:false };
function updateInput() {
  for (const action of Object.keys(input)) input[action] = [...keys].some(key => keyActions[key] === action) || [...pointers.values()].some(p => p.action === action);
}
function clearInput() {
  keys.clear();pointers.clear();updateInput();
  document.querySelectorAll('[data-input]').forEach(b => b.classList.remove('pressed'));
}
function releasePointer(event) {
  pointers.delete(event.pointerId);updateInput();
  document.querySelectorAll('[data-input]').forEach(button => button.classList.toggle('pressed',[...pointers.values()].some(p=>p.button===button)));
}
document.querySelectorAll('[data-input]').forEach(button => {
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();if(state!=='playing')return;
    button.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{action:button.dataset.input,button});button.classList.add('pressed');updateInput();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,releasePointer);
});
document.addEventListener('keydown',event=>{
  if (event.code === 'Tab' && !$('#modal-backdrop').classList.contains('hidden')) {
    const focusables = [...$('#dialog').querySelectorAll('button:not([disabled]),select,input')].filter(el => el.offsetParent !== null);
    const first=focusables[0],last=focusables.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  if (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(event.code==='Escape'&&!event.repeat){if(dialogType==='pause')resume();else if(state==='playing'||state==='countdown')pause();else if(dialogType&&dialogType!=='result')closeDialog();return;}
  if(event.code==='KeyP'&&!event.repeat){if(state==='paused')resume();else if(state==='playing'||state==='countdown')pause();}
  if(keyActions[event.code] && ['playing','countdown'].includes(state)){
    event.preventDefault();keys.add(event.code);updateInput();
  }
});
document.addEventListener('keyup',event=>{keys.delete(event.code);updateInput();});
window.addEventListener('blur',()=>{clearInput();if(state==='playing'||state==='countdown')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(state==='playing'||state==='countdown')pause();}});
window.addEventListener('pagehide',()=>{clearInput();audio.update(0,false,false);});

function notify(text,duration=2.5){$('#race-message').textContent=text;$('#race-message').classList.add('visible');messageTime=duration;}
function syncSound(){document.querySelectorAll('.sound-toggle').forEach(button=>{button.textContent=settings.muted?'♪̸':'♫';button.setAttribute('aria-label',settings.muted?'Unmute sound':'Mute sound');button.setAttribute('aria-pressed',String(settings.muted));});audio.setMuted(settings.muted);}
function saveSettings(){storage.set('settings',settings);syncSound();}
syncSound();
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  audio.init();audio.click();
  if(button.classList.contains('sound-toggle')){settings.muted=!settings.muted;saveSettings();}
  if(button.dataset.dialog)openDialog(button.dataset.dialog);
});
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
  mode=button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('#play>span').textContent=mode==='free'?'LET’S EXPLORE':mode==='trial'?'BEAT THE CLOCK':'LET’S RACE';
}));
$('#play').addEventListener('click',startRace);
$('#pause').addEventListener('click',pause);
$('#reset-car').addEventListener('click',resetCar);
$('#close-dialog').addEventListener('click',()=>{if(dialogType==='pause')resume();else if(dialogType==='result')returnToMenu();else closeDialog();});
$('#modal-backdrop').addEventListener('click',event=>{if(event.target===$('#modal-backdrop')&&!['pause','result'].includes(dialogType))closeDialog();});

function setAtTrack(u,lane=0){
  const point=path.getPointAt(wrap(u)),tangent=path.getTangentAt(wrap(u));
  car.x=point.x+tangent.z*lane;car.z=point.z-tangent.x*lane;car.heading=Math.atan2(tangent.x,tangent.z);car.speed=0;car.steer=0;
  player.group.position.set(car.x,point.y+.1,car.z);player.group.rotation.y=car.heading;
}
function resetCar(){
  if(!['playing','paused'].includes(state))return;
  setAtTrack(lastSafeU);progress.previousU=lastSafeU;clearInput();shake=.1;notify('Back on track. You’ve got this!');
  camera.position.copy(player.group.position).add(new THREE.Vector3(-Math.sin(car.heading)*13,7,-Math.cos(car.heading)*13));
}
function startRace(){
  closeDialog();clearInput();audio.init();
  elapsed=0;lapStarted=0;lastLap=0;racePosition=1;collisionCooldown=0;shake=0;messageTime=0;
  progress=createProgress(.009);lastSafeU=.009;setAtTrack(.009,-1.8);
  ai.forEach((r,i)=>{r.distance=-.012-i*.014;r.finished=false;r.visual.group.visible=mode==='race';placeAI(r,0);});
  $('#menu').classList.add('hidden');$('#hud').classList.remove('hidden');$('#race-message').classList.remove('visible');$('#confetti').classList.add('hidden');
  scene.background.set(0xd7edf0);scene.fog.color.set(0xd7edf0);
  $('#position-panel').classList.toggle('hidden',mode!=='race');$('#timer-panel').classList.toggle('hidden',mode==='free');$('.lap-panel').classList.toggle('hidden',mode==='free');
  $('#lap-label').textContent=mode==='trial'?'TIME TRIAL':'LAP';$('#timer-label').textContent=mode==='trial'?'YOUR TIME':'RACE TIME';
  const best=storage.get('best',null);$('#best-time').textContent=mode==='trial'&&best?`BEST ${formatTime(best)}`:'';
  camera.clearViewOffset();cameraTarget.copy(player.group.position);camera.position.copy(player.group.position).add(new THREE.Vector3(-Math.sin(car.heading)*13,7,-Math.cos(car.heading)*13));camera.lookAt(car.x,1,car.z);
  resize();
  if(mode==='free'){state='playing';notify('Your world, your pace. Go explore!');$('#countdown').classList.add('hidden');}
  else {state='countdown';countdownTime=3;countdownNumber=3;showCount(3);audio.countdown();}
  updateHUD();
}
function showCount(number){const el=$('#countdown');el.textContent=number;el.classList.remove('hidden','pop');void el.offsetWidth;el.classList.add('pop');}
function pause(){
  if(state!=='playing'&&state!=='countdown')return;
  previousState=state;state='paused';clearInput();$('#countdown').classList.add('hidden');openDialog('pause');audio.update(0,false,false);
}
function resume(){if(state!=='paused')return;state=previousState;closeDialog();clearInput();if(state==='countdown')showCount(Math.ceil(countdownTime));audio.init();}
function returnToMenu(){
  closeDialog();clearInput();state='menu';$('#hud').classList.add('hidden');$('#menu').classList.remove('hidden');$('#countdown').classList.add('hidden');$('#confetti').classList.add('hidden');
  scene.background.set(0xe5f1de);scene.fog.color.set(0xe5f1de);
  opponents.forEach(v=>v.group.visible=true);audio.update(0,false,false);resize();
}
function openDialog(type){
  lastDialogFocus=document.activeElement;dialogType=type;
  const content=$('#dialog-content'),best=storage.get('best',null);
  const templates={
    garage:`<span class="dialog-eyebrow">THE LITTLE GARAGE</span><h2>Pick your happy color.</h2><p>Same speedy spirit. A little more you.</p><div class="garage-car" id="garage-preview"></div><div class="car-name" id="car-name"></div><div class="swatches" role="group" aria-label="Car color">${colors.map(([color,name])=>`<button class="swatch ${color===carColor?'selected':''}" style="background:${color}" data-color="${color}" aria-label="${name}" aria-pressed="${color===carColor}"></button>`).join('')}</div><button class="play-button" data-action="close">LOOKING GOOD <span>✓</span></button>`,
    settings:`<span class="dialog-emoji">⚙</span><span class="dialog-eyebrow">MAKE YOURSELF COMFORTABLE</span><h2>Your pit stop.</h2><div class="settings-row"><span>Game sounds<small>A happy engine, a little fanfare.</small></span><button id="sound-setting" class="toggle ${!settings.muted?'on':''}" role="switch" aria-label="Game sounds" aria-checked="${!settings.muted}"></button></div><div class="settings-row"><span>Graphics quality<small>Auto keeps things running smoothly.</small></span><select id="quality-setting" aria-label="Graphics quality"><option value="auto">Automatic</option><option value="high">High</option><option value="low">Lightweight</option></select></div><p>Personal best: ${best?formatTime(best):'Your first adventure is still ahead!'}<br>Trophies won: ${storage.get('trophies',0)}</p><button class="play-button" data-action="close">ALL SET <span>✓</span></button>`,
    help:`<span class="dialog-emoji">🏁</span><span class="dialog-eyebrow">A QUICK DRIVING LESSON</span><h2>Ready, little racer?</h2><p>Follow the road, pass all three yellow checkpoints,<br>and bring your biggest smile.</p><div class="control-list"><div><span class="key">W / ↑</span> Accelerate</div><div><span class="key">S / ↓</span> Brake / reverse</div><div><span class="key">A / ←</span> Steer left</div><div><span class="key">D / →</span> Steer right</div><div><span class="key">SPACE</span> Handbrake</div><div><span class="key">P</span> Pause / resume</div></div><p class="help-note">On a phone or tablet, hold the on-screen arrows. Use two fingers to steer and accelerate together.<br><br><strong>Race day:</strong> 3 laps, 4 friendly racers.<br><strong>Free drive:</strong> explore with no clock.<br><strong>Time trial:</strong> 1 lap to beat your personal best.</p><button class="play-button" data-action="close">GOT IT <span>➜</span></button>`,
    pause:`<span class="dialog-emoji">☕</span><span class="dialog-eyebrow">TAKE A LITTLE BREATHER</span><h2>Adventure on pause.</h2><p>Your wheels will be right here waiting.</p><button class="play-button" data-action="resume">KEEP GOING <span>➜</span></button><button class="secondary-button" data-action="reset">↺ Back on track</button><button class="secondary-button" data-action="restart">Restart ${mode==='free'?'drive':'race'}</button><button class="secondary-button" data-action="menu">Back to the clubhouse</button>`
  };
  content.innerHTML=templates[type]||'';
  content.querySelector('h2')?.setAttribute('id','dialog-title');
  $('#modal-backdrop').classList.remove('hidden');
  if(type==='garage')updateGarage();
  if(type==='settings')$('#quality-setting').value=settings.quality;
  requestAnimationFrame(()=>$('#close-dialog').focus());
}
function closeDialog(){
  $('#modal-backdrop').classList.add('hidden');dialogType=null;
  if(lastDialogFocus?.isConnected)lastDialogFocus.focus();
}
function updateGarage(){
  $('#car-name').textContent=colors.find(c=>c[0]===carColor)[1];
  $('#garage-preview').innerHTML=`<svg width="190" height="95" viewBox="0 0 240 120" aria-label="Your selected car"><ellipse cx="123" cy="105" rx="94" ry="9" fill="#d9e4cc"/><path d="M23 68Q26 55 58 52L82 24Q89 17 105 18L153 23Q163 25 178 53L205 61Q221 65 220 84L215 94H20Z" fill="${carColor}"/><path d="M88 27L109 27L109 53H67ZM116 28L150 31L164 54H116Z" fill="#bfe5dc"/><path d="M24 81H216V94H23Z" fill="#fbe3bc"/><circle cx="66" cy="91" r="22" fill="#354d44"/><circle cx="66" cy="91" r="11" fill="#ffedcb"/><circle cx="178" cy="91" r="22" fill="#354d44"/><circle cx="178" cy="91" r="11" fill="#ffedcb"/><rect x="199" y="67" width="19" height="10" rx="4" fill="#fff4ca"/><rect x="122" y="62" width="12" height="4" rx="2" fill="#fff4ca"/></svg>`;
}
$('#dialog-content').addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.color){carColor=button.dataset.color;storage.set('color',carColor);player.setColor(carColor);updateGarage();document.querySelectorAll('.swatch').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});}
  if(button.id==='sound-setting'){settings.muted=!settings.muted;button.classList.toggle('on',!settings.muted);button.setAttribute('aria-checked',String(!settings.muted));saveSettings();}
  const action=button.dataset.action;
  if(action==='close')closeDialog();if(action==='resume')resume();if(action==='restart')startRace();if(action==='menu')returnToMenu();if(action==='reset'){resume();resetCar();}
});
$('#dialog-content').addEventListener('change',event=>{
  if(event.target.id==='quality-setting'){settings.quality=event.target.value;actualQuality=settings.quality;world.setQuality(settings.quality);saveSettings();resize();}
});
function finish(){
  state='finished';clearInput();audio.update(0,false,false);audio.victory();
  let isBest=false;
  if(mode==='trial'){const previous=storage.get('best',null);if(!previous||elapsed<previous){storage.set('best',elapsed);isBest=true;}}
  if(mode==='race'&&racePosition===1)storage.set('trophies',storage.get('trophies',0)+1);
  openDialog('result');
  const title=mode==='trial'?(isBest?'A new personal best!':'What a speedy lap!'):racePosition===1?'You’re a trail champion!':'That was wheelie fun!';
  $('#dialog-content').innerHTML=`<span class="dialog-emoji">${mode==='trial'?'⏱️':racePosition===1?'🏆':'🏁'}</span><span class="dialog-eyebrow">EVERY FINISH IS AN ADVENTURE</span><h2>${title}</h2><p>${mode==='trial'?'A little practice. A little faster. A lot of fun.':racePosition===1?'A big cheer for our little racer!':'Great driving! The next adventure is waiting.'}</p><div class="result-stats"><div><strong>${formatTime(elapsed)}</strong><small>YOUR TIME</small></div><div><strong>${mode==='trial'?formatTime(storage.get('best',elapsed)):`${racePosition} / 4`}</strong><small>${mode==='trial'?'PERSONAL BEST':'POSITION'}</small></div></div><button class="play-button" data-action="restart">ONE MORE ADVENTURE <span>↺</span></button><button class="secondary-button" data-action="menu">Back to the clubhouse</button>`;
  $('#dialog-content h2').id='dialog-title';
  startConfetti();
}

function placeAI(r,dt){
  const u=wrap(r.distance),point=path.getPointAt(u),tangent=path.getTangentAt(u);
  r.visual.group.position.set(point.x+tangent.z*r.lane,point.y+.12,point.z-tangent.x*r.lane);
  const heading=Math.atan2(tangent.x,tangent.z);
  r.visual.group.rotation.y+=angleDifference(heading,r.visual.group.rotation.y)*Math.min(8*dt,1);
  if(dt===0)r.visual.group.rotation.y=heading;
  r.visual.wheels.forEach(w=>w.rotation.x+=r.speed*dt/ .43);
}
function collide(normalX,normalZ,strength=.45){
  car.x+=normalX*.22;car.z+=normalZ*.22;car.speed*=strength;
  if(collisionCooldown<=0){audio.collision();shake=.27;collisionCooldown=.65;}
}
function updateDriving(dt){
  const before=world.nearest(car.x,car.z);stepVehicle(car,input,dt,before.distance>6.8);
  let near=world.nearest(car.x,car.z);
  if(mode!=='free'&&near.distance>7.1){
    const dx=car.x-near.point.x,dz=car.z-near.point.z;
    car.x=near.point.x+dx/near.distance*7.05;car.z=near.point.z+dz/near.distance*7.05;
    collide(-dx/near.distance,-dz/near.distance,.55);near=world.nearest(car.x,car.z);
  }
  if(mode==='free'){
    const boundary=(car.x/118)**2+(car.z/99)**2;
    if(boundary>1){const f=1/Math.sqrt(boundary);car.x*=f;car.z*=f;collide(-car.x/118,-car.z/99,.3);}
  }
  for(const obstacle of world.obstacles){
    const dx=car.x-obstacle.x,dz=car.z-obstacle.z,dist=Math.hypot(dx,dz),radius=obstacle.radius+1.05;
    if(dist<radius){const nx=dist>.01?dx/dist:1,nz=dist>.01?dz/dist:0;car.x=obstacle.x+nx*radius;car.z=obstacle.z+nz*radius;collide(nx,nz,.35);}
  }
  near=world.nearest(car.x,car.z);
  if(near.distance<6.4){lastSafeU=near.u;}
  player.group.position.set(car.x,near.distance<9?near.point.y+.12:.12,car.z);
  player.group.rotation.y=car.heading;
  player.body.rotation.z+=(clamp(car.steer*car.speed*.007,-.13,.13)-player.body.rotation.z)*dt*8;
  player.body.rotation.x+=((input.brake&&car.speed>1?.04:input.accelerate?-.035:0)-player.body.rotation.x)*dt*5;
  player.wheels.forEach(w=>w.rotation.x+=car.speed*dt/.43);
  player.frontPivots.forEach(p=>p.rotation.y=car.steer*.35);
  player.brakeMaterial.emissiveIntensity=input.brake||input.handbrake?2:.15;
  if(Math.abs(car.speed)>8&&(near.distance>6||input.handbrake))world.emitDust(car.x-Math.sin(car.heading)*1.5,player.group.position.y,car.z-Math.cos(car.heading)*1.5);
  if(mode!=='free'){
    const previousGate=progress.nextCheckpoint;
    const lapComplete=advanceProgress(progress,near.u,near.distance<7.1);
    if(progress.nextCheckpoint!==previousGate&&!lapComplete)notify(`Checkpoint ${previousGate} / 3  ✓`,1.4);
    if(lapComplete){lastLap=elapsed-lapStarted;lapStarted=elapsed;if(progress.laps<(mode==='trial'?1:LAP_COUNT)){notify(`Lap ${progress.laps+1}! Last lap: ${formatTime(lastLap)}`,3);audio.countdown(true);}}
  }
  if(mode==='race'){
    ai.forEach((r,i)=>{
      if(!r.finished){
        // Mild rubber-banding keeps the field friendly, without teleporting cars.
        const relative=clamp((progress.distance-r.distance)*.12,-.08,.08);
        const speed=r.speed*(1+relative)+Math.sin(elapsed*.7+i)*.6;
        r.distance+=speed*dt/world.trackLength;if(r.distance>=LAP_COUNT)r.finished=true;
      }
      placeAI(r,dt);
      const dx=car.x-r.visual.group.position.x,dz=car.z-r.visual.group.position.z,dist=Math.hypot(dx,dz);
      if(dist<2.25&&dist>.01){car.x+=dx/dist*(2.25-dist)*.5;car.z+=dz/dist*(2.25-dist)*.5;if(collisionCooldown<=0)collide(dx/dist,dz/dist,.8);}
    });
    racePosition=1+ai.filter(r=>r.distance>progress.distance).length;
  }
  if(mode!=='free'&&progress.laps>=(mode==='trial'?1:LAP_COUNT))finish();
}
function updateHUD(){
  $('#speed').textContent=Math.round(Math.abs(car.speed)*4.5);$('#speed-fill').style.width=`${Math.abs(car.speed)/MAX_SPEED*100}%`;
  $('#timer').textContent=formatTime(elapsed);$('#lap').innerHTML=`${Math.min(progress.laps+1,mode==='trial'?1:LAP_COUNT)} <span>/ ${mode==='trial'?1:LAP_COUNT}</span>`;
  if(mode==='race')$('#best-time').textContent=`LAP TIME ${formatTime(state==='finished'?lastLap:elapsed-lapStarted)}`;
  $('#position').innerHTML=`${racePosition}<span>/4</span>`;
}
const mapCanvas=$('#minimap'),mapContext=mapCanvas.getContext('2d');
function drawMap(){
  const ctx=mapContext;ctx.clearRect(0,0,180,140);
  const toMap=(x,z)=>[90+x*.72,69+z*.65];
  ctx.beginPath();samples.forEach((s,i)=>{if(i%4)return;const [x,y]=toMap(s.point.x,s.point.z);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.strokeStyle='#a6bc91';ctx.lineWidth=9;ctx.lineJoin='round';ctx.stroke();ctx.strokeStyle='#e8efdc';ctx.lineWidth=5;ctx.stroke();
  function dot(x,z,color,size){const p=toMap(x,z);ctx.beginPath();ctx.arc(...p,size,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#fffbe3';ctx.lineWidth=1.6;ctx.stroke();}
  if(mode==='race')ai.forEach((r,i)=>dot(r.visual.group.position.x,r.visual.group.position.z,['#82a6d8','#dc98ba','#d6b44f'][i],3));
  dot(car.x,car.z,carColor,4.7);
  const p=toMap(samples[0].point.x,samples[0].point.z);ctx.fillStyle='#3f6650';ctx.fillRect(p[0]-1,p[1]-6,2,12);
}

const cameraTarget=new THREE.Vector3(),cameraGoal=new THREE.Vector3(),lookGoal=new THREE.Vector3();
function resize(){
  renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;
  if(state==='menu'){
    scene.fog.near=900;scene.fog.far=1800;
    camera.near=10;
    const mobile=innerWidth<=700&&innerHeight>540;
    camera.fov=43;
    const distance=mobile?Math.max(350,260/camera.aspect):300;
    camera.position.set(distance*.48,distance*.65,distance*.64);camera.lookAt(0,0,0);
    camera.setViewOffset(innerWidth,innerHeight,mobile?0:-innerWidth*.235,mobile?innerHeight*.24:innerHeight*.025,innerWidth,innerHeight);
  }else{scene.fog.near=240;scene.fog.far=650;camera.near=1;camera.clearViewOffset();camera.fov=innerWidth<700?57:59;}
  camera.updateProjectionMatrix();
  const c=$('#confetti');c.width=innerWidth;c.height=innerHeight;
}
window.addEventListener('resize',resize);
function updateCamera(dt){
  const mobile=innerWidth<700,behind=(mobile?12:11)+Math.abs(car.speed)*.1;
  cameraGoal.set(car.x-Math.sin(car.heading)*behind,player.group.position.y+(mobile?7:6.7)+Math.abs(car.speed)*.035,car.z-Math.cos(car.heading)*behind);
  camera.position.lerp(cameraGoal,1-Math.exp(-dt*5));
  lookGoal.set(car.x+Math.sin(car.heading)*5,player.group.position.y+1.3,car.z+Math.cos(car.heading)*5);
  cameraTarget.lerp(lookGoal,1-Math.exp(-dt*8));
  if(shake>0){camera.position.x+=Math.sin(performance.now()*.1)*shake*.25;camera.position.y+=Math.cos(performance.now()*.13)*shake*.15;}
  camera.lookAt(cameraTarget);
}
const confetti=[];const confettiCtx=$('#confetti').getContext('2d');
function startConfetti(){
  $('#confetti').classList.remove('hidden');confetti.length=0;
  for(let i=0;i<110;i++)confetti.push({x:Math.random()*innerWidth,y:-Math.random()*innerHeight-20,vx:(Math.random()-.5)*70,vy:90+Math.random()*130,r:Math.random()*6,w:5+Math.random()*5,color:['#f89561','#a8c574','#f2cc65','#86c6bd','#e7acc8'][i%5]});
}
function drawConfetti(dt){
  if($('#confetti').classList.contains('hidden'))return;
  confettiCtx.clearRect(0,0,innerWidth,innerHeight);let visible=0;
  for(const p of confetti){p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=dt*2;if(p.y>innerHeight+20)continue;visible++;confettiCtx.save();confettiCtx.translate(p.x,p.y);confettiCtx.rotate(p.r);confettiCtx.fillStyle=p.color;confettiCtx.fillRect(-p.w/2,-3,p.w,6);confettiCtx.restore();}
  if(!visible)$('#confetti').classList.add('hidden');
}
setAtTrack(.009,-1.8);ai.forEach((r,i)=>{r.distance=.09+i*.24;placeAI(r,0);});resize();cameraTarget.copy(player.group.position);
let lastTime=performance.now(),worldTime=0,hudTime=0;
function frame(now){
  requestAnimationFrame(frame);
  const rawDt=(now-lastTime)/1000,dt=Math.min(rawDt,.25);lastTime=now;worldTime+=dt;
  world.animate(worldTime,dt);
  if(state==='menu'){
    ai.forEach(r=>{r.distance+=dt*r.speed*.6/world.trackLength;placeAI(r,dt);});
    player.wheels.forEach(w=>w.rotation.x+=dt*.35);
  }
  if(state==='countdown'){
    countdownTime-=dt;const next=Math.ceil(countdownTime);
    if(next!==countdownNumber&&next>0){countdownNumber=next;showCount(next);audio.countdown();}
    if(countdownTime<=0){state='playing';showCount('GO!');audio.countdown(true);countdownTime=-.7;notify('Follow the road. Find your happy speed!',3);}
  }else if(state==='playing'){
    // Substeps keep steering, collisions, and checkpoints stable even when a
    // slow device cannot render at 60 FPS. Gameplay still follows real time.
    let remaining=dt;
    while(remaining>0&&state==='playing'){
      const step=Math.min(remaining,1/60);
      if(mode!=='free')elapsed+=step;
      updateDriving(step);collisionCooldown-=step;remaining-=step;
    }
    shake=Math.max(0,shake-dt);
    if(countdownTime<0){countdownTime+=dt;if(countdownTime>=0)$('#countdown').classList.add('hidden');}
    if(messageTime>0){messageTime-=dt;if(messageTime<=0)$('#race-message').classList.remove('visible');}
  }
  if(state!=='menu'){
    if(state==='playing'||state==='countdown')updateCamera(dt);
    hudTime+=dt;if(hudTime>.08){updateHUD();drawMap();hudTime=0;}
  }
  audio.update(car.speed,state==='playing',input.brake||input.handbrake);
  drawConfetti(dt);renderer.render(scene,camera);
  // Auto quality responds to sustained slow rendering, never to one late frame.
  if(settings.quality==='auto'&&actualQuality!=='low'&&!document.hidden&&worldTime>3){
    qualityFrames++;if(rawDt>.029)slowFrames++;
    if(qualityFrames>=180){if(slowFrames/qualityFrames>.6){actualQuality='low';world.setQuality('low');resize();}slowFrames=0;qualityFrames=0;}
  }
}
requestAnimationFrame(frame);
renderer.render(scene,camera);
$('#loading').classList.add('hidden');
// A small read-only snapshot supports reproducible browser smoke tests.
window.turboTrails=Object.freeze({snapshot:()=>{
  const nearest=world.nearest(car.x,car.z),target=path.getPointAt(wrap(nearest.u+.022));
  return {state,mode,speed:car.speed,x:car.x,z:car.z,heading:car.heading,lap:progress.laps,checkpoint:progress.nextCheckpoint,elapsed,position:racePosition,input:{...input},opponents:ai.map(r=>r.distance),quality:actualQuality,track:{u:nearest.u,distance:nearest.distance,target:{x:target.x,z:target.z}},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}};
}});

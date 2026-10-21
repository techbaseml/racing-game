import { test, expect } from '@playwright/test';

async function snapshot(page){ return page.evaluate(()=>window.turboTrails.snapshot()); }
async function load(page){
  await page.addInitScript(()=>localStorage.setItem('turbo-settings',JSON.stringify({quality:'low',muted:true})));
  await page.goto('/');await page.waitForFunction(()=>window.turboTrails);
}
async function start(page,mode='race'){
  if(mode!=='race')await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.turboTrails.snapshot().state==='playing',null,{timeout:60000});
}
async function autopilot(page){
  // Drives using the same keyboard events as a player. No game-state mutation.
  await page.evaluate(()=>{
    const pressed=new Set();
    const set=(code,on)=>{if(on!==pressed.has(code)){document.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true}));on?pressed.add(code):pressed.delete(code);}};
    window.testDriver=setInterval(()=>{
      const s=window.turboTrails.snapshot();
      if(s.state!=='playing'){['KeyW','KeyA','KeyD'].forEach(code=>set(code,false));clearInterval(window.testDriver);return;}
      const target=Math.atan2(s.track.target.x-s.x,s.track.target.z-s.z);
      const difference=Math.atan2(Math.sin(target-s.heading),Math.cos(target-s.heading));
      set('KeyW',true);set('KeyA',difference>.035);set('KeyD',difference<-.035);
    },25);
  });
}

test('menus, persistence, keyboard driving, AI, pause, recovery and restart',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await load(page);
  await page.getByRole('button',{name:'Select your car'}).click();
  await page.getByRole('button',{name:'Blue sky cruiser'}).click();
  await expect(page.locator('#car-name')).toHaveText('Blue sky cruiser');
  await page.getByRole('button',{name:'LOOKING GOOD'}).click();
  await page.reload();await page.waitForFunction(()=>window.turboTrails);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('turbo-color')))).toBe('#8ab6dc');
  await page.getByRole('button',{name:'How to play'}).click();await expect(page.locator('#dialog-content')).toContainText('Handbrake');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#quality-setting').selectOption('low');
  await page.getByRole('button',{name:'ALL SET'}).click();
  await start(page);
  const before=await snapshot(page);
  await page.keyboard.down('w');await expect.poll(async()=>(await snapshot(page)).speed).toBeGreaterThan(12);
  await page.keyboard.down('a');await page.waitForTimeout(400);await page.keyboard.up('a');await page.keyboard.up('w');
  const after=await snapshot(page);expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(3);expect(after.heading).toBeGreaterThan(before.heading);
  expect(after.opponents[0]).toBeGreaterThan(before.opponents[0]);
  await page.keyboard.press('p');await expect(page.getByRole('heading',{name:'Adventure on pause.'})).toBeVisible();
  const paused=await snapshot(page);await page.waitForTimeout(600);expect((await snapshot(page)).elapsed).toBe(paused.elapsed);
  expect((await snapshot(page)).input.accelerate).toBe(false);
  await page.locator('[data-action="reset"]').click();expect((await snapshot(page)).state).toBe('playing');
  // Driving straight into the curved road edge must cause a real collision.
  await page.keyboard.down('w');await page.waitForTimeout(7000);await page.keyboard.up('w');
  expect((await snapshot(page)).track.distance).toBeLessThanOrEqual(7.2);
  await page.keyboard.press('p');await page.getByRole('button',{name:'Restart race',exact:true}).click();
  const restarted=await snapshot(page);expect(restarted.lap).toBe(0);expect(restarted.elapsed).toBe(0);expect(restarted.checkpoint).toBe(1);expect(restarted.speed).toBe(0);
  await page.keyboard.press('p');await page.getByRole('button',{name:'Back to the clubhouse'}).click();
  await expect(page.locator('#menu')).toBeVisible();expect(errors).toEqual([]);
});

test('time trial finishes through real driving and retains its personal best',async({page})=>{
  await load(page);await start(page,'trial');await autopilot(page);
  await page.waitForFunction(()=>window.turboTrails.snapshot().state==='finished',null,{timeout:150000});
  expect((await snapshot(page)).lap).toBe(1);
  await expect(page.getByRole('heading',{name:'A new personal best!'})).toBeVisible();
  const best=await page.evaluate(()=>JSON.parse(localStorage.getItem('turbo-best')));expect(best).toBeGreaterThan(5);
  await page.getByRole('button',{name:'Back to the clubhouse'}).click();await page.reload();await page.waitForFunction(()=>window.turboTrails);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('turbo-best')))).toBe(best);
});

test('three-lap race reaches results without skipping checkpoints',async({page})=>{
  test.setTimeout(300000);
  await load(page);await start(page);await autopilot(page);
  await page.waitForFunction(()=>window.turboTrails.snapshot().state==='finished',null,{timeout:270000});
  const result=await snapshot(page);expect(result.lap).toBe(3);expect(result.position).toBeGreaterThanOrEqual(1);expect(result.position).toBeLessThanOrEqual(4);
  await expect(page.locator('#dialog-content')).toContainText('YOUR TIME');
  await page.getByRole('button',{name:'ONE MORE ADVENTURE'}).click();expect((await snapshot(page)).lap).toBe(0);
});

test.describe('touchscreen',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('multitouch holds, independent release, cancellation, landscape and free drive',async({page,context})=>{
    await load(page);await start(page,'free');
    await expect(page.locator('#timer-panel')).toBeHidden();
    const gas=await page.locator('[data-input="accelerate"]').boundingBox(),left=await page.locator('[data-input="left"]').boundingBox();
    const gasPoint={x:gas.x+gas.width/2,y:gas.y+gas.height/2,id:1};
    const leftPoint={x:left.x+left.width/2,y:left.y+left.height/2,id:2};
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[gasPoint,leftPoint]});
    await expect.poll(async()=>(await snapshot(page)).input).toMatchObject({accelerate:true,left:true});
    await expect.poll(async()=>(await snapshot(page)).speed).toBeGreaterThan(5);
    // CDP touchEnd names the released touch, not the touches still being held.
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[leftPoint]});
    await expect.poll(async()=>(await snapshot(page)).input).toMatchObject({accelerate:true,left:false});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await expect.poll(async()=>(await snapshot(page)).input).toMatchObject({accelerate:false,left:false});
    expect((await snapshot(page)).elapsed).toBe(0);
    await page.setViewportSize({width:844,height:390});
    for(const action of ['left','right','accelerate','brake']){
      const box=await page.locator(`[data-input="${action}"]`).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(390);
    }
    await page.locator('#pause').click();await expect(page.getByRole('heading',{name:'Adventure on pause.'})).toBeVisible();
  });
});

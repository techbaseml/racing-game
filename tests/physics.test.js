import test from 'node:test';
import assert from 'node:assert/strict';
import { stepVehicle, createProgress, advanceProgress, MAX_SPEED, angleDifference, formatTime } from '../physics.js';

const vehicle = () => ({ x: 0, z: 0, heading: 0, speed: 0, steer: 0 });
function drive(car,input,seconds,offroad=false) { for(let i=0;i<seconds*120;i++)stepVehicle(car,input,1/120,offroad);return car; }
test('acceleration moves the car gradually and caps its speed',()=>{
  const car=vehicle();drive(car,{accelerate:true},.5);assert.ok(car.speed>0&&car.speed<10);assert.ok(car.z>0);
  drive(car,{accelerate:true},10);assert.equal(car.speed,MAX_SPEED);
});
test('braking slows forward motion, then reverses with a safe speed limit',()=>{
  const car=drive(vehicle(),{accelerate:true},3);const speed=car.speed;
  drive(car,{brake:true},.4);assert.ok(car.speed<speed&&car.speed>0);
  drive(car,{brake:true},5);assert.ok(car.speed<0&&car.speed>=-10);
});
test('multikey steering works while accelerating and reverses direction in reverse',()=>{
  const car=drive(vehicle(),{accelerate:true,left:true},1.5);assert.ok(car.heading>0&&car.x>0&&car.speed>0);
  const reverse=vehicle();drive(reverse,{brake:true,left:true},2);assert.ok(reverse.heading<0);
});
test('handbrake slows the car, coasting stops, and grass reduces top speed',()=>{
  const car=drive(vehicle(),{accelerate:true},3),speed=car.speed;drive(car,{handbrake:true},.5);assert.ok(car.speed<speed-10);
  drive(car,{},8);assert.equal(car.speed,0);
  const grass=drive(vehicle(),{accelerate:true},10,true);assert.ok(grass.speed<18);
});
test('physics is stable at different frame rates',()=>{
  const a=vehicle(),b=vehicle();for(let i=0;i<120;i++)stepVehicle(a,{accelerate:true},1/60);for(let i=0;i<240;i++)stepVehicle(b,{accelerate:true},1/120);
  assert.ok(Math.abs(a.speed-b.speed)<.1);assert.ok(Math.abs(a.z-b.z)<.3);
});
test('holding the handbrake stops the wheels without oscillating into reverse',()=>{
  const car=vehicle();car.speed=.1;drive(car,{handbrake:true},1);assert.equal(car.speed,0);
  drive(car,{handbrake:true,accelerate:true},1);assert.equal(car.speed,0);
});
test('laps require all checkpoints in order and a forward finish crossing',()=>{
  const p=createProgress(.01);
  for(let u=.02;u<1.02;u+=.01)advanceProgress(p,u);
  assert.equal(p.laps,1);assert.equal(p.nextCheckpoint,1);
  advanceProgress(p,.99);advanceProgress(p,.01);assert.equal(p.laps,1);
});
test('backwards finish crossing, teleporting and off-track shortcuts do not award laps',()=>{
  const p=createProgress(.02);advanceProgress(p,.99);assert.equal(p.laps,0);
  advanceProgress(p,.26);assert.equal(p.nextCheckpoint,1);
  for(let u=.27;u<1.02;u+=.01)advanceProgress(p,u);assert.equal(p.laps,0);
  const offroad=createProgress(.24);advanceProgress(offroad,.26,false);assert.equal(offroad.nextCheckpoint,1);
});
test('resetting the previous sample does not change earned progress',()=>{
  const p=createProgress(.01);for(let u=.02;u<.52;u+=.01)advanceProgress(p,u);
  const checkpoint=p.nextCheckpoint;p.previousU=.49;advanceProgress(p,.5);assert.equal(p.nextCheckpoint,checkpoint);assert.equal(p.laps,0);
});
test('angle interpolation crosses the ±pi boundary by the shortest route',()=>{assert.ok(Math.abs(angleDifference(-Math.PI+.1,Math.PI-.1)-.2)<.001);});
test('race timer formats centiseconds and minutes',()=>{assert.equal(formatTime(65.439),'01:05.43');assert.equal(formatTime(0),'00:00.00');});

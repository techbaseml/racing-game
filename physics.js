export const TRACK_WIDTH = 12;
export const MAX_SPEED = 38;
export const LAP_COUNT = 3;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const wrap = n => ((n % 1) + 1) % 1;
export function angleDifference(target, current) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}
export function stepVehicle(car, input, dt, offroad = false) {
  const accelerate = input.accelerate ? 1 : 0;
  const brake = input.brake ? 1 : 0;
  const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  let acceleration = 0;
  if (accelerate) acceleration += car.speed < -1 ? 23 : 14;
  if (brake) acceleration -= car.speed > 1 ? 26 : 9;
  if (!accelerate && !brake) acceleration -= Math.sign(car.speed) * Math.min(Math.abs(car.speed) / Math.max(dt, .001), 4.5);
  if (input.handbrake) acceleration -= Math.sign(car.speed) * 25;
  acceleration -= car.speed * (offroad ? 1.7 : .12);
  const previousSpeed = car.speed;
  car.speed = clamp(car.speed + acceleration * dt, -10, offroad ? 18 : MAX_SPEED);
  if (input.handbrake && (Math.abs(car.speed) < 1 || previousSpeed * car.speed < 0)) car.speed = 0;
  if (Math.abs(car.speed) < .05) car.speed = 0;
  const steerStrength = Math.min(Math.abs(car.speed) / 7, 1) * (1.3 - .42 * Math.abs(car.speed) / MAX_SPEED);
  const targetSteer = steering * steerStrength;
  car.steer += (targetSteer - car.steer) * Math.min(dt * 9, 1);
  car.heading += car.steer * dt * Math.sign(car.speed) * (input.handbrake ? 1.6 : 1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  return car;
}

// An ordered checkpoint sequence prevents finish-line bouncing and skipped laps.
export function createProgress(startU = 0) {
  return { previousU: wrap(startU), distance: startU, nextCheckpoint: 1, laps: 0 };
}
export function advanceProgress(progress, u, onTrack = true) {
  u = wrap(u);
  let delta = u - progress.previousU;
  if (delta > .5) delta -= 1;
  if (delta < -.5) delta += 1;
  const previous = progress.previousU;
  progress.previousU = u;
  // Ignore teleports and off-track shortcuts.
  if (!onTrack || Math.abs(delta) > .08) return false;
  progress.distance += delta;
  if (delta <= 0) return false;
  const gate = progress.nextCheckpoint * .25;
  const crossed = gate < 1 ? previous < gate && u >= gate && delta < .08 : previous > .9 && u < .1;
  if (!crossed) return false;
  if (progress.nextCheckpoint < 4) {
    progress.nextCheckpoint++;
    return false;
  }
  progress.laps++;
  progress.nextCheckpoint = 1;
  return true;
}
export function formatTime(seconds) {
  const centiseconds = Math.max(0, Math.floor(seconds * 100));
  return `${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

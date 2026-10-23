/**
 * Per-frame CPU cost of the residents.
 *
 * The WebGL side cannot be measured here (no GPU, no browser), but the CPU work
 * the renderer does every frame can: stepping the simulation, filling each body
 * and writing the instance matrices. This is what decides whether 20 residents
 * are affordable inside a 16 ms frame.
 *
 *   npx tsx scripts/bench-residents.ts
 */
import * as THREE from "three";
import { SEED_UNITS } from "../src/lib/domain/inventory";
import { RESIDENTS, residentWorldFor, createResidentSim, stepResidentSim } from "../src/lib/3d/residents";
import { BODY_INSTANCES, createBodyBuffer, fillBody } from "../src/lib/3d/resident-skeleton";

const entries = SEED_UNITS.map((unit) => ({
  code: unit.code,
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
  typology: unit.typology,
}));

const world = residentWorldFor(entries);
const sim = createResidentSim(world, { count: 20, seed: 20260214 });
const body = createBodyBuffer();
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

const frames = 5000;
const stepStart = process.hrtime.bigint();
for (let i = 0; i < frames; i += 1) stepResidentSim(sim, 1 / 60);
const stepNs = Number(process.hrtime.bigint() - stepStart);

const fillStart = process.hrtime.bigint();
let written = 0;
for (let i = 0; i < frames; i += 1) {
  for (const resident of sim.residents) {
    fillBody(resident, body);
    for (const transform of body) {
      position.set(transform.x, transform.y, transform.z);
      scale.set(transform.sx, transform.sy, transform.sz);
      quaternion.setFromAxisAngle(up, transform.yaw);
      matrix.compose(position, quaternion, scale);
      written += 1;
    }
  }
}
const fillNs = Number(process.hrtime.bigint() - fillStart);

const ms = (ns: number) => ns / 1e6 / frames;
console.log(`residents: ${sim.residents.length}`);
console.log(`simulation step:   ${ms(stepNs).toFixed(4)} ms/frame`);
console.log(`bodies + matrices: ${ms(fillNs).toFixed(4)} ms/frame (${written / frames} matrices)`);
console.log(`total CPU:         ${(ms(stepNs) + ms(fillNs)).toFixed(4)} ms/frame`);
console.log(`instances: ${sim.residents.length * BODY_INSTANCES} · step clamp ${RESIDENTS.maxDelta}s`);

/**
 * Simulated minutes of the population, measured.
 *
 * Runs the real simulation for thirteen minutes of scene time at 15 Hz and
 * prints the numbers the delivery report quotes: how far a body ever strayed
 * from the pedestrian network, the closest two bodies ever came, the longest
 * stretch of walking without moving, and the conversation/navigation counters.
 *
 *   npx tsx scripts/probe-residents.ts [minutes]
 */
import { SEED_UNITS } from "../src/lib/domain/inventory";
import {
  RESIDENTS,
  buildResidentWorld,
  createResidentSim,
  residentWorldFor,
  stepResidentSim,
} from "../src/lib/3d/residents";

const entries = SEED_UNITS.map((unit) => ({
  code: unit.code,
  position: { x: unit.position.x, z: unit.position.z },
  rotationY: unit.position.rotationY,
  typology: unit.typology,
}));

const minutes = Number(process.argv[2] ?? 13);
const world = residentWorldFor(entries) ?? buildResidentWorld(entries);
const sim = createResidentSim(world, { count: RESIDENTS.defaultCount, seed: 20260214 });

function distanceToNetwork(x: number, z: number): number {
  let best = Infinity;
  for (let node = 0; node < world.nodes.length; node += 1) {
    const a = world.nodes[node]!;
    for (const next of world.adjacency[node]!) {
      if (next < node) continue;
      const b = world.nodes[next]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      best = Math.min(best, Math.hypot(x - px, z - pz));
    }
  }
  return best;
}

const dt = 1 / 15;
const steps = Math.round(minutes * 60 * 15);
let worstOffNetwork = 0;
let closestPair = Infinity;
let stillRun = 0;
let worstStillRun = 0;
const last = sim.residents.map((resident) => ({ x: resident.x, z: resident.z }));

for (let step = 0; step < steps; step += 1) {
  stepResidentSim(sim, dt);
  for (let i = 0; i < sim.residents.length; i += 1) {
    const resident = sim.residents[i]!;
    if (step % 15 === 0) worstOffNetwork = Math.max(worstOffNetwork, distanceToNetwork(resident.x, resident.z));
    if (resident.state === "walking") {
      const moved = Math.hypot(resident.x - last[i]!.x, resident.z - last[i]!.z);
      stillRun = moved < 0.002 ? stillRun + dt : 0;
      worstStillRun = Math.max(worstStillRun, stillRun);
    } else {
      stillRun = 0;
    }
    last[i] = { x: resident.x, z: resident.z };
    for (let j = i + 1; j < sim.residents.length; j += 1) {
      const other = sim.residents[j]!;
      closestPair = Math.min(closestPair, Math.hypot(other.x - resident.x, other.z - resident.z));
    }
  }
}

const counts = sim.residents.reduce<Record<string, number>>((total, resident) => {
  total[resident.state] = (total[resident.state] ?? 0) + 1;
  return total;
}, {});

console.log(`minutes: ${minutes} · steps: ${steps} · residents: ${sim.residents.length}`);
console.log(`off-network worst:    ${worstOffNetwork.toFixed(2)} m`);
console.log(`closest pair:         ${closestPair.toFixed(2)} m`);
console.log(`walking without moving, longest run: ${worstStillRun.toFixed(1)} s`);
console.log(`stuck recoveries:     ${sim.stuckRecoveries}`);
console.log(`conversations:        ${sim.conversations.started} started / ${sim.conversations.ended} ended`);
console.log(`unreachable meetings: ${sim.unreachableMeetings}`);
console.log(`navigation failures:  ${sim.navFailures}`);
console.log(`states at end:        ${JSON.stringify(counts)}`);

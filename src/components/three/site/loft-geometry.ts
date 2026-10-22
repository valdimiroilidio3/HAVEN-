import * as THREE from "three";
import type { LoftSection } from "@/lib/3d/parts";

/**
 * A closed shell swept through a stack of superellipse sections.
 *
 * This is the primitive the car bodies are built from. A box gives a van; a
 * loft gives a bonnet that drops to the nose, a shoulder that swells over the
 * rear wheel and a tail that tapers — the shapes that make a car read as a car
 * from any camera angle.
 *
 * Sections are supplied in the part's local space, centred on the origin (the
 * validator derives its bounds from `shapeExtents`, which assumes that
 * centring). Smooth normals are computed once per ring so the shell shades
 * continuously; the caps get their own vertices so the silhouette stays crisp
 * instead of rounding into the end face.
 */

const TAU = Math.PI * 2;

function clampSquareness(value: number | undefined): number {
  const squareness = value ?? 3;
  return Math.min(8, Math.max(2, squareness));
}

/** One point on the section's superellipse, in local XY. */
function ringPoint(section: LoftSection, angle: number): [number, number] {
  const n = clampSquareness(section.squareness);
  const centreY = (section.bottom + section.top) / 2;
  const halfHeight = Math.max(1e-4, (section.top - section.bottom) / 2);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const y = centreY + halfHeight * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / n);
  let width = section.halfWidth;
  if (section.topHalfWidth !== undefined) {
    // Tumblehome: interpolate between the shoulder width and the roof width as
    // the ring climbs, so the section stays a trapezoid rather than a dome.
    const climb = (y - section.bottom) / Math.max(1e-4, section.top - section.bottom);
    width = section.halfWidth + (section.topHalfWidth - section.halfWidth) * Math.min(1, Math.max(0, climb));
  }
  const x = width * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / n);
  return [x, y];
}

export function loftGeometry(sections: LoftSection[], segments = 16): THREE.BufferGeometry {
  const ordered = [...sections].sort((a, b) => a.z - b.z);
  if (ordered.length < 2) return new THREE.BufferGeometry();
  const n = Math.max(6, Math.round(segments));

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Side surface: one ring per section, wrapping the index so the seam shares
  // vertices and therefore normals — no visible ridge where the sweep closes.
  ordered.forEach((section, index) => {
    for (let k = 0; k < n; k += 1) {
      const [x, y] = ringPoint(section, (k / n) * TAU);
      positions.push(x, y, section.z);
      uvs.push(k / n, index / (ordered.length - 1));
    }
  });
  for (let i = 0; i < ordered.length - 1; i += 1) {
    for (let k = 0; k < n; k += 1) {
      const next = (k + 1) % n;
      const a = i * n + k;
      const b = i * n + next;
      const c = (i + 1) * n + k;
      const d = (i + 1) * n + next;
      // Winding: ring k → k+1 → next ring, which is outward for a ring that
      // runs counter-clockwise in XY and a sweep that runs along +Z. Reversed,
      // every side face points inward and the body renders inside-out.
      indices.push(a, b, c, b, d, c);
    }
  }

  // Caps: separate vertices, so their flat normal does not bleed into the sides.
  for (const [index, section] of [ordered[0]!, ordered[ordered.length - 1]!].entries()) {
    const base = positions.length / 3;
    let sumX = 0;
    let sumY = 0;
    for (let k = 0; k < n; k += 1) {
      const [x, y] = ringPoint(section, (k / n) * TAU);
      positions.push(x, y, section.z);
      uvs.push(x / Math.max(1e-4, section.halfWidth) * 0.5 + 0.5, 0.5 + y * 0.5);
      sumX += x;
      sumY += y;
    }
    positions.push(sumX / n, sumY / n, section.z);
    uvs.push(0.5, 0.5);
    const centre = base + n;
    for (let k = 0; k < n; k += 1) {
      const next = (k + 1) % n;
      // The first section closes the -Z end, the last one the +Z end; winding
      // follows the sweep direction so both faces point outward.
      if (index === 0) indices.push(centre, base + next, base + k);
      else indices.push(centre, base + k, base + next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Every primitive in the merge path needs the same attributes; a loft without
  // uvs makes mergeGeometries return null and the car silently disappears.
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

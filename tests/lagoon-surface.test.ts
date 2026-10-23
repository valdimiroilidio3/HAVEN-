import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { SITE } from "@/lib/3d/site";
import { LAGOON_WATER } from "@/lib/3d/lagoon";
import {
  deckPavingGeometry,
  disposeLagoonSurfaces,
  lagoonVergeGeometry,
} from "@/components/three/site/lagoon-geometry";

/**
 * "There is water in the middle of the lagoon."
 *
 * This is a stacking test, not a pixel test: a ray cast straight down through
 * the scene must meet the water before it meets any paving. It exists because the
 * deck used to be a *filled* ellipse drawn 6 cm above the surface — the lagoon
 * rendered as a stone disc with no water at all, and a screenshot was the only
 * way anyone noticed.
 */

const { radiusX, radiusZ, deck } = SITE.lagoon;

function surfaces() {
  const stone = new THREE.Mesh(
    deckPavingGeometry({ radiusX, radiusZ, deck, segments: 96 }),
    new THREE.MeshBasicMaterial(),
  );
  stone.position.set(0, 0.08, 0);

  const lawn = new THREE.Mesh(
    lagoonVergeGeometry({ radiusX, radiusZ, deck, margin: 2.4, segments: 96 }),
    new THREE.MeshBasicMaterial(),
  );
  lawn.position.set(0, 0.03, 0);

  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial());
  water.scale.set(radiusX, radiusZ, 1);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, LAGOON_WATER.y, 0);

  // Raycasting reads matrixWorld, which is identity until it is refreshed.
  for (const mesh of [stone, lawn, water]) mesh.updateMatrixWorld(true);
  return { stone, lawn, water };
}

/** Y of the first surface a downward ray meets, or null for open sky. */
function topSurfaceY(x: number, z: number): number | null {
  const { stone, lawn, water } = surfaces();
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 12, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObjects([stone, lawn, water], false);
  return hits[0]?.point.y ?? null;
}

beforeEach(() => {
  disposeLagoonSurfaces();
});

describe("lagoon surfaces", () => {
  it("shows water in the middle of the lagoon", () => {
    expect(topSurfaceY(0, 0)).toBeCloseTo(LAGOON_WATER.y, 4);
  });

  it("shows water over the whole basin, not only at its centre", () => {
    // Sample the aperture: 80% of each water radius must still be water.
    for (const [fx, fz] of [
      [0.8, 0],
      [-0.8, 0],
      [0, 0.8],
      [0, -0.8],
      [0.55, 0.55],
      [-0.55, -0.55],
    ] as const) {
      expect(topSurfaceY(radiusX * fx, radiusZ * fz), `at ${fx},${fz}`).toBeCloseTo(LAGOON_WATER.y, 4);
    }
  });

  it("keeps the deck paved between the water edge and the deck edge", () => {
    const midDeck = radiusX + deck / 2;
    expect(topSurfaceY(midDeck, 0)).toBeCloseTo(0.08, 4);
    expect(topSurfaceY(-midDeck, 0)).toBeCloseTo(0.08, 4);
    expect(topSurfaceY(0, -(radiusZ + deck / 2))).toBeCloseTo(0.08, 4);
  });

  it("puts the grass verge outside the deck, never over the water", () => {
    expect(topSurfaceY(radiusX + deck + 1.2, 0)).toBeCloseTo(0.03, 4);
    expect(topSurfaceY(0, radiusZ + deck + 1.2)).toBeCloseTo(0.03, 4);
    // The verge is a ring: nothing of it crosses the basin.
    expect(topSurfaceY(radiusX * 0.5, 0)).toBeCloseTo(LAGOON_WATER.y, 4);
  });

  it("leaves the water aperture exactly at the water ellipse", () => {
    // Just inside the rim: water. Just outside: paving.
    expect(topSurfaceY(radiusX - 0.2, 0)).toBeCloseTo(LAGOON_WATER.y, 4);
    expect(topSurfaceY(radiusX + 0.2, 0)).toBeCloseTo(0.08, 4);
  });
});

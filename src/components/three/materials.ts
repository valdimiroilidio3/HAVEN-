import * as THREE from "three";
import { asphaltTexture, concreteTexture, grassTexture, gravelTexture, stoneTexture, timberTexture } from "./textures";

export interface HavenMaterials {
  stone: THREE.MeshStandardMaterial;
  render: THREE.MeshStandardMaterial;
  renderWarm: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  timberDark: THREE.MeshStandardMaterial;
  charcoal: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  glassRail: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  lawn: THREE.MeshStandardMaterial;
  hedge: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial[];
  white: THREE.MeshStandardMaterial;
  sand: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
}

let cached: HavenMaterials | null = null;

function standard(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(params);
}

/** Shared PBR material set — created once, reused by all 13 houses. */
export function getMaterials(): HavenMaterials {
  if (cached) return cached;

  const stoneMap = stoneTexture();
  const timberMap = timberTexture();
  const concreteMap = concreteTexture();
  const grassMap = grassTexture();
  const asphaltMap = asphaltTexture();
  const gravelMap = gravelTexture();
  for (const map of [stoneMap, timberMap, concreteMap, grassMap, asphaltMap, gravelMap]) {
    if (map) map.colorSpace = THREE.SRGBColorSpace;
  }

  cached = {
    stone: standard({ map: stoneMap, color: new THREE.Color("#cfc7b6"), roughness: 0.94, metalness: 0.02 }),
    render: standard({ color: new THREE.Color("#e7e3d7"), roughness: 0.88, metalness: 0.0 }),
    renderWarm: standard({ color: new THREE.Color("#ded8c8"), roughness: 0.9 }),
    concrete: standard({ map: concreteMap, color: new THREE.Color("#d4cec1"), roughness: 0.85 }),
    timber: standard({ map: timberMap, color: new THREE.Color("#a98462"), roughness: 0.72 }),
    timberDark: standard({ color: new THREE.Color("#55402c"), roughness: 0.7 }),
    charcoal: standard({ color: new THREE.Color("#23251f"), roughness: 0.55, metalness: 0.28 }),
    metal: standard({ color: new THREE.Color("#2a2c27"), roughness: 0.32, metalness: 0.82 }),
    glass: standard({
      color: new THREE.Color("#1f2b2c"),
      roughness: 0.06,
      metalness: 0.92,
      transparent: true,
      opacity: 0.62,
      envMapIntensity: 1.35,
    }),
    glassRail: standard({
      color: new THREE.Color("#aebdb7"),
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.26,
      envMapIntensity: 1,
    }),
    asphalt: standard({ map: asphaltMap, color: new THREE.Color("#8b8b86"), roughness: 1 }),
    grass: standard({ map: grassMap, color: new THREE.Color("#8fa073"), roughness: 1 }),
    lawn: standard({ map: grassMap, color: new THREE.Color("#7f9163"), roughness: 1 }),
    gravel: standard({ map: gravelMap, color: new THREE.Color("#cec6b2"), roughness: 1 }),
    deck: standard({ map: timberMap, color: new THREE.Color("#b08a61"), roughness: 0.78 }),
    hedge: standard({ color: new THREE.Color("#465436"), roughness: 1 }),
    trunk: standard({ color: new THREE.Color("#5d4a37"), roughness: 0.95 }),
    foliage: [
      standard({ color: new THREE.Color("#4d6138"), roughness: 1, flatShading: true }),
      standard({ color: new THREE.Color("#5c7042"), roughness: 1, flatShading: true }),
      standard({ color: new THREE.Color("#6a7d4c"), roughness: 1, flatShading: true }),
    ],
    white: standard({ color: new THREE.Color("#f1eee5"), roughness: 0.9 }),
    sand: standard({ color: new THREE.Color("#c7a77a"), roughness: 0.8 }),
    water: standard({ color: new THREE.Color("#4d6b6b"), roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.85 }),
  };
  return cached;
}

export interface InteriorMaterials {
  wall: THREE.MeshStandardMaterial;
  wallWarm: THREE.MeshStandardMaterial;
  oak: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
  porcelain: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  linen: THREE.MeshStandardMaterial;
  boucle: THREE.MeshStandardMaterial;
  charcoal: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
  plant: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  mirror: THREE.MeshStandardMaterial;
  rug: THREE.MeshStandardMaterial;
  duvet: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
}

let cachedInterior: InteriorMaterials | null = null;

export function getInteriorMaterials(): InteriorMaterials {
  if (cachedInterior) return cachedInterior;
  const timberMap = timberTexture();
  cachedInterior = {
    wall: standard({ color: new THREE.Color("#efebe1"), roughness: 0.95 }),
    wallWarm: standard({ color: new THREE.Color("#e6dfd2"), roughness: 0.95 }),
    oak: standard({ map: timberMap, color: new THREE.Color("#c39a6f"), roughness: 0.72 }),
    walnut: standard({ color: new THREE.Color("#5b4433"), roughness: 0.7 }),
    marble: standard({ color: new THREE.Color("#e8e3d8"), roughness: 0.28, metalness: 0.05 }),
    porcelain: standard({ color: new THREE.Color("#f4f2ec"), roughness: 0.35 }),
    tile: standard({ color: new THREE.Color("#d9d4c8"), roughness: 0.55 }),
    linen: standard({ color: new THREE.Color("#e2dbcb"), roughness: 0.95 }),
    boucle: standard({ color: new THREE.Color("#d6d0c0"), roughness: 1 }),
    charcoal: standard({ color: new THREE.Color("#33352f"), roughness: 0.8 }),
    steel: standard({ color: new THREE.Color("#9aa0a0"), roughness: 0.35, metalness: 0.8 }),
    ceramic: standard({ color: new THREE.Color("#f0ede5"), roughness: 0.25 }),
    plant: standard({ color: new THREE.Color("#4c6337"), roughness: 0.9, flatShading: true }),
    glass: standard({
      color: new THREE.Color("#b8c8c6"),
      roughness: 0.05,
      metalness: 0.4,
      transparent: true,
      opacity: 0.18,
      envMapIntensity: 1,
    }),
    mirror: standard({ color: new THREE.Color("#cfd8d5"), roughness: 0.03, metalness: 0.95 }),
    rug: standard({ color: new THREE.Color("#cfc6b3"), roughness: 1 }),
    duvet: standard({ color: new THREE.Color("#f0ece1"), roughness: 0.95 }),
    stone: standard({ color: new THREE.Color("#c9c1b0"), roughness: 0.8 }),
  };
  return cachedInterior;
}

export function disposeSharedMaterials(): void {
  if (cached) {
    for (const value of Object.values(cached)) {
      if (Array.isArray(value)) value.forEach((m) => m.dispose());
      else value.dispose();
    }
    cached = null;
  }
  if (cachedInterior) {
    for (const value of Object.values(cachedInterior)) value.dispose();
    cachedInterior = null;
  }
}

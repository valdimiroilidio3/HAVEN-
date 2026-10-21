import * as THREE from "three";
import { asphaltTexture, concreteTexture, grassTexture, gravelTexture, poolTileTexture, stoneTexture, timberTexture } from "./textures";

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
  /** Warmly lit glazing used at night. */
  glassNight: THREE.MeshStandardMaterial;
  waterNight: THREE.MeshStandardMaterial;
  lampGlass: THREE.MeshStandardMaterial;
  poolLight: THREE.MeshStandardMaterial;
  /** Aqua mosaic used inside the pool basin. */
  poolTile: THREE.MeshStandardMaterial;
  /** Car paint variants for the parking bays. */
  carPaint: THREE.MeshStandardMaterial[];
  carGlass: THREE.MeshStandardMaterial;
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
    hedge: standard({ color: new THREE.Color("#4d5e3a"), roughness: 0.86, envMapIntensity: 1.05 }),
    trunk: standard({ color: new THREE.Color("#5d4a37"), roughness: 0.95 }),
    // Softer roughness with a touch of environment response so canopies catch
    // the sun instead of reading as flat matte blobs.
    foliage: [
      standard({ color: new THREE.Color("#5b7742"), roughness: 0.78, metalness: 0.02, flatShading: true, envMapIntensity: 1.2 }),
      standard({ color: new THREE.Color("#6b8749"), roughness: 0.76, metalness: 0.02, flatShading: true, envMapIntensity: 1.2 }),
      standard({ color: new THREE.Color("#7b9552"), roughness: 0.74, metalness: 0.02, flatShading: true, envMapIntensity: 1.25 }),
    ],
    white: standard({ color: new THREE.Color("#f1eee5"), roughness: 0.9 }),
    sand: standard({ color: new THREE.Color("#c7a77a"), roughness: 0.8 }),
    water: standard({
      color: new THREE.Color("#4f9fae"),
      roughness: 0.06,
      metalness: 0.55,
      transparent: true,
      opacity: 0.9,
      envMapIntensity: 1.5,
    }),
    glassNight: standard({
      color: new THREE.Color("#2b2417"),
      emissive: new THREE.Color("#ffbf7a"),
      emissiveIntensity: 0.95,
      roughness: 0.28,
      metalness: 0.35,
      transparent: true,
      opacity: 0.94,
    }),
    waterNight: standard({
      color: new THREE.Color("#12333d"),
      emissive: new THREE.Color("#1d7c93"),
      emissiveIntensity: 0.55,
      roughness: 0.08,
      metalness: 0.6,
      transparent: true,
      opacity: 0.92,
      envMapIntensity: 1.1,
    }),
    lampGlass: standard({
      color: new THREE.Color("#fff3d6"),
      emissive: new THREE.Color("#ffc987"),
      emissiveIntensity: 0.25,
      roughness: 0.35,
    }),
    poolLight: standard({
      color: new THREE.Color("#bff0ff"),
      emissive: new THREE.Color("#7fdcff"),
      emissiveIntensity: 2.4,
      toneMapped: false,
    }),
    poolTile: standard({
      map: poolTileTexture(),
      color: new THREE.Color("#b6e3e9"),
      roughness: 0.26,
      metalness: 0.06,
      envMapIntensity: 1.15,
    }),
    carPaint: [
      standard({ color: new THREE.Color("#ecebe6"), roughness: 0.26, metalness: 0.42, envMapIntensity: 1.3 }),
      standard({ color: new THREE.Color("#2b3034"), roughness: 0.24, metalness: 0.5, envMapIntensity: 1.35 }),
      standard({ color: new THREE.Color("#1f3448"), roughness: 0.26, metalness: 0.45, envMapIntensity: 1.3 }),
    ],
    carGlass: standard({
      color: new THREE.Color("#0e1418"),
      roughness: 0.06,
      metalness: 0.72,
      transparent: true,
      opacity: 0.82,
    }),
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

import * as THREE from "three";

/**
 * Procedural canvas textures. Everything is generated locally: no external
 * HDRIs, texture CDNs or network requests. Textures are cached module-wide and
 * shared by every material instance.
 */

const cache = new Map<string, THREE.Texture>();

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement, repeat: number, srgb = true): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function noise(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number, colors: string[], seed = 1) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!;
    ctx.globalAlpha = alpha * (0.35 + rand() * 0.65);
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.4 + rand() * 2.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function grassTexture(): THREE.Texture | null {
  const cached = cache.get("grass");
  if (cached) return cached;
  const made = makeCanvas(512);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = "#6e7a55";
  ctx.fillRect(0, 0, 512, 512);
  noise(ctx, 512, 5200, 0.5, ["#5f6c49", "#7b8861", "#66744e", "#83906a", "#586647"], 3);
  // faint mowing stripes
  for (let i = 0; i < 512; i += 64) {
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(i, 0, 32, 512);
  }
  const texture = finish(canvas, 26);
  cache.set("grass", texture);
  return texture;
}

export function asphaltTexture(): THREE.Texture | null {
  const cached = cache.get("asphalt");
  if (cached) return cached;
  const made = makeCanvas(256);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = "#4b4b47";
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 3600, 0.45, ["#3f3f3b", "#575752", "#61615c", "#454541"], 11);
  const texture = finish(canvas, 12);
  cache.set("asphalt", texture);
  return texture;
}

export function stoneTexture(): THREE.Texture | null {
  const cached = cache.get("stone");
  if (cached) return cached;
  const made = makeCanvas(512);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = "#8f8574";
  ctx.fillRect(0, 0, 512, 512);
  let s = 17;
  const rand = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  const palette = ["#b9ad98", "#a99d88", "#c4b8a3", "#9d9280", "#cbc0ad", "#b0a48f", "#8e8573"];
  let y = 0;
  while (y < 512) {
    const rowH = 34 + rand() * 26;
    let x = -rand() * 40;
    while (x < 512) {
      const w = 52 + rand() * 84;
      ctx.fillStyle = palette[Math.floor(rand() * palette.length)]!;
      ctx.fillRect(x + 2, y + 2, w - 4, rowH - 4);
      ctx.strokeStyle = "rgba(70,63,52,0.35)";
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 2, y + 2, w - 4, rowH - 4);
      // shading
      const grad = ctx.createLinearGradient(x, y, x, y + rowH);
      grad.addColorStop(0, "rgba(255,255,255,0.18)");
      grad.addColorStop(1, "rgba(45,40,32,0.16)");
      ctx.fillStyle = grad;
      ctx.fillRect(x + 2, y + 2, w - 4, rowH - 4);
      x += w;
    }
    y += rowH;
  }
  noise(ctx, 512, 2200, 0.18, ["#6f6656", "#d3c8b3"], 5);
  const texture = finish(canvas, 2);
  cache.set("stone", texture);
  return texture;
}

export function timberTexture(): THREE.Texture | null {
  const cached = cache.get("timber");
  if (cached) return cached;
  const made = makeCanvas(512);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = "#7a5333";
  ctx.fillRect(0, 0, 512, 512);
  const plankWidth = 36;
  let s = 29;
  const rand = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  for (let x = 0; x < 512; x += plankWidth) {
    const shade = 0.85 + rand() * 0.3;
    ctx.fillStyle = `rgb(${Math.round(118 * shade)}, ${Math.round(80 * shade)}, ${Math.round(48 * shade)})`;
    ctx.fillRect(x, 0, plankWidth - 2, 512);
    // grain
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = `rgba(50,32,18,${0.08 + rand() * 0.16})`;
      ctx.lineWidth = 0.7 + rand();
      const gx = x + 2 + rand() * (plankWidth - 5);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + rand() * 5 - 2, 170, gx + rand() * 5 - 2, 340, gx + rand() * 4 - 2, 512);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(30,18,10,0.35)";
    ctx.fillRect(x + plankWidth - 2, 0, 2, 512);
  }
  const texture = finish(canvas, 2);
  cache.set("timber", texture);
  return texture;
}

export function gravelTexture(): THREE.Texture | null {
  const cached = cache.get("gravel");
  if (cached) return cached;
  const made = makeCanvas(256);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = "#b7ae9c";
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 8000, 0.7, ["#9a913f", "#cdc5b2", "#8c8474", "#d8d1c1", "#6f685b"], 13);
  const texture = finish(canvas, 8);
  cache.set("gravel", texture);
  return texture;
}

export function concreteTexture(): THREE.Texture | null {
  const cached = cache.get("concrete");
  if (cached) return cached;
  const made = makeCanvas(256);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = "#cfc9bc";
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 2600, 0.18, ["#bdb7aa", "#ded9cd", "#b0aa9d"], 21);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = "rgba(120,114,102,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 30 + i * 40);
    ctx.lineTo(256, 30 + i * 40);
    ctx.stroke();
  }
  const texture = finish(canvas, 3);
  cache.set("concrete", texture);
  return texture;
}

/** Small aqua mosaic for pool basins: reads as tile under the water line. */
export function poolTileTexture(): THREE.Texture | null {
  const cached = cache.get("poolTile");
  if (cached) return cached;
  const made = makeCanvas(256);
  if (!made) return null;
  const { canvas, ctx } = made;
  ctx.fillStyle = "#6fb9c4";
  ctx.fillRect(0, 0, 256, 256);
  const palette = ["#8fd2da", "#7cc4ce", "#a2dde2", "#74bcc7", "#93d5db", "#82c9d2"];
  let s = 91;
  const rand = () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
  const tile = 32;
  for (let y = 0; y < 256; y += tile) {
    for (let x = 0; x < 256; x += tile) {
      ctx.fillStyle = palette[Math.floor(rand() * palette.length)]!;
      ctx.fillRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
      const grad = ctx.createLinearGradient(x, y, x, y + tile);
      grad.addColorStop(0, "rgba(255,255,255,0.16)");
      grad.addColorStop(1, "rgba(23,73,84,0.14)");
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
    }
  }
  noise(ctx, 256, 900, 0.12, ["#ffffff", "#3d8a96"], 13);
  const texture = finish(canvas, 6);
  cache.set("poolTile", texture);
  return texture;
}

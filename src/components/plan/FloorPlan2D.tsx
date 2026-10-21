import * as React from "react";
import { getFloorPlan, type FurniturePiece, type FloorPlan, type PlanRoom } from "@/lib/domain/floorplans";
import { deriveOpenings, deriveWalls, openingExtents } from "@/lib/domain/plan-geometry";
import type { Typology } from "@/lib/domain/types";

/**
 * Architectural-style floor plan rendered with SVG.
 * Server-renderable (no hooks, no browser APIs).
 */

const FLOOR_FILL: Record<string, string> = {
  living: "#ede5d6",
  dining: "#ede5d6",
  kitchen: "#e4ded0",
  bedroom: "#e9e1d2",
  bathroom: "#dfe4e1",
  wc: "#dfe4e1",
  hall: "#e6dfd1",
  corridor: "#e6dfd1",
  laundry: "#e2ded4",
  storage: "#e2ded4",
  study: "#eae2d3",
  dressing: "#e8e0d2",
};

function roomFill(room: PlanRoom): string {
  return FLOOR_FILL[room.kind] ?? "#e8e2d6";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function FurnitureGlyph({ piece }: { piece: FurniturePiece }) {
  const { width: w, depth: d } = piece;
  const stroke = "#5b5a52";
  const sw = 0.045;
  const fill = "#f6f2e9";
  const transform = `translate(${round(piece.x)} ${round(piece.z)}) rotate(${piece.rotation})`;
  const rect = (x: number, z: number, rw: number, rd: number, radius = 0.06) => (
    <rect x={x} y={z} width={rw} height={rd} rx={radius} fill={fill} stroke={stroke} strokeWidth={sw} />
  );

  switch (piece.type) {
    case "bed":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.08} fill="#f2ecdf" stroke={stroke} strokeWidth={sw} />
          <rect x={-w / 2 + 0.14} y={-d / 2 + 0.12} width={w - 0.28} height={0.45} rx={0.1} fill="#fbf7ee" stroke={stroke} strokeWidth={sw} />
          <line x1={-w / 2 + 0.1} y1={-d / 2 + 0.72} x2={w / 2 - 0.1} y2={-d / 2 + 0.72} stroke={stroke} strokeWidth={sw} />
          <rect x={-w / 2} y={d / 2 - 0.55} width={w} height={0.55} rx={0.05} fill="#e3dac9" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "sofa":
    case "sectional":
      return (
        <g transform={transform}>
          {rect(-w / 2, -d / 2, w, d, 0.12)}
          <rect x={-w / 2 + 0.08} y={-d / 2 + 0.08} width={w - 0.16} height={0.2} rx={0.05} fill="#e6ddcb" stroke={stroke} strokeWidth={sw} />
          <line x1={-w / 6} y1={-d / 2 + 0.3} x2={-w / 6} y2={d / 2 - 0.1} stroke={stroke} strokeWidth={sw} opacity={0.5} />
          <line x1={w / 6} y1={-d / 2 + 0.3} x2={w / 6} y2={d / 2 - 0.1} stroke={stroke} strokeWidth={sw} opacity={0.5} />
        </g>
      );
    case "armchair":
      return (
        <g transform={transform}>
          {rect(-w / 2, -d / 2, w, d, 0.12)}
          <rect x={-w / 2 + 0.08} y={-d / 2 + 0.08} width={w - 0.16} height={0.18} rx={0.04} fill="#e6ddcb" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "coffeeTable":
    case "diningTable":
    case "outdoorTable":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.08} fill="#f2ece0" stroke={stroke} strokeWidth={sw} />
          <line x1={-w / 2 + 0.1} y1={0} x2={w / 2 - 0.1} y2={0} stroke={stroke} strokeWidth={sw} opacity={0.35} />
        </g>
      );
    case "diningChairs": {
      const count = 6;
      return (
        <g transform={transform}>
          {Array.from({ length: count }, (_, i) => {
            const side = i < 3 ? -1 : 1;
            const idx = i % 3;
            const x = (-w / 2 + (w / 3) * (idx + 0.5)) * 0.92;
            const z = (side * (d / 2 + 0.18)) / 2 + side * 0.16;
            return <rect key={i} x={x - 0.2} y={z - 0.2} width={0.4} height={0.4} rx={0.05} fill={fill} stroke={stroke} strokeWidth={sw} />;
          })}
        </g>
      );
    }
    case "kitchenRun":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} fill="#e7e1d4" stroke={stroke} strokeWidth={sw} />
          <circle cx={-w / 4} cy={0} r={Math.min(0.19, d / 3)} fill="none" stroke={stroke} strokeWidth={sw} />
          <rect x={w / 6} y={-d / 4} width={0.3} height={d / 2} fill="none" stroke={stroke} strokeWidth={sw} />
          <rect x={w / 2 - 0.5} y={-d / 4} width={0.28} height={d / 2} fill="none" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "kitchenIsland":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.05} fill="#efe8da" stroke={stroke} strokeWidth={sw} />
          <rect x={-w / 2 + 0.25} y={-d / 4} width={0.4} height={d / 2} fill="none" stroke={stroke} strokeWidth={sw} />
          <circle cx={w / 4} cy={0} r={Math.min(0.16, d / 3)} fill="none" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "kitchenTower":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#e3ddd0" stroke={stroke} strokeWidth={sw} />
          <line x1={-w / 2} y1={-d / 2} x2={w / 2} y2={d / 2} stroke={stroke} strokeWidth={sw} opacity={0.5} />
          <line x1={w / 2} y1={-d / 2} x2={-w / 2} y2={d / 2} stroke={stroke} strokeWidth={sw} opacity={0.5} />
        </g>
      );
    case "nightstand":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} fill={fill} stroke={stroke} strokeWidth={sw} />
          <circle cx={0} cy={0} r={0.05} fill="none" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "wardrobe":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#e8e1d3" stroke={stroke} strokeWidth={sw} />
          {Array.from({ length: Math.max(2, Math.round(w / 0.7)) }, (_, i) => {
            const doors = Math.max(2, Math.round(w / 0.7));
            const x = -w / 2 + (w / doors) * (i + 1);
            return <line key={i} x1={x} y1={-d / 2} x2={x} y2={d / 2} stroke={stroke} strokeWidth={sw} opacity={0.55} />;
          })}
        </g>
      );
    case "desk":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} fill={fill} stroke={stroke} strokeWidth={sw} />
          <rect x={-0.25} y={d / 2 + 0.1} width={0.5} height={0.45} rx={0.05} fill={fill} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "dresser":
    case "sideboard":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} fill={fill} stroke={stroke} strokeWidth={sw} />
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={stroke} strokeWidth={sw} opacity={0.5} />
        </g>
      );
    case "bathtub":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={Math.min(d / 2, 0.35)} fill="#f2f5f3" stroke={stroke} strokeWidth={sw} />
          <rect x={-w / 2 + 0.12} y={-d / 2 + 0.12} width={w - 0.24} height={d - 0.24} rx={Math.min(d / 2, 0.28)} fill="none" stroke={stroke} strokeWidth={sw} opacity={0.6} />
          <circle cx={w / 2 - 0.3} cy={0} r={0.05} fill={stroke} />
        </g>
      );
    case "shower":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#e7eeeb" stroke={stroke} strokeWidth={sw} />
          <line x1={-w / 2} y1={-d / 2} x2={w / 2} y2={d / 2} stroke={stroke} strokeWidth={sw} opacity={0.4} />
          <line x1={w / 2} y1={-d / 2} x2={-w / 2} y2={d / 2} stroke={stroke} strokeWidth={sw} opacity={0.4} />
          <circle cx={0} cy={0} r={0.07} fill="none" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "toilet":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d * 0.38} rx={0.04} fill={fill} stroke={stroke} strokeWidth={sw} />
          <ellipse cx={0} cy={d * 0.08} rx={w / 2} ry={d * 0.36} fill="#f6f4ee" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "vanity":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} fill={fill} stroke={stroke} strokeWidth={sw} />
          <ellipse cx={0} cy={0} rx={Math.min(w / 3, 0.3)} ry={Math.min(d / 3, 0.2)} fill="none" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "washer":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.05} fill={fill} stroke={stroke} strokeWidth={sw} />
          <circle cx={0} cy={0} r={Math.min(w, d) / 3} fill="none" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "shelf":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#eae3d5" stroke={stroke} strokeWidth={sw} />
          {Array.from({ length: Math.max(2, Math.round(w / 0.6)) }, (_, i) => {
            const shelves = Math.max(2, Math.round(w / 0.6));
            const x = -w / 2 + (w / shelves) * (i + 1);
            return <line key={i} x1={x} y1={-d / 2} x2={x} y2={d / 2} stroke={stroke} strokeWidth={sw} opacity={0.4} />;
          })}
        </g>
      );
    case "plant":
      return (
        <g transform={transform}>
          <circle cx={0} cy={0} r={Math.min(w, d) / 2} fill="#dbe2d2" stroke="#5f7150" strokeWidth={sw} />
          <circle cx={0} cy={0} r={Math.min(w, d) / 4} fill="none" stroke="#5f7150" strokeWidth={sw} opacity={0.7} />
        </g>
      );
    case "floorLamp":
      return (
        <g transform={transform}>
          <circle cx={0} cy={0} r={Math.min(w, d) / 2} fill="none" stroke={stroke} strokeWidth={sw} />
          <circle cx={0} cy={0} r={0.05} fill={stroke} />
        </g>
      );
    case "tvConsole":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.03} fill="#4b4a44" stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "rug":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.02} fill="none" stroke="#b4a98f" strokeWidth={0.03} strokeDasharray="0.12 0.1" opacity={0.75} />
        </g>
      );
    case "bench":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.05} fill={fill} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    case "lounger":
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={0.18} fill="#efe9dc" stroke={stroke} strokeWidth={sw} />
          <line x1={-w / 2} y1={-d / 2 + d * 0.3} x2={w / 2} y2={-d / 2 + d * 0.3} stroke={stroke} strokeWidth={sw} opacity={0.6} />
        </g>
      );
    default:
      return (
        <g transform={transform}>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />
        </g>
      );
  }
}

export interface FloorPlan2DProps {
  typology?: Typology;
  plan?: FloorPlan;
  showFurniture?: boolean;
  showDimensions?: boolean;
  className?: string;
  title?: string;
}

export function FloorPlan2D({
  typology = "T3",
  plan: planProp,
  showFurniture = true,
  showDimensions = true,
  className,
  title,
}: FloorPlan2DProps) {
  const plan = planProp ?? getFloorPlan(typology);
  const walls = React.useMemo(() => deriveWalls(plan), [plan]);
  const openings = React.useMemo(() => deriveOpenings(plan), [plan]);

  const allX = [
    ...plan.rooms.flatMap((r) => [r.x1, r.x2]),
    ...plan.terraces.flatMap((t) => [t.x1, t.x2]),
  ];
  const allZ = [
    ...plan.rooms.flatMap((r) => [r.z1, r.z2]),
    ...plan.terraces.flatMap((t) => [t.z1, t.z2]),
  ];
  const pad = 2.2;
  const minX = Math.min(...allX) - pad;
  const maxX = Math.max(...allX) + pad;
  const minZ = Math.min(...allZ) - pad;
  const maxZ = Math.max(...allZ) + pad;
  const width = maxX - minX;
  const height = maxZ - minZ;
  const fontScale = Math.min(width, height) / 60;

  return (
    <svg
      viewBox={`${minX} ${minZ} ${width} ${height}`}
      className={className}
      role="img"
      aria-label={title ? `Floor plan — ${title}` : `${plan.typology} prototype floor plan`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <title>{title ?? `${plan.typology} floor plan (prototype)`}</title>
      <rect x={minX} y={minZ} width={width} height={height} fill="#f8f6ef" />

      {/* terraces */}
      {plan.terraces.map((terrace) => (
        <g key={terrace.id}>
          <rect
            x={terrace.x1}
            y={terrace.z1}
            width={terrace.x2 - terrace.x1}
            height={terrace.z2 - terrace.z1}
            fill={terrace.deck === "timber" ? "#e4d3b6" : "#e9e5db"}
            stroke="#c9bda7"
            strokeWidth={0.04}
          />
          {Array.from({ length: Math.max(2, Math.round((terrace.x2 - terrace.x1) / 0.4)) }, (_, i) => {
            const planks = Math.max(2, Math.round((terrace.x2 - terrace.x1) / 0.4));
            const x = terrace.x1 + ((terrace.x2 - terrace.x1) / planks) * (i + 1);
            return (
              <line
                key={i}
                x1={x}
                y1={terrace.z1}
                x2={x}
                y2={terrace.z2}
                stroke="#c9b18a"
                strokeWidth={0.025}
                opacity={terrace.deck === "timber" ? 0.8 : 0.3}
              />
            );
          })}
        </g>
      ))}

      {/* room floors */}
      {plan.rooms.map((room) => (
        <rect
          key={`floor-${room.id}`}
          x={room.x1}
          y={room.z1}
          width={room.x2 - room.x1}
          height={room.z2 - room.z1}
          fill={roomFill(room)}
          stroke="none"
        />
      ))}

      {showFurniture && plan.furniture.map((piece) => <FurnitureGlyph key={piece.id} piece={piece} />)}

      {/* walls */}
      {walls.flatMap((wall) =>
        wall.components.map((c, i) => {
          const span = c.end - c.start;
          const h = c.top - c.bottom;
          if (span <= 0.01 || h <= 0.01) return null;
          const x = wall.orientation === "h" ? c.start : wall.at - wall.thickness / 2;
          const y = wall.orientation === "h" ? wall.at - wall.thickness / 2 : c.start;
          const w = wall.orientation === "h" ? span : wall.thickness;
          const ht = wall.orientation === "h" ? wall.thickness : span;
          return (
            <rect
              key={`${wall.id}-${i}`}
              x={x}
              y={y}
              width={w}
              height={ht}
              fill={wall.exterior ? "#23241f" : "#3f4038"}
              opacity={c.bottom > 0 ? 0.35 : 1}
            />
          );
        }),
      )}

      {/* openings: glazing lines + door swings */}
      {openings.map((opening) => {
        const isH = opening.orientation === "h";
        const stroke = opening.glass ? "#7d9aa0" : "#a89b86";
        if (isH) {
          return (
            <g key={opening.id}>
              {opening.glass && (
                <line
                  x1={opening.start}
                  y1={opening.at}
                  x2={opening.end}
                  y2={opening.at}
                  stroke={stroke}
                  strokeWidth={0.06}
                />
              )}
              {opening.type === "door" && (
                <>
                  <line x1={opening.start} y1={opening.at} x2={opening.start} y2={opening.at + (opening.at > 0 ? -0.8 : 0.8)} stroke={stroke} strokeWidth={0.035} />
                  <path
                    d={`M ${opening.end} ${opening.at} A ${opening.end - opening.start} ${opening.end - opening.start} 0 0 ${opening.at > 0 ? 0 : 1} ${opening.start} ${opening.at + (opening.at > 0 ? -0.8 : 0.8)}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={0.025}
                    opacity={0.7}
                  />
                </>
              )}
            </g>
          );
        }
        return (
          <g key={opening.id}>
            {opening.glass && (
              <line x1={opening.at} y1={opening.start} x2={opening.at} y2={opening.end} stroke={stroke} strokeWidth={0.06} />
            )}
            {opening.type === "door" && (
              <>
                <line x1={opening.at} y1={opening.start} x2={opening.at + (opening.at > 0 ? -0.8 : 0.8)} y2={opening.start} stroke={stroke} strokeWidth={0.035} />
                <path
                  d={`M ${opening.at} ${opening.end} A ${opening.end - opening.start} ${opening.end - opening.start} 0 0 ${opening.at > 0 ? 1 : 0} ${opening.at + (opening.at > 0 ? -0.8 : 0.8)} ${opening.start}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={0.025}
                  opacity={0.7}
                />
              </>
            )}
          </g>
        );
      })}

      {/* room labels */}
      {plan.rooms
        .filter((room) => (room.x2 - room.x1) * (room.z2 - room.z1) > 2.2)
        .map((room) => {
          const cx = (room.x1 + room.x2) / 2;
          const cz = (room.z1 + room.z2) / 2;
          const area = Math.round((room.x2 - room.x1) * (room.z2 - room.z1));
          return (
            <g key={`label-${room.id}`} style={{ pointerEvents: "none" }}>
              <text
                x={cx}
                y={cz - fontScale * 0.4}
                textAnchor="middle"
                fontSize={fontScale * 1.25}
                fill="#4f4e47"
                fontFamily="Inter, sans-serif"
                letterSpacing={0.5}
              >
                {room.name.toUpperCase()}
              </text>
              <text x={cx} y={cz + fontScale * 1.5} textAnchor="middle" fontSize={fontScale * 1.15} fill="#8d8a7e" fontFamily="Inter, sans-serif">
                {area} m²
              </text>
            </g>
          );
        })}

      {/* dimensions */}
      {showDimensions && (
        <g stroke="#9a978b" fill="#9a978b" fontFamily="Inter, sans-serif">
          <line x1={minX + 1.2} y1={maxZ - 0.7} x2={maxX - 1.2} y2={maxZ - 0.7} strokeWidth={0.03} />
          <line x1={minX + 1.2} y1={maxZ - 1.0} x2={minX + 1.2} y2={maxZ - 0.4} strokeWidth={0.03} />
          <line x1={maxX - 1.2} y1={maxZ - 1.0} x2={maxX - 1.2} y2={maxZ - 0.4} strokeWidth={0.03} />
          <text x={(minX + maxX) / 2} y={maxZ - 1.1} textAnchor="middle" fontSize={fontScale * 1.1} stroke="none">
            {plan.widthM.toFixed(1)} m
          </text>
        </g>
      )}

      {/* north arrow + scale */}
      <g transform={`translate(${maxX - 1.6} ${minZ + 2.6})`} opacity={0.8}>
        <line x1={0} y1={1.4} x2={0} y2={0} stroke="#6c6a5f" strokeWidth={0.05} />
        <path d="M 0 0 L -0.5 0.7 L 0 0.55 L 0.5 0.7 Z" fill="#6c6a5f" />
        <text x={0} y={2.1} textAnchor="middle" fontSize={fontScale * 1.1} fill="#6c6a5f" fontFamily="Inter, sans-serif">
          N
        </text>
      </g>
      <g transform={`translate(${minX + 1.4} ${minZ + 1.6})`} opacity={0.85}>
        <rect x={0} y={0} width={2} height={0.14} fill="#4f4e47" />
        <rect x={2} y={0} width={2} height={0.14} fill="#f8f6ef" stroke="#4f4e47" strokeWidth={0.02} />
        <text x={0} y={-0.35} fontSize={fontScale} fill="#6c6a5f" fontFamily="Inter, sans-serif">
          0
        </text>
        <text x={3.8} y={-0.35} fontSize={fontScale} fill="#6c6a5f" fontFamily="Inter, sans-serif">
          4 m
        </text>
      </g>
    </svg>
  );
}

export function PlanLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-ink-400">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 bg-[#23241f]" /> Structural wall
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[2px] w-4 bg-[#7d9aa0]" /> Glazing
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-[2px] w-4 bg-[#a89b86]" /> Door
      </span>
      <span>Prototype plan · not for construction</span>
    </div>
  );
}

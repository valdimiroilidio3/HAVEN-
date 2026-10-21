"use client";

import * as React from "react";
import { Sky, Stars } from "@react-three/drei";
import { getMaterials } from "./materials";
import { HouseExterior } from "./HouseExterior";
import { SportsPark } from "./SportsPark";
import { Roads, Driveways } from "./site/Roads";
import { BedBorders, Flowers, Shrubs, Trees } from "./site/Landscape";
import { Lagoon } from "./site/Lagoon";
import { Boundary } from "./site/Boundary";
import { Exposure, Lighting, Moon, StreetLamps, SUN_POSITION, THEMES, type TimeOfDay } from "./site/environment";
import { Plot } from "./site/Plot";
import type { SceneEntry } from "./site/types";
import { garagePlan, plotFootprints, plotRearDepth, poolFor, SITE } from "@/lib/3d/site";

export type { SceneEntry } from "./site/types";
export type { TimeOfDay } from "./site/environment";

/**
 * The masterplan, composed. This file owns no geometry and no coordinates of
 * its own: every object is a component fed from `lib/3d/site` (placement) and
 * `lib/3d/parts` (plot geometry), so the spatial validator can describe the
 * scene the viewer is actually looking at.
 *
 *   site/Roads        carriageways and driveways
 *   site/Landscape    planting beds, trees, shrubs, flowers
 *   site/Plot         walls, carport, cars, pool, furniture (merged meshes)
 *   site/Lagoon       lagoon deck, water, pavilion, sun loungers
 *   site/Boundary     perimeter wall and gate
 *   site/environment  day/night themes, sun rig, street lamps
 */

export interface SiteSceneProps {
  entries: SceneEntry[];
  selectedId: string | null;
  hoveredId: string | null;
  visibleIds: Set<string>;
  lowQuality: boolean;
  /** Day/night presentation. Defaults to day. */
  timeOfDay?: TimeOfDay;
  assetIndex?: Record<string, unknown>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}


export function SiteScene({
  entries,
  selectedId,
  hoveredId,
  visibleIds,
  lowQuality,
  timeOfDay = "day",
  onSelect,
  onHover,
}: SiteSceneProps) {
  const m = getMaterials();
  const theme = THEMES[timeOfDay];
  const night = timeOfDay === "night";

  // One placement pass. Gardens are clipped to the perimeter, so each house gets
  // its own rear depth and keeps a pool only when the water and deck fit.
  const plots = React.useMemo(
    () =>
      entries.map((entry) => {
        const rearDepth = plotRearDepth(entry.position, entry.rotationY, entry.property.typology);
        const { garage } = garagePlan(entry.position, entry.rotationY, entry.property.typology);
        return {
          rearDepth,
          pool: poolFor(entry.property.code, entry.property.typology, rearDepth),
          garage,
        };
      }),
    [entries],
  );

  // Private plots exclude planting and street lighting. Same numbers the
  // validator uses, so "nothing grows inside a plot" is true by construction.
  const footprints = React.useMemo(
    () =>
      plotFootprints(
        entries.map((entry) => ({
          position: entry.position,
          rotationY: entry.rotationY,
          typology: entry.property.typology,
        })),
      ),
    [entries],
  );

  return (
    <>
      <color attach="background" args={[theme.background]} />
      <fog attach="fog" args={theme.fog} />
      <Exposure value={theme.exposure} />
      {night ? (
        <>
          <Stars radius={260} depth={70} count={lowQuality ? 900 : 2200} factor={4.5} saturation={0} fade speed={0.4} />
          <Moon />
        </>
      ) : (
        <Sky distance={20000} sunPosition={SUN_POSITION} turbidity={5} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.82} />
      )}
      <Lighting lowQuality={lowQuality} time={timeOfDay} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[SITE.center.x, 0, SITE.center.z]} material={m.grass} receiveShadow>
        <planeGeometry args={[300, 280, 1, 1]} />
      </mesh>

      <Roads />
      <Driveways entries={entries} plots={plots} />
      <BedBorders exclude={footprints} lowQuality={lowQuality} />
      <Trees entries={entries} plots={plots} exclude={footprints} lowQuality={lowQuality} night={night} />
      <Shrubs entries={entries} exclude={footprints} lowQuality={lowQuality} />
      <Flowers exclude={footprints} lowQuality={lowQuality} />
      <StreetLamps night={night} lowQuality={lowQuality} exclude={footprints} />
      <Lagoon night={night} lowQuality={lowQuality} />
      <SportsPark night={night} lowQuality={lowQuality} />
      <Boundary />

      {entries.map((entry, index) => (
        <Plot
          key={`plot-${entry.property.id}`}
          entry={entry}
          pool={plots[index]?.pool ?? null}
          garage={plots[index]?.garage ?? null}
          rearDepth={plots[index]?.rearDepth ?? 11}
          night={night}
          lowQuality={lowQuality}
        />
      ))}

      {entries.map((entry) => {
        const ghosted = !visibleIds.has(entry.property.id);
        return (
          <HouseExterior
            key={entry.property.id}
            property={entry.property}
            position={entry.position}
            rotationY={entry.rotationY}
            selected={selectedId === entry.property.id}
            hovered={hoveredId === entry.property.id}
            ghosted={ghosted}
            lowQuality={lowQuality}
            night={night}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </>
  );
}

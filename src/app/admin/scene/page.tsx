import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Gauge, Ruler } from "lucide-react";
import { getDb } from "@/lib/db";
import { getSceneAdmin, listProperties } from "@/lib/db/repositories";
import { PageHeader, AdminCard } from "@/components/admin/PageHeader";
import { SPATIAL_RULES, validateScene, type Finding, type Severity } from "@/lib/3d/validate";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Scene health" };

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-[#8c3b32]/40 bg-[#8c3b32]/10 text-[#7a322a]",
  high: "border-[#a2603a]/40 bg-[#a2603a]/10 text-[#8a4f2f]",
  medium: "border-[#96784f]/40 bg-[#96784f]/10 text-[#7d6340]",
  low: "border-ink-300/60 bg-ink-50 text-ink-600",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

export default async function AdminSceneHealthPage() {
  const db = await getDb();
  const [properties, scene] = await Promise.all([listProperties(db, { includeArchived: true, pageSize: 200 }), getSceneAdmin(db)]);

  const positions = new Map(scene.positions.map((position) => [position.propertyId, position]));
  // Audit the published scene: that is what a visitor actually walks through.
  const entries = properties.rows.flatMap((property) => {
    const position = positions.get(property.id);
    if (!position) return [];
    return [
      {
        property: { code: property.code, typology: property.typology },
        position: { x: position.publishedX, z: position.publishedZ },
        rotationY: position.publishedRotationY,
      },
    ];
  });

  const report = validateScene({ entries });
  const blocking = report.counts.critical + report.counts.high;
  const total = report.findings.length;

  const cards = [
    {
      label: "Critical + high",
      value: blocking,
      hint: blocking === 0 ? "No blocking defect" : "Fix before publishing",
      tone: blocking > 0 ? "warn" : "ok",
    },
    { label: "Medium", value: report.counts.medium, hint: "Composition issues", tone: report.counts.medium > 0 ? "warn" : "ok" },
    { label: "Low", value: report.counts.low, hint: "Presentation polish", tone: "neutral" },
    { label: "Rules checked", value: SPATIAL_RULES.length, hint: `${report.checked.parts} parts inspected`, tone: "neutral" },
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="3D masterplan"
        title="Scene health"
        description="The published masterplan, checked against the placement rules before anyone walks it. Every finding names the object, its footprint and the rule that fixes it."
        actions={
          <Link
            href="/admin/3d-editor"
            className="inline-flex h-9 items-center gap-2 rounded-sm bg-obsidian px-4 text-xs font-medium text-porcelain transition hover:bg-ink-800"
          >
            Open 3D editor <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-ink-200/70 bg-porcelain px-4 py-3">
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-ink-400">{card.label}</p>
            <p className="mt-2 flex items-baseline gap-2 font-display text-2xl text-ink-900">
              {card.value}
              {card.tone === "ok" && <CheckCircle2 className="h-4 w-4 text-[#6f7a62]" aria-hidden />}
              {card.tone === "warn" && <AlertTriangle className="h-4 w-4 text-[#a2603a]" aria-hidden />}
            </p>
            <p className="mt-1 text-[0.7rem] text-ink-500">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AdminCard
          title="Findings"
          description={
            total === 0
              ? "The published scene satisfies every placement rule."
              : `${total} finding${total === 1 ? "" : "s"} on ${report.checked.plots} plots. Corrections are phrased as rules, so they survive the next layout change.`
          }
        >
          {total === 0 ? (
            <div className="flex items-start gap-3 rounded-sm border border-[#6f7a62]/30 bg-[#6f7a62]/5 px-4 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#6f7a62]" aria-hidden />
              <p className="text-[0.8rem] text-ink-700">
                No collisions, no planting inside a house or a pool, no plot through a neighbour, no driveway without access.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-200/70">
              {report.findings.map((finding) => (
                <FindingRow key={`${finding.objectId}-${finding.message}`} finding={finding} />
              ))}
            </ul>
          )}
        </AdminCard>

        <div className="space-y-6">
          <AdminCard title="Scene budget" description="Counted from scene data, not profiled in a browser.">
            <dl className="space-y-2 text-[0.78rem]">
              <Row label="Houses" value={report.checked.houses} />
              <Row label="Plots" value={report.checked.plots} />
              <Row label="Pools" value={report.checked.pools} />
              <Row label="Carports" value={report.checked.carports} />
              <Row label="Plot parts" value={report.checked.parts} />
              <Row label="Lagoon parts" value={report.checked.lagoonParts} />
              <Row label="Lagoon draw calls" value={report.checked.lagoonDrawCalls} />
              <Row label="Plot draw calls" value={report.checked.plotDrawCalls} />
              <Row label="Plot triangles" value={report.checked.plotTriangles} />
              <Row label="Trees" value={report.checked.trees} />
              <Row label="Flowers" value={report.checked.flowers} />
            </dl>
            <p className="mt-3 flex items-center gap-2 text-[0.7rem] text-ink-500">
              <Gauge className="h-3.5 w-3.5" aria-hidden />
              {report.checked.plots > 0
                ? `${(report.checked.plotDrawCalls / report.checked.plots).toFixed(1)} draw calls per plot · lagoon in ${report.checked.lagoonDrawCalls}`
                : "No plot placed yet"}
            </p>
          </AdminCard>

          <AdminCard
            title="Rules enforced"
            description={
              scene.lastPublishedAt
                ? `Last published ${formatDateTime(scene.lastPublishedAt)}${scene.lastPublishedBy ? ` by ${scene.lastPublishedBy}` : ""}.`
                : "The scene has never been published from the editor."
            }
          >
            <ol className="space-y-2 text-[0.75rem] leading-relaxed text-ink-600">
              {SPATIAL_RULES.map((rule, index) => (
                <li key={rule} className="flex gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.6rem] text-ink-500">
                    {index + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ol>
          </AdminCard>
        </div>
      </div>
    </>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-wide", SEVERITY_STYLE[finding.severity])}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <code className="text-[0.72rem] text-ink-800">{finding.objectId}</code>
        <span className="text-[0.62rem] uppercase tracking-[0.14em] text-ink-400">{finding.category}</span>
        {finding.confirmed && (
          <span className="inline-flex items-center gap-1 text-[0.62rem] text-ink-400">
            <Ruler className="h-3 w-3" aria-hidden /> geometry
          </span>
        )}
      </div>
      <p className="mt-1 text-[0.8rem] text-ink-700">{finding.message}</p>
      {finding.footprint && (
        <p className="mt-0.5 text-[0.7rem] text-ink-400">
          at ({finding.footprint.x.toFixed(1)}, {finding.footprint.z.toFixed(1)}) · {finding.footprint.width.toFixed(1)} × {finding.footprint.depth.toFixed(1)} m
        </p>
      )}
      <p className="mt-1 text-[0.74rem] text-ink-500">{finding.suggestion}</p>
    </li>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-1 last:border-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-800">{value.toLocaleString("pt-PT")}</dd>
    </div>
  );
}

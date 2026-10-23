/**
 * Spatial audit of the masterplan.
 *
 *   npx tsx scripts/scene-audit.ts [--strict]
 *
 * Prints every finding produced by `lib/3d/validate.ts` (object id, category,
 * severity, footprint, correction). `--strict` exits non-zero when anything at
 * or above `high` is reported, so it can gate a commit or CI job.
 */
import { SEED_UNITS } from "../src/lib/domain/inventory";
import { formatReport, validateScene } from "../src/lib/3d/validate";

const strict = process.argv.includes("--strict");

const report = validateScene({
  entries: SEED_UNITS.map((unit) => ({
    property: { code: unit.code, typology: unit.typology },
    position: unit.position,
    rotationY: unit.position.rotationY,
  })),
});

console.log(formatReport(report));

const blocking = report.counts.critical + report.counts.high;
if (strict && blocking > 0) {
  console.error(`\n${blocking} blocking spatial finding(s).`);
  process.exit(1);
}

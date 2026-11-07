// ============================================================================
// SALIDA DE VALIDACIÓN — Escribe el resultado de cada suite E2E en
// scripts/validation-results/pilar<N>.json para el panel de control
// (/dashboard/quality). Nunca lanza: el resultado de la suite manda.
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type CheckLog = Array<{ name: string; ok: boolean }>;

export type ValidationReport = {
  pilar: number;
  title: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  timestamp: string;
  checks: CheckLog;
};

export function writeResults(
  pilar: number,
  title: string,
  total: number,
  failures: number,
  t0: number,
  checks: CheckLog,
): void {
  try {
    const dir = path.join(process.cwd(), "scripts", "validation-results");
    mkdirSync(dir, { recursive: true });
    const report: ValidationReport = {
      pilar,
      title,
      total,
      passed: total - failures,
      failed: failures,
      durationMs: Date.now() - t0,
      timestamp: new Date().toISOString(),
      checks,
    };
    writeFileSync(path.join(dir, `pilar${pilar}.json`), JSON.stringify(report, null, 2), "utf8");
    console.log(`  📊 resultados → scripts/validation-results/pilar${pilar}.json`);
  } catch (e) {
    console.log(`  ⚠️ no se pudo escribir el resultado: ${e instanceof Error ? e.message : e}`);
  }
}

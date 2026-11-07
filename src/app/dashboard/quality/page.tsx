// ============================================================================
// PANEL DE CONTROL DE VALIDACIÓN /dashboard/quality
// ----------------------------------------------------------------------------
// Integra los resultados E2E de los 4 pilares + el refino de Severidad 3
// (scripts/validation-results/pilar<N>.json, escritos por cada suite bun
// scripts/validate-pilar<N>.ts / validate-severidad3.ts). Solo lectura:
// muestra estado por bloque (✅/❌), totales, duración, fecha y el detalle
// check a check. Cero JS de cliente: <details> nativo.
// Acceso: cualquier usuario autenticado (es una herramienta de calidad, la
// lógica vive en ficheros locales; nunca expone datos de dominio de clubes).
// ============================================================================
import { redirect } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  ShieldAlert,
  Terminal,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/lib/session";

/** Mismo contrato que scripts/validation-output.ts escribe en pilar<N>.json */
type ValidationReport = {
  pilar: number;
  title: string;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  timestamp: string;
  checks: Array<{ name: string; ok: boolean }>;
};

export const dynamic = "force-dynamic";

const PILARES = [
  { n: 1, label: "Pilar 1", title: "Biblioteca de Sabiduría + RBAC", script: "bun scripts/validate-pilar1.ts" },
  { n: 2, label: "Pilar 2", title: "Plantilla y Pulso (CSV/Excel + fatiga)", script: "bun scripts/validate-pilar2.ts" },
  { n: 3, label: "Pilar 3", title: "Ingesta Post-Partido (3 pasos)", script: "bun scripts/validate-pilar3.ts" },
  { n: 4, label: "Pilar 4", title: "Motor Prescriptivo + Hoy", script: "bun scripts/validate-pilar4.ts" },
  {
    n: 5,
    label: "Refino S3",
    title: "Perfección técnica local (ventana de pulso · TZ Madrid · factibilidad MD+1/MD-1)",
    script: "bun scripts/validate-severidad3.ts",
  },
] as const;

type LoadResult = { report: ValidationReport | null; error?: string };

async function loadReport(pilar: number): Promise<LoadResult> {
  try {
    const file = path.join(process.cwd(), "scripts", "validation-results", `pilar${pilar}.json`);
    const raw = await readFile(file, "utf8");
    return { report: JSON.parse(raw) as ValidationReport };
  } catch {
    return { report: null, error: "Sin resultados — ejecuta la suite para poblar el panel." };
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default async function QualityPage() {
  const user = await getSessionUser();
  if (!user?.id) redirect("/");

  const results = await Promise.all(PILARES.map((p) => loadReport(p.n)));
  const withData = results.filter((r) => r.report).map((r) => r.report!);
  const globalFailed = withData.reduce((acc, r) => acc + r.failed, 0);
  const globalTotal = withData.reduce((acc, r) => acc + r.total, 0);
  const allGreen = withData.length === PILARES.length && globalFailed === 0;

  return (
    <main className="min-h-screen bg-zinc-950 pb-20">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <Link
              href={user.clubId ? "/" : "/dashboard/catedra"}
              aria-label="Volver"
              className="w-10 h-10 rounded-2xl border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden />
            </Link>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 leading-tight truncate">Calidad · ECOSYSTEM MÉTODO</p>
              <h1 className="text-xl font-black text-zinc-50 leading-tight">Validación E2E</h1>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`rounded-full px-3 py-1.5 text-xs font-black shrink-0 ${
              allGreen
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : globalFailed > 0
                  ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}
          >
            {allGreen ? `✅ ${globalTotal}/${globalTotal} checks` : globalFailed > 0 ? `💥 ${globalFailed} fallos` : "Sin datos"}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 space-y-4 pt-5">
        <p className="text-sm text-zinc-400 leading-relaxed">
          Los 4 pilares del método y el refino de Severidad 3 se validan de
          punta a punta contra la base de datos real y el servidor HTTP
          (NextAuth + Tenant Guard). Cada suite escribe aquí su resultado al
          terminar.
        </p>

        {PILARES.map((p, i) => {
          const { report, error } = results[i];
          const ok = report != null && report.failed === 0 && report.total > 0;
          const failed = report != null && report.failed > 0;
          const pct = report && report.total > 0 ? Math.round((report.passed / report.total) * 100) : 0;
          return (
            <section
              key={p.n}
              aria-label={`Pilar ${p.n}: ${p.title}`}
              className={`rounded-3xl border overflow-hidden ${
                ok
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : failed
                    ? "border-rose-500/40 bg-rose-500/[0.04]"
                    : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  {ok ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" aria-hidden />
                  ) : failed ? (
                    <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" aria-hidden />
                  ) : (
                    <FlaskConical className="w-6 h-6 text-zinc-500 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                      {p.label}
                    </p>
                    <p className="text-base font-black text-zinc-50 truncate">{p.title}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {report ? (
                    <>
                      <p className={`text-xl font-black ${ok ? "text-emerald-300" : failed ? "text-rose-300" : "text-zinc-300"}`}>
                        {report.passed}/{report.total}
                        <span className="text-xs font-bold text-zinc-500 ml-1">({pct}%)</span>
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {fmtDate(report.timestamp)} · {report.durationMs} ms
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500 max-w-56">{error}</p>
                  )}
                </div>
              </div>

              {report && (
                <div className="px-5 pb-2">
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}

              {report && (
                <details className="group border-t border-zinc-800/60">
                  <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-zinc-400 hover:text-zinc-200 flex items-center justify-between">
                    Detalle de los {report.total} checks
                    <span className="text-xs text-zinc-600 group-open:hidden">ver</span>
                    <span className="hidden text-xs text-zinc-600 group-open:inline">ocultar</span>
                  </summary>
                  <ul className="px-5 pb-4 space-y-1.5">
                    {report.checks.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        {c.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400/70 mt-0.5 shrink-0" aria-hidden />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" aria-hidden />
                        )}
                        <span className={c.ok ? "text-zinc-400" : "text-rose-200 font-semibold"}>
                          {c.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="px-5 pb-4">
                <p className="text-xs text-zinc-600 flex items-center gap-1.5 font-mono">
                  <Terminal className="w-3.5 h-3.5" aria-hidden />
                  {p.script}
                </p>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

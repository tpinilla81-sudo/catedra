// ============================================================================
// PANEL DE CONTROL DE VALIDACIÓN /dashboard/quality
// ----------------------------------------------------------------------------
// Integra los resultados E2E de los 4 pilares + el refino de Severidad 3
// + el scouting del rival P4.1
// (scripts/validation-results/pilar<N>.json, escritos por cada suite bun
// scripts/validate-pilar<N>.ts / validate-severidad3.ts / validate-scouting.ts). Solo lectura:
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
  {
    n: 6,
    label: "Scouting P4.1",
    title: "Scouting del rival — guard multi-tenant + motor (explotar debilidades)",
    script: "bun scripts/validate-scouting.ts",
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
    <main className="min-h-screen bg-cream pb-20">
      <header className="border-b border-cream-border bg-white/60">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <Link
              href={user.clubId ? "/" : "/dashboard/catedra"}
              aria-label="Volver"
              className="w-10 h-10 rounded-2xl border border-cream-border-strong flex items-center justify-center text-[#5d7263] hover:text-peel hover:border-[#a8a389] shrink-0"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden />
            </Link>
            <div className="min-w-0">
              <p className="text-xs text-[#6c8070] leading-tight truncate">Calidad · CATEDRA by Método</p>
              <h1 className="text-xl font-black text-peel leading-tight">Validación E2E</h1>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`rounded-full px-3 py-1.5 text-xs font-black shrink-0 ${
              allGreen
                ? "bg-brand-600/15 text-brand-600 border-emerald-500/40"
                : globalFailed > 0
                  ? "bg-[#c62f32]/15 text-[#b4232a] border-rose-500/40"
                  : "bg-cream-dark text-[#5d7263] border-cream-border-strong"
            }`}
          >
            {allGreen ? `✅ ${globalTotal}/${globalTotal} checks` : globalFailed > 0 ? `💥 ${globalFailed} fallos` : "Sin datos"}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 space-y-4 pt-5">
        <p className="text-sm text-[#5d7263] leading-relaxed">
          Los 4 pilares del método, el refino de Severidad 3 y el scouting del
          rival (P4.1) se validan de punta a punta contra la base de datos real
          y el servidor HTTP (NextAuth + Tenant Guard). Cada suite escribe aquí
          su resultado al terminar.
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
                  ? "border-emerald-500/30 bg-brand-600/[0.04]"
                  : failed
                    ? "border-rose-500/40 bg-[#c62f32]/[0.04]"
                    : "border-cream-border bg-white"
              }`}
            >
              <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  {ok ? (
                    <CheckCircle2 className="w-6 h-6 text-brand-600 shrink-0" aria-hidden />
                  ) : failed ? (
                    <ShieldAlert className="w-6 h-6 text-[#b4232a] shrink-0" aria-hidden />
                  ) : (
                    <FlaskConical className="w-6 h-6 text-[#6c8070] shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#6c8070] uppercase tracking-wide">
                      {p.label}
                    </p>
                    <p className="text-base font-black text-peel truncate">{p.title}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {report ? (
                    <>
                      <p className={`text-xl font-black ${ok ? "text-brand-600" : failed ? "text-[#b4232a]" : "text-[#3d5844]"}`}>
                        {report.passed}/{report.total}
                        <span className="text-xs font-bold text-[#6c8070] ml-1">({pct}%)</span>
                      </p>
                      <p className="text-[11px] text-[#6c8070]">
                        {fmtDate(report.timestamp)} · {report.durationMs} ms
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[#6c8070] max-w-56">{error}</p>
                  )}
                </div>
              </div>

              {report && (
                <div className="px-5 pb-2">
                  <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden">
                    <div
                      className={`h-full ${ok ? "bg-brand-400" : "bg-[#e05252]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}

              {report && (
                <details className="group border-t border-cream-border/70">
                  <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-[#5d7263] hover:text-[#2a4630] flex items-center justify-between">
                    Detalle de los {report.total} checks
                    <span className="text-xs text-[#8a9a8d] group-open:hidden">ver</span>
                    <span className="hidden text-xs text-[#8a9a8d] group-open:inline">ocultar</span>
                  </summary>
                  <ul className="px-5 pb-4 space-y-1.5">
                    {report.checks.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        {c.ok ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-600/90 mt-0.5 shrink-0" aria-hidden />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#b4232a] mt-0.5 shrink-0" aria-hidden />
                        )}
                        <span className={c.ok ? "text-[#5d7263]" : "text-[#8f1d22] font-semibold"}>
                          {c.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="px-5 pb-4">
                <p className="text-xs text-[#8a9a8d] flex items-center gap-1.5 font-mono">
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

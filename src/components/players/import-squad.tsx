"use client";

// ============================================================================
// PILAR 2 — IMPORTACIÓN MASIVA DE PLANTILLA (Drag & Drop, CSV / Excel)
// ----------------------------------------------------------------------------
// • Zona de arrastre táctil: soltar o tocar para elegir (.csv, .xlsx, .xls).
// • Plantilla CSV descargable para que el míster sepa el formato en 2 segundos.
// • "⚡ Procesar" llama a importSquadFile (Server Action) y muestra el
//   resultado al instante: creados / actualizados / errores por fila.
// ============================================================================

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { importSquadFile, type ImportSummary } from "@/app/dashboard/players/actions";

const TEMPLATE_CSV = [
  "nombre,apellidos,dorsal,posicion,secundarias,tecnico,tactico,fisico,estado,nota",
  'Marco,Pérez,15,DFC,"MCD, MC",3,4,4,disponible,Buen pie izquierdo',
  "Iván,Torres,23,EI,\"ED, SD\",4,3,5,,Rápido al espacio",
  "Dani,Ruiz,8,MCO,MC,4,4,3,disponible,",
].join("\n");

function downloadTemplate() {
  const blob = new Blob(["\ufeff" + TEMPLATE_CSV], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-metodo.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportSquadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setSummary(null);
  }

  function process() {
    if (!file || pending) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await importSquadFile(fd);
      setSummary(res);
      if (res.created + res.updated > 0) router.refresh();
    });
  }

  const failedRows = summary?.rows.filter((r) => !r.ok) ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="min-h-[48px] rounded-2xl bg-cream-dark hover:bg-cream-border-strong text-peel border border-cream-border-strong font-bold"
          aria-label="Importar plantilla desde CSV o Excel"
        >
          <UploadCloud className="w-5 h-5" aria-hidden />
          <span>Importar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white border-cream-border rounded-3xl max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle className="text-peel text-lg font-black">
            Importar plantilla
          </DialogTitle>
          <DialogDescription className="text-[#5d7263] text-sm">
            Arrastra un CSV o Excel con tus jugadores. Los que ya existan (por
            nombre) se actualizan; los nuevos se crean al instante.
          </DialogDescription>
        </DialogHeader>

        {/* ---------- Zona de arrastre ---------- */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Zona para soltar el archivo"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-8 text-center transition cursor-pointer min-h-[160px] ${
            dragOver
              ? "border-brand-600 bg-brand-600/10"
              : "border-cream-border-strong bg-cream-dark/70"
          }`}
        >
          {file ? (
            <>
              <FileSpreadsheet className="w-8 h-8 text-brand-600" aria-hidden />
              <p className="font-bold text-peel break-all max-w-full">{file.name}</p>
              <p className="text-xs text-[#6c8070]">{(file.size / 1024).toFixed(0)} KB</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setSummary(null);
                }}
                className="mt-1 text-xs text-[#5d7263] hover:text-[#2a4630] inline-flex items-center gap-1 min-h-[44px] px-3"
              >
                <X className="w-3 h-3" aria-hidden /> Quitar archivo
              </button>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 text-[#6c8070]" aria-hidden />
              <p className="font-bold text-[#2a4630]">Arrastra aquí el archivo</p>
              <p className="text-sm text-[#6c8070]">o toca para elegir (.csv, .xlsx, .xls)</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        {/* ---------- Acciones ---------- */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-sm font-semibold text-brand-600 hover:text-brand inline-flex items-center gap-1.5 min-h-[44px] px-1"
          >
            <Download className="w-4 h-4" aria-hidden /> Descargar plantilla CSV
          </button>
          <Button
            onClick={process}
            disabled={!file || pending}
            className="min-h-[52px] rounded-2xl bg-brand-600 hover:bg-brand text-white font-black px-6"
          >
            {pending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Procesando…
              </>
            ) : (
              "⚡ Procesar"
            )}
          </Button>
        </div>

        {/* ---------- Resultado ---------- */}
        {summary?.error && (
          <p className="rounded-2xl bg-[#c62f32]/15 border border-rose-500/40 text-[#8f1d22] text-sm px-4 py-3">
            {summary.error}
          </p>
        )}

        {summary && !summary.error && (
          <div className="space-y-2">
            <div className="flex gap-2 text-center">
              <span className="flex-1 rounded-2xl bg-brand-600/15 border border-emerald-500/40 px-3 py-2 text-sm font-bold text-brand-600">
                {summary.created} creados
              </span>
              <span className="flex-1 rounded-2xl bg-sky-500/15 border border-sky-500/40 px-3 py-2 text-sm font-bold text-[#0369a1]">
                {summary.updated} actualizados
              </span>
              <span
                className={`flex-1 rounded-2xl px-3 py-2 text-sm font-bold border ${
                  summary.errors
                    ? "bg-[#c62f32]/15 border-rose-500/40 text-[#b4232a]"
                    : "bg-cream-dark border-cream-border-strong text-[#5d7263]"
                }`}
              >
                {summary.errors} errores
              </span>
            </div>

            {failedRows.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-2xl border border-cream-border divide-y divide-cream-border">
                {failedRows.map((r) => (
                  <div key={`${r.row}-${r.name}`} className="flex items-start gap-2 px-3 py-2 text-xs">
                    <TriangleAlert className="w-4 h-4 text-[#8a6206] shrink-0 mt-0.5" aria-hidden />
                    <div>
                      <p className="font-bold text-[#3d5844]">
                        Fila {r.row} · {r.name}
                      </p>
                      <p className="text-[#6c8070]">{r.error}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {summary.errors === 0 && (
              <p className="flex items-center gap-2 text-sm text-brand-600 px-1">
                <CheckCircle2 className="w-4 h-4" aria-hidden /> Plantilla al día.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

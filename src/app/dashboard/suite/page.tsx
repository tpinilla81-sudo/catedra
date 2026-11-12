// ============================================================================
// /dashboard/suite — REDIRECCIÓN a la ruta oficial del mock del míster
// ----------------------------------------------------------------------------
// «Análisis Cualitativo» SUSTITUYE a la Suite Táctica: el contenido vive en
// /dashboard/analisis-cualitativo. La ruta antigua (Suite Táctica Maestra)
// redirige aquí para no romper enlaces ni verificaciones previas.
// ============================================================================
import { redirect } from "next/navigation";

export default function SuiteRedirect() {
  redirect("/dashboard/analisis-cualitativo");
}

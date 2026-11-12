-- Mock del míster 'EditorTarea': Sección de Trabajo (comentarios), Etapas
-- del Proceso de Formación (5 fases oficiales) y Clasificación Taxonómica
-- Nivel 3 (27 categorías, multiselección cruzada). MIGRACIÓN 100% ADITIVA:
-- solo CREATE de columnas; ninguna tabla ni dato existente se toca.
ALTER TABLE "Task" ADD COLUMN "workComments" TEXT;
ALTER TABLE "Task" ADD COLUMN "etapasFormacion" TEXT[];
ALTER TABLE "Task" ADD COLUMN "nivel3Ids" TEXT[];

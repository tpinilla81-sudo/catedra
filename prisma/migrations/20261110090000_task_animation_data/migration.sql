-- Pizarra animada personalizada por tarea (Pilar 2 / Biblioteca).
-- JSON ligero: fotogramas + coordenadas de fichas y balón (sin vídeo).
-- Nullable: las tareas sin pizarra propia siguen usando la plantilla determinista.
ALTER TABLE "Task" ADD COLUMN "animationData" JSONB;

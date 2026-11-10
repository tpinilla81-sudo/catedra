-- Zona del campo + vídeo real de la tarea (Pilar 2 — petición del míster)
-- Toda tarea declara EN QUÉ ZONA se hace y dónde ver el vídeo REAL grabado
-- en esos metros. Backfill: las tareas existentes quedan en "Todo el campo"
-- (el míster ajusta cada una al abrirla).
ALTER TABLE "Task" ADD COLUMN "fieldZoneLabel" TEXT;
ALTER TABLE "Task" ADD COLUMN "fieldZoneX" INTEGER;
ALTER TABLE "Task" ADD COLUMN "fieldZoneY" INTEGER;
ALTER TABLE "Task" ADD COLUMN "videoUrl" TEXT;

UPDATE "Task" SET "fieldZoneLabel" = 'TODO_EL_CAMPO' WHERE "fieldZoneLabel" IS NULL;

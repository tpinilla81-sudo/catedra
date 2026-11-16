-- Mock del míster: nuevo campo «Definición del Trabajo» en la ficha de tarea,
-- al lado de espacio, jugadores, intensidad. MIGRACIÓN 100% ADITIVA: solo se
-- añade una columna; ninguna tabla ni dato existente se toca.
-- (La ETAPA no necesita migración: ya existe como etapasFormacion String[]).
ALTER TABLE "Task" ADD COLUMN "definicionTrabajo" TEXT;

-- Demarcación «PD — pivote defensivo» (petición del míster: faltaba PD en las
-- demarcaciones de los jugadores). El pivote defensivo estaba guardado con el
-- código internacional DM; el míster lo busca como PD. RENOMBRADO COMPLETO:
--   · enum Position: RENAME VALUE (ninguna columna lo usa, pero queda coherente)
--   · Player.primaryPosition: 'DM' → 'PD'
--   · Player.secondaryPositions: reemplaza 'DM' por 'PD' dentro del array
-- Los alias de normalizePosition (dm, mcd, pd, pivote…) siguen funcionando.
ALTER TYPE "Position" RENAME VALUE 'DM' TO 'PD';

UPDATE "Player" SET "primaryPosition" = 'PD' WHERE "primaryPosition" = 'DM';

UPDATE "Player" SET "secondaryPositions" = array_replace("secondaryPositions", 'DM', 'PD');

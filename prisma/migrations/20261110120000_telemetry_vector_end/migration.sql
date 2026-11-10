-- Pilar 3 · pizarra espacial causa→efecto
-- El gesto del analista traza un vector: donde se PIERDE el balón (causa,
-- coordinatesX/Y ya existentes) → donde acaba la consecuencia (efecto).
-- Añadimos el punto FINAL del vector. Nullable: los eventos 1-toque
-- anteriores y los que no trazan vector siguen igual (sin migración de datos).
ALTER TABLE "MatchTelemetryEvent" ADD COLUMN "coordinatesX2" DOUBLE PRECISION;
ALTER TABLE "MatchTelemetryEvent" ADD COLUMN "coordinatesY2" DOUBLE PRECISION;

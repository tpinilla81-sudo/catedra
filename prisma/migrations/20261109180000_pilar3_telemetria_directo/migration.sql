-- ============================================================================
-- PILAR 2 · Perfil pre-partido → las 5 métricas esenciales (renombrado sin
-- pérdida de datos) + demarcaciones como texto canónico (String, admite
-- demarcaciones propias del fútbol base).
-- PILAR 3 · Telemetría en directo: MatchSession (reloj + vídeo),
-- MatchTelemetryEvent (eventos 1-toque) y VideoBookmark (clip-review).
-- ============================================================================

-- ------------------------------------------------------------------------
-- Player: perfil pre-partido (Pilar 2)
-- ------------------------------------------------------------------------

-- Renombrado 1:1 — los datos existentes se conservan
ALTER TABLE "Player" RENAME COLUMN "currentRpe" TO "fatigueRPE";
ALTER TABLE "Player" RENAME COLUMN "injuryHistory" TO "medicalNotes";
ALTER TABLE "Player" RENAME COLUMN "academicConstraints" TO "academicStress";
ALTER TABLE "Player" RENAME COLUMN "strength" TO "tacticalStrength";

-- tacticalStrength pasa a NOT NULL con '' por defecto (backfill seguro)
UPDATE "Player" SET "tacticalStrength" = '' WHERE "tacticalStrength" IS NULL;
ALTER TABLE "Player" ALTER COLUMN "tacticalStrength" SET DEFAULT '';
ALTER TABLE "Player" ALTER COLUMN "tacticalStrength" SET NOT NULL;

-- Demarcaciones: enum Position → texto (códigos GK, CB, DM, LW...)
ALTER TABLE "Player" RENAME COLUMN "mainPosition" TO "primaryPosition";
ALTER TABLE "Player" ALTER COLUMN "primaryPosition" SET DATA TYPE TEXT USING "primaryPosition"::text;
ALTER TABLE "Player" ALTER COLUMN "secondaryPositions" SET DATA TYPE TEXT[] USING "secondaryPositions"::text[];
DROP INDEX "Player_mainPosition_idx";
CREATE INDEX "Player_primaryPosition_idx" ON "Player"("primaryPosition");

-- ------------------------------------------------------------------------
-- Enums nuevos (Pilar 3)
-- ------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "TelemetryType" AS ENUM ('FATIGUE', 'CLINICAL', 'TACTICAL', 'ACTION');

-- CreateEnum
CREATE TYPE "MatchSessionStatus" AS ENUM ('LIVE', 'PAUSED', 'FINISHED');

-- ------------------------------------------------------------------------
-- MatchSession — sesión en directo: reloj autoritativo + vídeo
-- ------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "MatchSession" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "status" "MatchSessionStatus" NOT NULL DEFAULT 'LIVE',
    "clockBaseSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clockStartedAt" TIMESTAMP(3),
    "videoUrl" TEXT,
    "videoOffsetSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchSession_matchId_key" ON "MatchSession"("matchId");

-- CreateIndex
CREATE INDEX "MatchSession_clubId_teamId_idx" ON "MatchSession"("clubId", "teamId");

-- AddForeignKey
ALTER TABLE "MatchSession" ADD CONSTRAINT "MatchSession_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSession" ADD CONSTRAINT "MatchSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSession" ADD CONSTRAINT "MatchSession_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------------------
-- MatchTelemetryEvent — alta frecuencia, minute-stamped, coordenadas 0-100
-- ------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "MatchTelemetryEvent" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchSessionId" TEXT NOT NULL,
    "playerId" TEXT,
    "minute" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "TelemetryType" NOT NULL,
    "value" TEXT NOT NULL,
    "coordinatesX" DOUBLE PRECISION,
    "coordinatesY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchTelemetryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchTelemetryEvent_matchId_playerId_idx" ON "MatchTelemetryEvent"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "MatchTelemetryEvent_matchId_minute_idx" ON "MatchTelemetryEvent"("matchId", "minute");

-- CreateIndex
CREATE INDEX "MatchTelemetryEvent_matchSessionId_minute_idx" ON "MatchTelemetryEvent"("matchSessionId", "minute");

-- AddForeignKey
ALTER TABLE "MatchTelemetryEvent" ADD CONSTRAINT "MatchTelemetryEvent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTelemetryEvent" ADD CONSTRAINT "MatchTelemetryEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTelemetryEvent" ADD CONSTRAINT "MatchTelemetryEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTelemetryEvent" ADD CONSTRAINT "MatchTelemetryEvent_matchSessionId_fkey" FOREIGN KEY ("matchSessionId") REFERENCES "MatchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTelemetryEvent" ADD CONSTRAINT "MatchTelemetryEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ------------------------------------------------------------------------
-- VideoBookmark — enlaza cada evento con su instante exacto de vídeo (1:1)
-- ------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "VideoBookmark" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "telemetryEventId" TEXT NOT NULL,
    "videoTimestampSeconds" DOUBLE PRECISION NOT NULL,
    "videoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoBookmark_telemetryEventId_key" ON "VideoBookmark"("telemetryEventId");

-- CreateIndex
CREATE INDEX "VideoBookmark_clubId_idx" ON "VideoBookmark"("clubId");

-- AddForeignKey
ALTER TABLE "VideoBookmark" ADD CONSTRAINT "VideoBookmark_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoBookmark" ADD CONSTRAINT "VideoBookmark_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoBookmark" ADD CONSTRAINT "VideoBookmark_telemetryEventId_fkey" FOREIGN KEY ("telemetryEventId") REFERENCES "MatchTelemetryEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

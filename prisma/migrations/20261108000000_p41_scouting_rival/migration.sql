-- ============================================================================
-- P4.1 — SCOUTING DEL RIVAL (insumo del motor)
--   OpponentReport (1 informe por equipo y semana, lunes-Madrid) + hijos
--   OpponentWeakness (debilidad por GamePhase) y OpponentTacticalEvent
--   (comportamientos observados). Sin cambios de enum: los hallazgos del
--   scouting usan el IssueKind TACTICAL existente con source en la métrica.
-- ============================================================================

-- CreateTable
CREATE TABLE "OpponentReport" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "opponentName" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "matchId" TEXT,
    "buildUpType" TEXT NOT NULL,
    "defensiveBlock" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpponentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpponentWeakness" (
    "id" TEXT NOT NULL,
    "opponentReportId" TEXT NOT NULL,
    "phase" "GamePhase" NOT NULL,
    "description" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "OpponentWeakness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpponentTacticalEvent" (
    "id" TEXT NOT NULL,
    "opponentReportId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "behavior" TEXT NOT NULL,

    CONSTRAINT "OpponentTacticalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpponentReport_matchId_key" ON "OpponentReport"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "OpponentReport_teamId_weekStart_key" ON "OpponentReport"("teamId", "weekStart");

-- CreateIndex
CREATE INDEX "OpponentReport_clubId_idx" ON "OpponentReport"("clubId");

-- CreateIndex
CREATE INDEX "OpponentWeakness_opponentReportId_idx" ON "OpponentWeakness"("opponentReportId");

-- CreateIndex
CREATE INDEX "OpponentTacticalEvent_opponentReportId_idx" ON "OpponentTacticalEvent"("opponentReportId");

-- AddForeignKey
ALTER TABLE "OpponentReport" ADD CONSTRAINT "OpponentReport_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentReport" ADD CONSTRAINT "OpponentReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentReport" ADD CONSTRAINT "OpponentReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentWeakness" ADD CONSTRAINT "OpponentWeakness_opponentReportId_fkey" FOREIGN KEY ("opponentReportId") REFERENCES "OpponentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpponentTacticalEvent" ADD CONSTRAINT "OpponentTacticalEvent_opponentReportId_fkey" FOREIGN KEY ("opponentReportId") REFERENCES "OpponentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

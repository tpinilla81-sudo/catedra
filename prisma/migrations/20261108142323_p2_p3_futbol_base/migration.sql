-- CreateEnum
CREATE TYPE "TagCode" AS ENUM ('GOOD_UNMARKED', 'PASS_ACCURACY', 'DECISION_MAKING', 'TRACKBACK_QUICK', 'PRESS_INTENSITY', 'POSITION_FAULT', 'OVER_DRIBBLING', 'NO_PRESS', 'FATIGUE_NOTICED');

-- CreateEnum
CREATE TYPE "TagType" AS ENUM ('POSITIVE', 'CORRECTIVE');

-- AlterEnum
ALTER TYPE "PlayerStatus" ADD VALUE 'DOUBTFUL';

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playerId" TEXT NOT NULL,
    "status" "PlayerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "sessionRPE" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveMatchEvaluation" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveMatchEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchTag" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "code" "TagCode" NOT NULL,
    "type" "TagType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceRecord_playerId_date_idx" ON "AttendanceRecord"("playerId", "date");

-- CreateIndex
CREATE INDEX "LiveMatchEvaluation_matchId_idx" ON "LiveMatchEvaluation"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveMatchEvaluation_matchId_playerId_key" ON "LiveMatchEvaluation"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "MatchTag_evaluationId_code_idx" ON "MatchTag"("evaluationId", "code");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveMatchEvaluation" ADD CONSTRAINT "LiveMatchEvaluation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveMatchEvaluation" ADD CONSTRAINT "LiveMatchEvaluation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTag" ADD CONSTRAINT "MatchTag_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "LiveMatchEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

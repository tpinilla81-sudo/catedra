-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'COACH_ADMIN', 'ANALYST');

-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('OFFENSIVE', 'DEFENSIVE', 'OFF_TRANSITION', 'DEF_TRANSITION', 'SET_PIECE');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'SS', 'CF');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('AVAILABLE', 'INJURED', 'SUSPENDED', 'RETURNING');

-- CreateEnum
CREATE TYPE "Intensity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TacticalEventType" AS ENUM ('BALL_LOSS', 'BALL_RECOVERY', 'POSITIVE_DUEL', 'NEGATIVE_DUEL', 'ATTEMPTED_SHOT', 'GOAL_FOR', 'GOAL_AGAINST', 'OPPONENT_CHANCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Semaphore" AS ENUM ('GREEN', 'AMBER', 'RED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'PLAYED', 'ANALYZED');

-- CreateEnum
CREATE TYPE "MicrocycleStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'ADJUSTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "IssueKind" AS ENUM ('TACTICAL', 'PHYSICAL', 'MORALE');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ADDRESSED', 'RESOLVED');

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ANALYST',
    "clubId" TEXT,
    "lastTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "shirtNumber" INTEGER,
    "mainPosition" "Position" NOT NULL,
    "secondaryPositions" "Position"[],
    "technicalRating" INTEGER,
    "tacticalRating" INTEGER,
    "physicalRating" INTEGER,
    "ratingsUpdatedAt" TIMESTAMP(3),
    "status" "PlayerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "statusNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPulse" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "moraleScore" INTEGER NOT NULL,
    "fatigueScore" INTEGER NOT NULL,
    "resultsStreak" INTEGER,
    "notes" TEXT,
    "capturedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPulse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "competition" TEXT,
    "isHome" BOOLEAN NOT NULL DEFAULT true,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "goalsFor" INTEGER,
    "goalsAgainst" INTEGER,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchReport" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sensation" "Semaphore" NOT NULL,
    "perceivedLoad" INTEGER NOT NULL,
    "collectiveAttitude" INTEGER NOT NULL,
    "tacticalExecution" INTEGER NOT NULL,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TacticalEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "playerId" TEXT,
    "minute" INTEGER,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "type" "TacticalEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TacticalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMatchNote" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "flag" "Semaphore" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerMatchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubPrinciple" (
    "id" TEXT NOT NULL,
    "clubId" TEXT,
    "parentId" TEXT,
    "phase" "GamePhase" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubPrinciple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "clubId" TEXT,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "phases" "GamePhase"[],
    "spaceLengthM" INTEGER,
    "spaceWidthM" INTEGER,
    "spaceNote" TEXT,
    "playersMin" INTEGER NOT NULL,
    "playersMax" INTEGER,
    "durationMin" INTEGER NOT NULL,
    "repetitions" TEXT,
    "intensity" "Intensity" NOT NULL DEFAULT 'MEDIUM',
    "rulesOfProvocation" TEXT[],
    "coachingPoints" TEXT[],
    "materials" TEXT[],
    "diagramUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSubPrinciple" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "subPrincipleId" TEXT NOT NULL,
    "relevance" INTEGER NOT NULL DEFAULT 2,
    "usageNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSubPrinciple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Microcycle" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "MicrocycleStatus" NOT NULL DEFAULT 'PROPOSED',
    "tacticalDirectives" TEXT[],
    "methodologicalApproach" TEXT,
    "diagnosisSummary" TEXT,
    "engineVersion" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Microcycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MicrocycleMatch" (
    "microcycleId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MicrocycleMatch_pkey" PRIMARY KEY ("microcycleId","matchId")
);

-- CreateTable
CREATE TABLE "DiagnosisIssue" (
    "id" TEXT NOT NULL,
    "microcycleId" TEXT NOT NULL,
    "subPrincipleId" TEXT,
    "phase" "GamePhase",
    "kind" "IssueKind" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 2,
    "evidence" TEXT NOT NULL,
    "metric" JSONB,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosisIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "microcycleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "objective" TEXT,
    "durationMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTask" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "durationMin" INTEGER,
    "rationale" TEXT,
    "prescribedIssueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineRun" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "microcycleId" TEXT,
    "version" TEXT NOT NULL,
    "inputSnapshot" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clubId_idx" ON "User"("clubId");

-- CreateIndex
CREATE INDEX "Season_clubId_isActive_idx" ON "Season"("clubId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Season_clubId_name_key" ON "Season"("clubId", "name");

-- CreateIndex
CREATE INDEX "Team_clubId_idx" ON "Team"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_seasonId_name_key" ON "Team"("seasonId", "name");

-- CreateIndex
CREATE INDEX "Player_clubId_teamId_idx" ON "Player"("clubId", "teamId");

-- CreateIndex
CREATE INDEX "Player_mainPosition_idx" ON "Player"("mainPosition");

-- CreateIndex
CREATE UNIQUE INDEX "Player_teamId_shirtNumber_key" ON "Player"("teamId", "shirtNumber");

-- CreateIndex
CREATE INDEX "TeamPulse_teamId_date_idx" ON "TeamPulse"("teamId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPulse_teamId_date_key" ON "TeamPulse"("teamId", "date");

-- CreateIndex
CREATE INDEX "Match_teamId_kickoffAt_idx" ON "Match"("teamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "Match_clubId_status_idx" ON "Match"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MatchReport_matchId_key" ON "MatchReport"("matchId");

-- CreateIndex
CREATE INDEX "MatchReport_createdById_idx" ON "MatchReport"("createdById");

-- CreateIndex
CREATE INDEX "TacticalEvent_reportId_type_idx" ON "TacticalEvent"("reportId", "type");

-- CreateIndex
CREATE INDEX "TacticalEvent_playerId_idx" ON "TacticalEvent"("playerId");

-- CreateIndex
CREATE INDEX "PlayerMatchNote_playerId_idx" ON "PlayerMatchNote"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchNote_reportId_playerId_key" ON "PlayerMatchNote"("reportId", "playerId");

-- CreateIndex
CREATE INDEX "SubPrinciple_clubId_phase_idx" ON "SubPrinciple"("clubId", "phase");

-- CreateIndex
CREATE INDEX "SubPrinciple_parentId_idx" ON "SubPrinciple"("parentId");

-- CreateIndex
CREATE INDEX "Task_clubId_idx" ON "Task"("clubId");

-- CreateIndex
CREATE INDEX "Task_intensity_idx" ON "Task"("intensity");

-- CreateIndex
CREATE INDEX "TaskSubPrinciple_subPrincipleId_relevance_idx" ON "TaskSubPrinciple"("subPrincipleId", "relevance");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSubPrinciple_taskId_subPrincipleId_key" ON "TaskSubPrinciple"("taskId", "subPrincipleId");

-- CreateIndex
CREATE INDEX "Microcycle_clubId_teamId_weekStart_idx" ON "Microcycle"("clubId", "teamId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "Microcycle_teamId_weekStart_key" ON "Microcycle"("teamId", "weekStart");

-- CreateIndex
CREATE INDEX "MicrocycleMatch_matchId_idx" ON "MicrocycleMatch"("matchId");

-- CreateIndex
CREATE INDEX "DiagnosisIssue_microcycleId_idx" ON "DiagnosisIssue"("microcycleId");

-- CreateIndex
CREATE INDEX "DiagnosisIssue_subPrincipleId_idx" ON "DiagnosisIssue"("subPrincipleId");

-- CreateIndex
CREATE INDEX "Session_microcycleId_date_idx" ON "Session"("microcycleId", "date");

-- CreateIndex
CREATE INDEX "SessionTask_taskId_idx" ON "SessionTask"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTask_sessionId_order_key" ON "SessionTask"("sessionId", "order");

-- CreateIndex
CREATE INDEX "EngineRun_teamId_createdAt_idx" ON "EngineRun"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_lastTeamId_fkey" FOREIGN KEY ("lastTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPulse" ADD CONSTRAINT "TeamPulse_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPulse" ADD CONSTRAINT "TeamPulse_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPulse" ADD CONSTRAINT "TeamPulse_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReport" ADD CONSTRAINT "MatchReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReport" ADD CONSTRAINT "MatchReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TacticalEvent" ADD CONSTRAINT "TacticalEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MatchReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TacticalEvent" ADD CONSTRAINT "TacticalEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchNote" ADD CONSTRAINT "PlayerMatchNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MatchReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchNote" ADD CONSTRAINT "PlayerMatchNote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubPrinciple" ADD CONSTRAINT "SubPrinciple_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubPrinciple" ADD CONSTRAINT "SubPrinciple_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SubPrinciple"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubPrinciple" ADD CONSTRAINT "TaskSubPrinciple_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubPrinciple" ADD CONSTRAINT "TaskSubPrinciple_subPrincipleId_fkey" FOREIGN KEY ("subPrincipleId") REFERENCES "SubPrinciple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Microcycle" ADD CONSTRAINT "Microcycle_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Microcycle" ADD CONSTRAINT "Microcycle_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Microcycle" ADD CONSTRAINT "Microcycle_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrocycleMatch" ADD CONSTRAINT "MicrocycleMatch_microcycleId_fkey" FOREIGN KEY ("microcycleId") REFERENCES "Microcycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MicrocycleMatch" ADD CONSTRAINT "MicrocycleMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisIssue" ADD CONSTRAINT "DiagnosisIssue_microcycleId_fkey" FOREIGN KEY ("microcycleId") REFERENCES "Microcycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosisIssue" ADD CONSTRAINT "DiagnosisIssue_subPrincipleId_fkey" FOREIGN KEY ("subPrincipleId") REFERENCES "SubPrinciple"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_microcycleId_fkey" FOREIGN KEY ("microcycleId") REFERENCES "Microcycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTask" ADD CONSTRAINT "SessionTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTask" ADD CONSTRAINT "SessionTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTask" ADD CONSTRAINT "SessionTask_prescribedIssueId_fkey" FOREIGN KEY ("prescribedIssueId") REFERENCES "DiagnosisIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineRun" ADD CONSTRAINT "EngineRun_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineRun" ADD CONSTRAINT "EngineRun_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

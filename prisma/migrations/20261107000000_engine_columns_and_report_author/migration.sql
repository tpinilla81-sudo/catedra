-- DropForeignKey
ALTER TABLE "MatchReport" DROP CONSTRAINT "MatchReport_createdById_fkey";

-- AlterTable
ALTER TABLE "EngineRun" ADD COLUMN     "discarded" JSONB,
ADD COLUMN     "issuesJson" JSONB,
ADD COLUMN     "prescriptions" JSONB,
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'WEEKLY_PROPOSAL';

-- AlterTable
ALTER TABLE "MatchReport" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "EngineRun_microcycleId_idx" ON "EngineRun"("microcycleId");

-- AddForeignKey
ALTER TABLE "MatchReport" ADD CONSTRAINT "MatchReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


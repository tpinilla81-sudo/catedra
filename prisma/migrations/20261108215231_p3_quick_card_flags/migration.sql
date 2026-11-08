-- CreateEnum
CREATE TYPE "FatigueFlag" AS ENUM ('FRESH', 'HEAVY', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "ClinicalFlag" AS ENUM ('MINOR', 'FORCED_SUB');

-- CreateEnum
CREATE TYPE "TacticalFlag" AS ENUM ('EXPLOITING', 'STRUGGLING');

-- AlterTable
ALTER TABLE "LiveMatchEvaluation" ADD COLUMN     "clinicalFlag" "ClinicalFlag",
ADD COLUMN     "fatigueFlag" "FatigueFlag",
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "tacticalFlag" "TacticalFlag";

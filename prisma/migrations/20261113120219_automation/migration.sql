-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('REGULAR', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('ACTIVE', 'WAITING', 'COMPLETED', 'EXITED', 'FAILED');

-- AlterTable
ALTER TABLE "campaign" ADD COLUMN     "automationId" TEXT,
ADD COLUMN     "automationStepId" TEXT,
ADD COLUMN     "kind" "CampaignKind" NOT NULL DEFAULT 'REGULAR';

-- CreateTable
CREATE TABLE "automation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "allowReentry" BOOLEAN NOT NULL DEFAULT false,
    "triggerCursor" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "recipeId" TEXT,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_run" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "contactId" TEXT,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStepId" TEXT,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "occurrence" TEXT,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "automation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_log" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_workspaceId_createdAt_idx" ON "automation"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "automation_status_idx" ON "automation"("status");

-- CreateIndex
CREATE INDEX "automation_run_status_nextRunAt_idx" ON "automation_run"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "automation_run_automationId_status_idx" ON "automation_run"("automationId", "status");

-- CreateIndex
CREATE INDEX "automation_run_contactId_idx" ON "automation_run"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "automation_run_automationId_contactId_occurrence_key" ON "automation_run"("automationId", "contactId", "occurrence");

-- CreateIndex
CREATE INDEX "automation_log_runId_createdAt_idx" ON "automation_log"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_automationId_automationStepId_key" ON "campaign"("automationId", "automationStepId");

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation" ADD CONSTRAINT "automation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_log" ADD CONSTRAINT "automation_log_runId_fkey" FOREIGN KEY ("runId") REFERENCES "automation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('MANUAL', 'HARD_BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'IMPORT', 'ERASURE');

-- CreateEnum
CREATE TYPE "ConsentEventType" AS ENUM ('SUBSCRIBED', 'CONFIRMATION_SENT', 'CONFIRMED', 'UNSUBSCRIBED', 'RESUBSCRIBED', 'PREFERENCES_UPDATED', 'STATUS_CHANGED', 'ERASED');

-- AlterEnum
ALTER TYPE "ContactStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "optInSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contact_list" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "publicName" TEXT;

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "doubleOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "optInMessage" TEXT,
ADD COLUMN     "optInSenderId" TEXT,
ADD COLUMN     "optInSubject" TEXT;

-- CreateTable
CREATE TABLE "suppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "type" "ConsentEventType" NOT NULL,
    "source" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "detail" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppression_workspaceId_createdAt_idx" ON "suppression"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_workspaceId_email_key" ON "suppression"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "consent_event_workspaceId_createdAt_idx" ON "consent_event"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "consent_event_contactId_createdAt_idx" ON "consent_event"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_event" ADD CONSTRAINT "consent_event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_event" ADD CONSTRAINT "consent_event_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;


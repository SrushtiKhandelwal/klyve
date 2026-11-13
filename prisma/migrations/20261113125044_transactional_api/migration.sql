-- CreateEnum
CREATE TYPE "TransactionalStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED', 'BOUNCED', 'COMPLAINED');

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactional_email" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'api',
    "idempotencyKey" TEXT,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "contactId" TEXT,
    "senderId" TEXT,
    "providerId" TEXT,
    "templateId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT[],
    "metadata" JSONB,
    "status" "TransactionalStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactional_email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_key_keyHash_key" ON "api_key"("keyHash");

-- CreateIndex
CREATE INDEX "api_key_workspaceId_createdAt_idx" ON "api_key"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "transactional_email_status_nextAttemptAt_idx" ON "transactional_email"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "transactional_email_workspaceId_createdAt_idx" ON "transactional_email"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "transactional_email_apiKeyId_createdAt_idx" ON "transactional_email"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "transactional_email_providerMessageId_idx" ON "transactional_email"("providerMessageId");

-- CreateIndex
CREATE INDEX "transactional_email_contactId_idx" ON "transactional_email"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "transactional_email_workspaceId_idempotencyKey_key" ON "transactional_email"("workspaceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactional_email" ADD CONSTRAINT "transactional_email_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactional_email" ADD CONSTRAINT "transactional_email_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_key"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactional_email" ADD CONSTRAINT "transactional_email_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactional_email" ADD CONSTRAINT "transactional_email_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "sender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactional_email" ADD CONSTRAINT "transactional_email_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sending_provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactional_email" ADD CONSTRAINT "transactional_email_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;


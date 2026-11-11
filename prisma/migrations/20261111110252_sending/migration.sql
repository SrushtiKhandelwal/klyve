-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('SMTP', 'AMAZON_SES', 'RESEND', 'SENDGRID', 'MAILGUN', 'POSTMARK');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('UNTESTED', 'CONNECTED', 'FAILED');

-- CreateTable
CREATE TABLE "sending_provider" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "credentials" TEXT NOT NULL,
    "credentialsHint" JSONB NOT NULL DEFAULT '{}',
    "status" "ProviderStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "maxPerSecond" INTEGER NOT NULL DEFAULT 5,
    "dailyLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sending_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sender" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "replyTo" TEXT,
    "providerId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationCodeHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "verificationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sending_domain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dkimSelectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastResult" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sending_domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sending_provider_workspaceId_idx" ON "sending_provider"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "sending_provider_workspaceId_name_key" ON "sending_provider"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sender_workspaceId_email_key" ON "sender"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sending_domain_workspaceId_domain_key" ON "sending_domain"("workspaceId", "domain");

-- AddForeignKey
ALTER TABLE "sending_provider" ADD CONSTRAINT "sending_provider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender" ADD CONSTRAINT "sender_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender" ADD CONSTRAINT "sender_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "sending_provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sending_domain" ADD CONSTRAINT "sending_domain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED');

-- AlterTable
ALTER TABLE "campaign" ADD COLUMN     "bounceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complaintCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trackClicks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trackOpens" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unsubscribeCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "campaign_recipient" ADD COLUMN     "bounceType" TEXT,
ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complainedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "firstClickedAt" TIMESTAMP(3),
ADD COLUMN     "firstOpenedAt" TIMESTAMP(3),
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sending_provider" ADD COLUMN     "lastWebhookAt" TIMESTAMP(3),
ADD COLUMN     "webhookSecret" TEXT,
ADD COLUMN     "webhookToken" TEXT;

-- CreateTable
CREATE TABLE "campaign_link" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueClicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "EmailEventType" NOT NULL,
    "linkId" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_link_campaignId_position_key" ON "campaign_link"("campaignId", "position");

-- CreateIndex
CREATE INDEX "email_event_campaignId_type_createdAt_idx" ON "email_event"("campaignId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "email_event_recipientId_type_idx" ON "email_event"("recipientId", "type");

-- CreateIndex
CREATE INDEX "email_event_workspaceId_createdAt_idx" ON "email_event"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "campaign_recipient_providerMessageId_idx" ON "campaign_recipient"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "sending_provider_webhookToken_key" ON "sending_provider"("webhookToken");

-- AddForeignKey
ALTER TABLE "campaign_link" ADD CONSTRAINT "campaign_link_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "campaign_recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "campaign_link"("id") ON DELETE SET NULL ON UPDATE CASCADE;


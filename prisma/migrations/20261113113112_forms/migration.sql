-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "FormSubmissionResult" AS ENUM ('SUBSCRIBED', 'PENDING', 'ALREADY_SUBSCRIBED', 'NOT_RESUBSCRIBED', 'SUPPRESSED', 'SPAM');

-- CreateTable
CREATE TABLE "signup_form" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL,
    "listIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signup_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT,
    "result" "FormSubmissionResult" NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_form_publicId_key" ON "signup_form"("publicId");

-- CreateIndex
CREATE INDEX "signup_form_workspaceId_createdAt_idx" ON "signup_form"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "form_submission_formId_createdAt_idx" ON "form_submission"("formId", "createdAt");

-- AddForeignKey
ALTER TABLE "signup_form" ADD CONSTRAINT "signup_form_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "signup_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;


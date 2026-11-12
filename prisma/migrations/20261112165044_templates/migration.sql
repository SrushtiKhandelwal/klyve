-- CreateTable
CREATE TABLE "email_template" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "preheader" TEXT NOT NULL DEFAULT '',
    "starterId" TEXT,
    "document" JSONB NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#059669',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0f172a',
    "backgroundColor" TEXT NOT NULL DEFAULT '#f4f4f5',
    "textColor" TEXT NOT NULL DEFAULT '#27272a',
    "fontFamily" TEXT NOT NULL DEFAULT 'Arial, Helvetica, sans-serif',
    "address" TEXT NOT NULL DEFAULT '',
    "websiteUrl" TEXT,
    "socialLinks" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "storageKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_template_workspaceId_updatedAt_idx" ON "email_template"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "brand_kit_workspaceId_key" ON "brand_kit"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_storageKey_key" ON "media_asset"("storageKey");

-- CreateIndex
CREATE INDEX "media_asset_workspaceId_createdAt_idx" ON "media_asset"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

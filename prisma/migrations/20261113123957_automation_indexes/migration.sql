-- CreateIndex
CREATE INDEX "contact_workspaceId_confirmedAt_idx" ON "contact"("workspaceId", "confirmedAt");

-- CreateIndex
CREATE INDEX "list_membership_listId_addedAt_idx" ON "list_membership"("listId", "addedAt");


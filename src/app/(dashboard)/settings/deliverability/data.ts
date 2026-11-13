import "server-only";
import { db } from "@/lib/db";
import { getWorkspaceHealth, type WorkspaceHealth } from "@/lib/deliverability/health";

// Everything the Deliverability page shows, loaded in one go.
// `workspaceId` must come from requireActiveWorkspace().

export type DeliverabilityData = {
  health: WorkspaceHealth;
  postalAddressSet: boolean;
  doubleOptIn: boolean;
};

export async function getDeliverabilityData(workspaceId: string): Promise<DeliverabilityData> {
  const [health, brand, workspace] = await Promise.all([
    getWorkspaceHealth(workspaceId, { days: 30 }),
    db.brandKit.findUnique({ where: { workspaceId }, select: { address: true } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { doubleOptIn: true } }),
  ]);
  return {
    health,
    postalAddressSet: !!brand?.address.trim(),
    doubleOptIn: workspace?.doubleOptIn ?? false,
  };
}

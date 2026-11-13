import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { InviteActions } from "@/components/settings/team/invite-actions";
import { InviteDialog } from "@/components/settings/team/invite-dialog";
import { LeaveWorkspaceButton, MemberRoleSelect, RemoveMemberButton } from "@/components/settings/team/member-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, type DatePrefs } from "@/lib/format-date";
import { getCurrentUser } from "@/lib/session";
import { MAX_TEAM_SIZE, getTeam, type TeamInvite, type TeamMember } from "@/lib/team/invites";
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  canChangeRole,
  canInviteAs,
  canLeave,
  canManageTeam,
  canRemoveMember,
  invitableRoles,
  type Role,
} from "@/lib/team/roles";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";
import { getWorkspaceDatePrefs } from "@/lib/workspace-prefs";

export const metadata: Metadata = { title: "Team" };

// Settings → Team: who is in this workspace, open invites, and roles.
export default function TeamPage() {
  return (
    <PageContainer>
      <PageHeader title="Team" description="Invite people to work in this workspace with you, and choose what they can do." />
      <Suspense fallback={<TeamSkeleton />}>
        <TeamSection />
      </Suspense>
      <RolesExplained />
    </PageContainer>
  );
}

async function TeamSection() {
  const ws = await requireActiveWorkspace();
  const [user, team, prefs] = await Promise.all([getCurrentUser(), getTeam(ws.id), getWorkspaceDatePrefs(ws.id)]);
  const seatsUsed = team.members.length + team.invites.filter((i) => !i.expired).length;
  const full = seatsUsed >= MAX_TEAM_SIZE;
  const canManage = canManageTeam(ws.role);

  return (
    <>
      <section className="overflow-hidden rounded-xl border bg-white" aria-labelledby="members-title">
        <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="members-title" className="font-semibold text-zinc-900">
              Members ({team.members.length})
            </h2>
            <p className="text-sm text-zinc-500">
              {canManage
                ? full
                  ? `You've reached ${MAX_TEAM_SIZE} people (including open invites). Remove someone or cancel an invite to add more.`
                  : `${seatsUsed} of ${MAX_TEAM_SIZE} places used, including open invites.`
                : "Only the owner and admins can invite or remove people."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canLeave(ws.role) && <LeaveWorkspaceButton workspaceName={ws.name} />}
            {canManage && <InviteDialog roles={invitableRoles(ws.role)} disabled={full} />}
          </div>
        </div>
        <ul className="divide-y">
          {team.members.map((m) => (
            <MemberRow key={m.id} member={m} ws={ws} isSelf={m.userId === user?.id} prefs={prefs} />
          ))}
        </ul>
      </section>

      {team.invites.length > 0 && (
        <section className="overflow-hidden rounded-xl border bg-white" aria-labelledby="invites-title">
          <div className="border-b px-5 py-4">
            <h2 id="invites-title" className="font-semibold text-zinc-900">
              Invites waiting ({team.invites.length})
            </h2>
            <p className="text-sm text-zinc-500">People who were invited but haven&apos;t joined yet.</p>
          </div>
          <ul className="divide-y">
            {team.invites.map((i) => (
              <InviteRow key={i.id} invite={i} actorRole={ws.role} prefs={prefs} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function MemberRow({
  member: m,
  ws,
  isSelf,
  prefs,
}: {
  member: TeamMember;
  ws: ActiveWorkspace;
  isSelf: boolean;
  prefs: DatePrefs;
}) {
  const showRoleSelect = canChangeRole(ws.role, m.role, isSelf);
  const showRemove = canRemoveMember(ws.role, m.role, isSelf);

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-0.5">
        <p className="min-w-0 font-medium break-words text-zinc-900">
          {m.name || m.email}
          {isSelf && <span className="font-normal text-zinc-500"> (you)</span>}
        </p>
        <p className="text-sm break-all text-zinc-500">{m.email}</p>
        <p className="text-xs text-zinc-500">Joined {formatDate(m.joinedAt, prefs)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showRoleSelect && m.role !== "OWNER" ? (
          <MemberRoleSelect memberId={m.id} name={m.name || m.email} role={m.role} />
        ) : (
          <span className="w-28 text-sm text-zinc-700">{ROLE_LABELS[m.role]}</span>
        )}
        {showRemove ? (
          <RemoveMemberButton memberId={m.id} name={m.name || m.email} workspaceName={ws.name} />
        ) : (
          // Keeps the columns lined up when there's no button.
          <span className="size-7" aria-hidden />
        )}
      </div>
    </li>
  );
}

function InviteRow({ invite: i, actorRole, prefs }: { invite: TeamInvite; actorRole: Role; prefs: DatePrefs }) {
  const canAct = canInviteAs(actorRole, i.role);
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 gap-0.5">
        <p className="min-w-0 font-medium break-all text-zinc-900">{i.email}</p>
        <p className="text-xs text-zinc-500">
          {ROLE_LABELS[i.role]}
          {i.invitedByName ? ` · invited by ${i.invitedByName}` : ""} ·{" "}
          {i.expired ? (
            <span className="font-medium text-amber-700">expired {formatDate(i.expiresAt, prefs)}</span>
          ) : (
            <>expires {formatDate(i.expiresAt, prefs)}</>
          )}
        </p>
      </div>
      {canAct && <InviteActions inviteId={i.id} email={i.email} expired={i.expired} />}
    </li>
  );
}

function RolesExplained() {
  const roles: Role[] = ["OWNER", "ADMIN", "MEMBER"];
  return (
    <section aria-labelledby="roles-title" className="rounded-xl border bg-white px-5 py-4">
      <h2 id="roles-title" className="font-semibold text-zinc-900">
        What each role can do
      </h2>
      <dl className="mt-3 grid gap-2 text-sm">
        {roles.map((r) => (
          <div key={r} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
            <dt className="w-24 shrink-0 font-medium text-zinc-900">{ROLE_LABELS[r]}</dt>
            <dd className="text-zinc-600">{ROLE_DESCRIPTIONS[r]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-zinc-500">
        Each workspace has one owner: the person who created it. Only the owner can invite admins or change roles.
      </p>
    </section>
  );
}

function TeamSkeleton() {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b px-5 py-4 last:border-0">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      ))}
    </div>
  );
}

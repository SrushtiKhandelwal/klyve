"use client";

import { useState, useTransition } from "react";
import { Loader2, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/actions/profile";
import { RelativeTime } from "@/components/campaigns/local-time";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// "Where you're logged in": one row per device (browser) with a live login.

export type SessionRow = {
  id: string;
  device: string;
  ipAddress: string | null;
  /** ISO date of the last time this device used Klyve (updated about once a day). */
  lastActive: string;
  createdAt: string;
  current: boolean;
};

export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="flex flex-col">
      <ul className="divide-y">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid min-w-0 gap-0.5">
              <p className="font-medium text-zinc-900">
                {s.device}
                {s.current && <span className="font-normal text-emerald-700"> · This device</span>}
              </p>
              <p className="flex flex-wrap gap-x-3 text-xs text-zinc-500">
                <span>{describeIp(s.ipAddress)}</span>
                <span>
                  {s.current ? (
                    "Active now"
                  ) : (
                    <>
                      Last active <RelativeTime iso={s.lastActive} />
                    </>
                  )}
                </span>
                <span>
                  Logged in <RelativeTime iso={s.createdAt} />
                </span>
              </p>
            </div>
            {!s.current && <RevokeOneButton sessionId={s.id} device={s.device} />}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <div className="flex flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500">Don&apos;t recognise a device? Log it out, then change your password.</p>
          <RevokeOthersButton count={others} />
        </div>
      )}
    </div>
  );
}

function RevokeOneButton({ sessionId, device }: { sessionId: string; device: string }) {
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      try {
        const result = await revokeSessionAction(sessionId);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`${device} was logged out.`);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={revoke} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOutIcon aria-hidden />}
      Log out
    </Button>
  );
}

function RevokeOthersButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function revokeAll() {
    startTransition(async () => {
      try {
        const result = await revokeOtherSessionsAction();
        if (!result.ok) return void toast.error(result.error);
        toast.success("All your other devices were logged out.");
        setOpen(false);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" className="shrink-0" />}>
        Log out of all other devices
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out of {count === 1 ? "your other device" : `${count} other devices`}?</AlertDialogTitle>
          <AlertDialogDescription>
            You stay logged in here. Everywhere else, you (or whoever is using that device) will have to log in again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revokeAll} disabled={pending}>
            {pending ? "Logging out…" : "Log them out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "IP address 203.0.113.7", or a plain-words note for local/unknown addresses. */
function describeIp(ip: string | null): string {
  if (!ip) return "IP address unknown";
  // Logins from the same computer the server runs on (local development).
  const local = ip === "::1" || ip.startsWith("127.") || ip === "::ffff:127.0.0.1" || /^[0:]+(:0*1)?$/.test(ip);
  return local ? "This computer (local)" : `IP address ${ip}`;
}

import type { TransactionalStatusName } from "@/lib/transactional/schema";

// Plain, serialisable shapes passed from the server pages to the client
// components of the Transactional screens.

/** The filters of the logs list (they live in the URL). */
export type LogFilters = {
  status: TransactionalStatusName | null;
  /** API key id. */
  key: string | null;
  /** Exact recipient address. */
  to: string | null;
  tag: string | null;
};

/** One row of the logs list. */
export type EmailRowView = {
  id: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: TransactionalStatusName;
  tags: string[];
  /** Name of the API key that sent it (null for dashboard tests or a deleted key). */
  keyName: string | null;
  fromDashboard: boolean;
  /** ISO date. */
  createdAt: string;
};

export type KeyChoice = { id: string; name: string; revoked: boolean };

/** What the "Send a test email" dialog can offer. */
export type TestSendOptions = {
  senders: { id: string; label: string }[];
  templates: { id: string; name: string; subject: string }[];
  /** The logged-in user's address: the default "to". */
  defaultTo: string;
};

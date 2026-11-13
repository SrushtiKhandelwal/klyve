import { redirect } from "next/navigation";

// /docs on its own has nothing yet: send people to the API docs.
export default function DocsIndex() {
  redirect("/docs/api");
}

import { publicApiRoute } from "@/lib/api/handler";
import { apiError } from "@/lib/api/respond";

// Any /api/v1/... address that isn't a real endpoint: a JSON 404 (instead of
// the website's HTML "page not found"), whatever the method. No API key is
// checked, so this reveals nothing.

const notFound = publicApiRoute(() =>
  apiError("not_found", "There's no API endpoint at this address. Check the URL against the API docs."),
);

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };

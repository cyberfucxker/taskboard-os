import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Old /deals route — now served by /clients. Redirect for stale bookmarks/links. */
export default function DealsRedirect() {
  redirect("/clients");
}
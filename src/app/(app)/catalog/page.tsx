import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Old /catalog route — now served by /projects. Redirect for stale bookmarks/links. */
export default function CatalogRedirect() {
  redirect("/projects");
}
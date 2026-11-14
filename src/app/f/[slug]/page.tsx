import type { Metadata } from "next";
import { PublicForm } from "@/crm-ui/pages/public/PublicForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact Acme Inc",
  robots: { index: false, follow: false },
};

/**
 * Visitor-facing CRM lead form at /f/<slug> — outside the (app) group, so no sign-in.
 * `?embed=1` drops the page padding for the iframe embed. Submits to
 * `/api/crm/forms/public/:slug/submit`.
 */
export default function PublicFormPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  return <PublicForm slug={params.slug} isEmbed={searchParams.embed === "1"} />;
}

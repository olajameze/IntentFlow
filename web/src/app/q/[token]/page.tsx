import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { QualifyChat } from "./qualify-chat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: { token: string } };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = params.token?.trim() ?? "";
  if (!UUID_RE.test(token)) return { title: "Qualification not found" };
  return { title: "Quick qualification" };
}

export default function QualifyPage({ params }: Props) {
  const token = params.token?.trim() ?? "";
  if (!UUID_RE.test(token)) notFound();
  return <QualifyChat token={token} />;
}

import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { OpenClawConnectClaim } from "@/components/openclaw-connect-claim";
import { getOpenClawConnectSessionPublic } from "@/lib/connect-sessions";

type OpenClawConnectPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OpenClawConnectPage(props: OpenClawConnectPageProps) {
  const params = (await props.searchParams) ?? {};
  const rawConnectId = params.connectId;
  const connectId =
    typeof rawConnectId === "string"
      ? rawConnectId
      : Array.isArray(rawConnectId)
        ? rawConnectId[0]
        : "";

  if (!connectId) {
    notFound();
  }

  const session = await getOpenClawConnectSessionPublic(connectId);
  if (!session) {
    notFound();
  }

  const authState = await auth();
  if (!authState.userId) {
    authState.redirectToSignIn({
      returnBackUrl: `/connect/openclaw?connectId=${encodeURIComponent(connectId)}`,
    });
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12">
      <OpenClawConnectClaim
        connectId={session.connectId}
        expiresAt={session.expiresAt}
        initialStatus={session.status}
        installationId={session.installationId}
        installationName={session.installationName}
        namespaceHint={session.namespaceHint}
        userCode={session.userCode}
      />
    </main>
  );
}

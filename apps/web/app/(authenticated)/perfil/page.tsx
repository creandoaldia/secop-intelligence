import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ConnectButton } from "@/components/linkedin/connect-button";
import { ConnectedStatus } from "@/components/linkedin/connected-status";
import { SettingsIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await db
    .select({
      linkedinProfileId: users.linkedinProfileId,
      name: users.name,
      email: users.email,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();

  if (!user) redirect("/login");

  const isLinkedInConnected = !!user.linkedinProfileId;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <SettingsIcon className="size-5" />
          Perfil
        </h1>
        <p className="text-sm text-muted-foreground">
          Configuracion de tu cuenta y conexiones
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Informacion Personal</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre</span>
                <span className="font-medium">{user.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium capitalize">{user.plan}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ConnectedStatus profileId={user.linkedinProfileId} />
          <ConnectButton isConnected={isLinkedInConnected} />
        </div>
      </div>
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { senaProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ProfileList } from "@/components/sena/profile-list";
import { ProfileForm } from "@/components/sena/profile-form";
import { UsersIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SenaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const profiles = await db
    .select()
    .from(senaProfiles)
    .where(eq(senaProfiles.userId, session.user.id))
    .all();

  const parsed = profiles.map((p) => ({
    ...p,
    habilidades: JSON.parse(p.habilidades ?? "[]") as string[],
    fuente: (p.fuente ?? "manual") as "sena_api" | "manual",
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <UsersIcon className="size-5" />
            Perfiles SENA
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los perfiles de aprendices SENA para matching con procesos
          </p>
        </div>
        <ProfileForm />
      </div>

      <ProfileList profiles={parsed} />
    </div>
  );
}

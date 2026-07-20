import { auth, canUseFeature } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { senaProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/shared/page-header";
import { ProfileList } from "@/components/sena/profile-list";
import { ProfileForm } from "@/components/sena/profile-form";

export const dynamic = "force-dynamic";

export default async function SenaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const hasSenaAccess = canUseFeature(session.user.plan ?? "free", "sena_ilimitado");

  if (!hasSenaAccess) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Perfiles SENA"
          description="Gestiona los perfiles de aprendices SENA para matching con procesos"
        />
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-muted-foreground mb-4">
            Esta funcionalidad requiere el plan Pro o superior.
          </p>
          <a
            href="/planes"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Ver planes
          </a>
        </div>
      </div>
    );
  }

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
      <PageHeader
        title="Perfiles SENA"
        description="Gestiona los perfiles de aprendices SENA para matching con procesos"
        action={<ProfileForm />}
      />

      <ProfileList profiles={parsed} />
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { SubscriptionManager } from "@/components/subscriptions/subscription-manager";
import { CreditCardIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuscripcionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)
    .get();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <CreditCardIcon className="size-5" />
          Suscripcion
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestiona tu plan y metodo de pago
        </p>
      </div>

      <SubscriptionManager
        subscription={subscription ?? null}
        currentPlan={session.user.plan ?? "free"}
      />
    </div>
  );
}

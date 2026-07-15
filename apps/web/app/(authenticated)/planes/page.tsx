import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PricingCards } from "@/components/planes/pricing-cards";
import { PlanFeatures } from "@/components/planes/plan-features";
import { CreditCardIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PlanesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <CreditCardIcon className="size-5" />
          Planes y Precios
        </h1>
        <p className="text-sm text-muted-foreground">
          Elige el plan que mejor se adapte a tus necesidades
        </p>
      </div>

      <PricingCards currentPlan={session.user.plan ?? "free"} />

      <div className="space-y-4">
        <h2 className="text-base font-semibold">Comparativa de Planes</h2>
        <PlanFeatures />
      </div>
    </div>
  );
}

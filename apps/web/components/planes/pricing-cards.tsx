"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  price: string;
  priceSubtext: string;
  pages: number;
  features: string[];
  highlighted?: boolean;
}

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceSubtext: "Siempre gratis",
    pages: 10,
    features: [
      "10 paginas de pliegos/mes",
      "Busqueda de procesos SECOP",
      "Alertas basicas",
      "Dashboard basico",
    ],
  },
  {
    id: "basic",
    name: "Basic",
    price: "$49.000",
    priceSubtext: "/mes",
    pages: 600,
    features: [
      "600 paginas de pliegos/mes",
      "Analisis IA de pliegos",
      "Alertas avanzadas",
      "Exportacion de datos",
    ],
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$149.000",
    priceSubtext: "/mes",
    pages: 3000,
    features: [
      "3000 paginas de pliegos/mes",
      "Analisis IA completo",
      "Integracion LinkedIn",
      "Perfiles SENA ilimitados",
      "Soporte prioritario",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$399.000",
    priceSubtext: "/mes",
    pages: 10000,
    features: [
      "10.000 paginas de pliegos/mes",
      "Todo lo de Pro",
      "API de datos SECOP",
      "Asistente dedicado",
      "Capacitacion personalizada",
    ],
  },
];

interface PricingCardsProps {
  currentPlan: string;
}

export function PricingCards({ currentPlan }: PricingCardsProps) {
  const router = useRouter();

  async function handleSelectPlan(planId: string) {
    if (planId === "free") return;
    if (currentPlan === planId) return;

    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear suscripcion");
      }

      router.push("/suscripcion");
      router.refresh();
    } catch (err) {
      console.error("Error selecting plan:", err);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      {plans.map((plan) => {
        const isCurrent = currentPlan === plan.id;
        return (
          <Card
            key={plan.id}
            size="sm"
            className={cn(
              "relative flex flex-col",
              plan.highlighted && "ring-2 ring-primary",
              isCurrent && "ring-2 ring-emerald-500"
            )}
          >
            {plan.highlighted && (
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                Mas popular
              </Badge>
            )}
            {isCurrent && (
              <Badge
                variant="secondary"
                className="absolute -top-2.5 left-1/2 -translate-x-1/2"
              >
                Plan actual
              </Badge>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>
                <span className="text-2xl font-bold text-foreground">
                  {plan.price}
                </span>
                <span className="ml-1 text-muted-foreground">
                  {plan.priceSubtext}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="mb-3 text-xs text-muted-foreground">
                {plan.pages.toLocaleString("es-CO")} paginas/mes
              </p>
              <ul className="space-y-2">
                {plan.features.map((feature, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <CheckIcon className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={isCurrent ? "outline" : plan.highlighted ? "default" : "outline"}
                disabled={isCurrent}
                onClick={() => handleSelectPlan(plan.id)}
              >
                {isCurrent
                  ? "Plan actual"
                  : plan.id === "free"
                  ? "Gratis"
                  : "Seleccionar"}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

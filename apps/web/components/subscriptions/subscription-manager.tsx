"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CreditCardIcon,
  ArrowRightIcon,
  BanIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "lucide-react";

interface Subscription {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: number | Date | null;
  currentPeriodEnd: number | Date | null;
  pagesAllocated: number;
}

interface SubscriptionManagerProps {
  subscription: Subscription | null;
  currentPlan: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activa", variant: "default" },
  paused: { label: "Pausada", variant: "secondary" },
  cancelled: { label: "Cancelada", variant: "destructive" },
  expired: { label: "Expirada", variant: "outline" },
};

export function SubscriptionManager({
  subscription,
  currentPlan,
}: SubscriptionManagerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleCancel() {
    if (!subscription || !confirm("Cancelar suscripcion? Perderas acceso a funciones premium al final del periodo.")) return;

    setLoading("cancel");
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });

      if (!res.ok) throw new Error("Error al cancelar");
      router.refresh();
    } catch (err) {
      console.error("Error cancelling subscription:", err);
    } finally {
      setLoading(null);
    }
  }

  function formatDate(ts: number | Date | null): string {
    if (!ts) return "—";
    const d = ts instanceof Date ? ts : new Date(ts * 1000);
    return d.toLocaleDateString("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CreditCardIcon className="size-4" />
            Sin Suscripcion Activa
          </CardTitle>
          <CardDescription>
            Actualmente estas en el plan Free
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Actualiza a un plan pago para acceder a analisis IA, integracion
            LinkedIn, y mas funciones.
          </p>
        </CardContent>
        <CardFooter>
          <Button size="sm" onClick={() => router.push("/planes")}>
            Ver Planes
            <ArrowRightIcon className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const statusInfo = statusConfig[subscription.status] ?? statusConfig.expired;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CreditCardIcon className="size-4" />
            Detalles de la Suscripcion
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium capitalize">{subscription.plan}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estado</span>
            <Badge variant={statusInfo.variant} className="text-[10px]">
              {statusInfo.label}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Inicio</span>
            <span className="font-medium">
              {formatDate(subscription.currentPeriodStart)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Proximo cobro</span>
            <span className="font-medium">
              {formatDate(subscription.currentPeriodEnd)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paginas asignadas</span>
            <span className="font-medium">
              {subscription.pagesAllocated.toLocaleString("es-CO")}/mes
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BanIcon className="size-4" />
            Administrar Suscripcion
          </CardTitle>
          <CardDescription>
            Cambia de plan o cancela tu suscripcion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => router.push("/planes")}
          >
            <ArrowRightIcon className="size-4" />
            Cambiar de Plan
          </Button>

          {subscription.status === "active" && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full justify-start"
              onClick={handleCancel}
              disabled={loading === "cancel"}
            >
              {loading === "cancel" ? (
                "Cancelando..."
              ) : (
                <>
                  <XCircleIcon className="size-4" />
                  Cancelar Suscripcion
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

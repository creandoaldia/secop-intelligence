import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WelcomeBannerProps {
  user: {
    name?: string | null;
    plan?: string | null;
    pagesUsed?: number | null;
    planExpiresAt?: number | null;
  };
}

const planLimits: Record<string, number> = {
  free: 10,
  basic: 600,
  pro: 3000,
  premium: 10000,
};

export function WelcomeBanner({ user }: WelcomeBannerProps) {
  const limit = planLimits[user.plan ?? "free"] ?? 0;
  const pagesUsed = user.pagesUsed ?? 0;
  const expiresAt = user.planExpiresAt
    ? new Date(user.planExpiresAt * 1000).toLocaleDateString("es-CO")
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Bienvenido, {user.name ?? "Usuario"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary">
          Plan {user.plan ?? "free"}
        </span>
        <span className="text-muted-foreground">
          Paginas usadas: {pagesUsed} / {limit}
        </span>
        {expiresAt && (
          <span className="text-muted-foreground">
            Vence: {expiresAt}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

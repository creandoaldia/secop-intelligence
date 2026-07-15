import { db } from "@/lib/db";
import { procesos } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const formatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const estadoVariant: Record<string, "default" | "secondary" | "outline"> = {
  Adjudicado: "default",
  "En curso": "secondary",
};

function formatCOP(valor: number | null): string {
  if (valor === null) return "—";
  return formatter.format(valor);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

export async function RecentProcesos() {
  const rows = await db
    .select({
      id: procesos.id,
      nombre: procesos.nombre,
      entidadNombre: procesos.entidadNombre,
      valor: procesos.valor,
      estado: procesos.estado,
    })
    .from(procesos)
    .orderBy(desc(procesos.fechaPublicacion))
    .limit(10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Procesos Recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Nombre</TableHead>
              <TableHead className="w-[25%]">Entidad</TableHead>
              <TableHead className="w-[20%]">Valor</TableHead>
              <TableHead className="w-[20%]">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No hay procesos registrados
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {truncate(row.nombre, 50)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.entidadNombre ?? "—"}
                  </TableCell>
                  <TableCell>{formatCOP(row.valor)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={estadoVariant[row.estado ?? ""] ?? "outline"}
                    >
                      {row.estado ?? "Sin estado"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

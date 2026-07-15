import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function ProcesoNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <FileQuestion className="h-16 w-16 text-muted-foreground" />
      <h2 className="text-xl font-semibold">Proceso no encontrado</h2>
      <p className="text-muted-foreground max-w-md">
        El proceso que buscas no existe o ha sido eliminado.
      </p>
      <Link
        href="/procesos"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Volver a procesos
      </Link>
    </div>
  );
}

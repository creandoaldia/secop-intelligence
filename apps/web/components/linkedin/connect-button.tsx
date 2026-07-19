"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Link2Icon, Link2OffIcon } from "lucide-react";

interface ConnectButtonProps {
  isConnected: boolean;
}

export function ConnectButton({ isConnected }: ConnectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/linkedin/auth");
      if (!res.ok) throw new Error("Error al obtener URL de autenticacion");

      const data = await res.json();
      if (process.env.NODE_ENV === "development") {
        // In mock mode, exchange a fake code directly
        const tokenRes = await fetch("/api/linkedin/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "mock_authorization_code" }),
        });

        if (!tokenRes.ok) throw new Error("Error al conectar LinkedIn");
      } else {
        // Real flow: redirect to LinkedIn OAuth
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error("No se pudo obtener la URL de autenticacion");
      }
      router.refresh();
    } catch (err) {
      console.error("Error connecting LinkedIn:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);

    try {
      const res = await fetch("/api/linkedin/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error("Error al desconectar");
      router.refresh();
    } catch (err) {
      console.error("Error disconnecting LinkedIn:", err);
    } finally {
      setLoading(false);
    }
  }

  if (isConnected) {
    return (
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogTrigger>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <Link2OffIcon className="size-4" />
            {loading ? "Desconectando..." : "Desconectar LinkedIn"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar LinkedIn</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara la conexion con LinkedIn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleConnect}
      disabled={loading}
    >
      <Link2Icon className="size-4" />
      {loading ? "Conectando..." : "Conectar LinkedIn"}
    </Button>
  );
}

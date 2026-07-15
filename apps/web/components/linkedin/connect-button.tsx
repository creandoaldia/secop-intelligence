"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Link2Icon, Link2OffIcon } from "lucide-react";

interface ConnectButtonProps {
  isConnected: boolean;
}

export function ConnectButton({ isConnected }: ConnectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/linkedin/auth");
      if (!res.ok) throw new Error("Error al obtener URL de autenticacion");

      const data = await res.json();
      // In mock mode, exchange a fake code directly
      const tokenRes = await fetch("/api/linkedin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "mock_authorization_code" }),
      });

      if (!tokenRes.ok) throw new Error("Error al conectar LinkedIn");
      router.refresh();
    } catch (err) {
      console.error("Error connecting LinkedIn:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar LinkedIn?")) return;
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
      <Button
        variant="outline"
        size="sm"
        onClick={handleDisconnect}
        disabled={loading}
      >
        <Link2OffIcon className="size-4" />
        {loading ? "Desconectando..." : "Desconectar LinkedIn"}
      </Button>
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

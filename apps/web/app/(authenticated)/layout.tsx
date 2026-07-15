import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar user={session.user} />
      <div className="flex flex-1 flex-col">
        <Header user={session.user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

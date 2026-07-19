import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDbStats } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const stats = getDbStats()
    return NextResponse.json({
      totalUsers: stats.totalUsuarios,
      totalProcesos: stats.totalProcesos,
      totalAnalysis: stats.totalAnalisis,
    })
  } catch {
    return NextResponse.json({ error: "Error fetching stats" }, { status: 500 })
  }
}

import Link from "next/link";
import { AdminGuard } from "../../components/guards";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4">
          <p className="text-xs uppercase text-[var(--muted)]">Admin</p>
          <h1 className="text-2xl font-semibold">Control center</h1>
        </div>
        <div className="grid gap-6 lg:grid-cols-[200px,1fr]">
          <aside className="space-y-2 text-sm">
            <Link href="/admin/courses" className="block rounded-md bg-[var(--surface)] px-3 py-2 font-semibold text-[var(--text)]">
              Courses
            </Link>
          </aside>
          <div>{children}</div>
        </div>
      </div>
    </AdminGuard>
  );
}

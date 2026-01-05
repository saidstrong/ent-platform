import { RequireAdmin, RequireAuth } from "../../components/guards";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RequireAdmin>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-4">
            <p className="text-xs uppercase text-neutral-500">Admin</p>
            <h1 className="text-2xl font-semibold">Control center</h1>
          </div>
          {children}
        </div>
      </RequireAdmin>
    </RequireAuth>
  );
}

'use client';

import Link from "next/link";
import Card from "../../components/ui/card";

export default function AdminHome() {
  const links = [
    { href: "/admin/courses", label: "Courses" },
    { href: "/admin/payments", label: "Payments" },
    { href: "/admin/submissions", label: "Submissions" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {links.map((l) => (
        <Link key={l.href} href={l.href}>
          <Card className="h-full cursor-pointer transition hover:-translate-y-1 hover:shadow-md">
            <p className="text-sm font-semibold text-[var(--text)]">Admin</p>
            <h2 className="text-xl font-semibold">{l.label}</h2>
            <p className="text-sm text-[var(--muted)]">Manage {l.label.toLowerCase()}.</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

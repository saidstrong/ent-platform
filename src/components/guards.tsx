'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { getActiveEnrollment } from "../lib/data";
import { useAuth, isAdmin, isTeacher } from "../lib/auth-context";
import type { Enrollment } from "../lib/types";
import Card from "./ui/card";
import Button from "./ui/button";

export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <p className="px-4 py-6 text-sm text-neutral-600">Loading...</p>;
  if (!user) {
    return (
      <Card className="m-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">Login required</p>
          <p className="text-sm text-neutral-600">Please login to continue.</p>
        </div>
        <Link href="/login">
          <Button>Login</Button>
        </Link>
      </Card>
    );
  }
  return <>{children}</>;
};

export const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  if (loading) return <p className="px-4 py-6 text-sm text-neutral-600">Loading...</p>;
  if (!user) {
    return (
      <Card className="m-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">Login required</p>
          <p className="text-sm text-neutral-600">Please login to continue.</p>
        </div>
        <Link href="/login">
          <Button>Login</Button>
        </Link>
      </Card>
    );
  }
  if (!isAdmin(profile?.role)) {
    return (
      <Card className="m-4">
        <p className="text-sm text-neutral-600">Admin access required.</p>
      </Card>
    );
  }
  return <>{children}</>;
};

export const RequireTeacherOrAdmin = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading } = useAuth();
  if (loading) return <p className="px-4 py-6 text-sm text-neutral-600">Loading...</p>;
  if (!isAdmin(profile?.role) && !isTeacher(profile?.role)) {
    return (
      <Card className="m-4">
        <p className="text-sm text-neutral-600">Teacher access required.</p>
      </Card>
    );
  }
  return <>{children}</>;
};

export const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  // Admin-only guard for /admin routes.
  return (
    <RequireAuth>
      <RequireAdmin>{children}</RequireAdmin>
    </RequireAuth>
  );
};

export const RequireEnrollment = ({ courseId, children }: { courseId: string; children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const run = async () => {
      if (isAdmin(profile?.role) || isTeacher(profile?.role)) {
        setChecking(false);
        return;
      }
      try {
        const enroll = await getActiveEnrollment(user.uid, courseId);
        if (active) setEnrollment(enroll);
      } finally {
        if (active) setChecking(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [courseId, user, profile?.role]);

  if (loading || checking) return <p className="px-4 py-6 text-sm text-neutral-600">Checking enrollment...</p>;
  if (!user) {
    return (
      <Card className="m-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">Login required</p>
          <p className="text-sm text-neutral-600">Please login to access lessons.</p>
        </div>
        <Link href="/login">
          <Button>Login</Button>
        </Link>
      </Card>
    );
  }
  if (!enrollment && !isAdmin(profile?.role) && !isTeacher(profile?.role)) {
    return (
      <Card className="m-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">Active enrollment required</p>
          <p className="text-sm text-neutral-600">Buy the course to unlock lessons.</p>
        </div>
        <Link href={`/checkout/${courseId}`}>
          <Button>Buy access</Button>
        </Link>
      </Card>
    );
  }
  return <>{children}</>;
};

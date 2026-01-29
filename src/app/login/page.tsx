'use client';

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import Input from "../../components/ui/input";
import { useAuth } from "../../lib/auth-context";
import { useI18n } from "../../lib/i18n";

const LoginForm = () => {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push(next);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("errors.loadFailed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t("auth.loginTitle")}</h1>
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="text-sm font-medium text-neutral-700">{t("auth.email")}</label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700">{t("auth.password")}</label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </Card>
      <p className="text-sm text-neutral-600">
        {t("auth.noAccount")}{" "}
        <Link className="font-semibold text-blue-700" href="/signup">
          {t("auth.signUp")}
        </Link>
      </p>
    </div>
  );
};

export default function LoginPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<p className="px-4 py-10 text-sm text-neutral-600">{t("auth.loading")}</p>}>
      <LoginForm />
    </Suspense>
  );
}

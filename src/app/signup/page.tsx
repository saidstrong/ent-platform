'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "../../components/ui/button";
import Card from "../../components/ui/card";
import Input from "../../components/ui/input";
import Select from "../../components/ui/select";
import { useAuth } from "../../lib/auth-context";
import { useI18n } from "../../lib/i18n";
import type { Language } from "../../lib/types";

export default function SignupPage() {
  const { signup } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lang, setLang] = useState<Language>("kz");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup({ email, password, displayName, lang });
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("errors.loadFailed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{t("auth.signupTitle")}</h1>
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="text-sm font-medium text-neutral-700">{t("auth.fullName")}</label>
            <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Aruzhan Aman" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700">{t("auth.email")}</label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700">{t("auth.password")}</label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700">{t("auth.preferredLanguage")}</label>
            <Select value={lang} onChange={(e) => setLang(e.target.value as Language)}>
              <option value="kz">KZ</option>
              <option value="en">EN</option>
            </Select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? t("auth.creating") : t("auth.signupTitle")}
          </Button>
        </form>
      </Card>
      <p className="text-sm text-neutral-600">
        {t("auth.haveAccount")}{" "}
        <Link className="font-semibold text-blue-700" href="/login">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}

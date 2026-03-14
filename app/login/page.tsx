"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/app");
    }
  }, [loading, router, user]);

  const handleSuccess = () => {
    router.replace("/app");
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Routine Calendar
            </h1>
            <p className="text-sm text-zinc-600">
              月カレンダーで毎日のルーティンを可視化
            </p>
          </div>
          <GoogleLoginButton
            onSuccess={handleSuccess}
            onError={setErrorMessage}
            disabled={loading}
            className="w-full"
          />
          {errorMessage ? (
            <div className="text-xs text-red-600">{errorMessage}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

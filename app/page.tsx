"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";

export default function Home() {
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-900">
      <main className="w-full max-w-2xl space-y-6 rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Routine Calendar
          </h1>
          <p className="text-sm text-zinc-600">
            月カレンダーとカテゴリで、毎日のルーティンをひと目で。
          </p>
        </div>
        <GoogleLoginButton
          onSuccess={handleSuccess}
          onError={setErrorMessage}
          disabled={loading}
          className="w-full sm:w-auto"
        />
        {errorMessage ? (
          <div className="text-xs text-red-600">{errorMessage}</div>
        ) : null}
      </main>
    </div>
  );
}

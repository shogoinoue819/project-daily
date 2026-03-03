"use client";

import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/app");
    }
  }, [loading, router, user]);

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        await getRedirectResult(auth);
      } catch (error) {
        setErrorMessage("ログインに失敗しました。もう一度お試しください。");
        console.error(error);
      }
    };

    handleRedirect();
  }, []);

  const handleLogin = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      router.replace("/app");
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithRedirect(auth, provider);
        return;
      }
      setErrorMessage("ログインに失敗しました。もう一度お試しください。");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Login
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              project-dailyへようこそ
            </h1>
            <p className="text-sm text-zinc-600">
              Googleログインのみ対応予定。フェーズ2で認証を接続します。
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogin}
            disabled={submitting || loading}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {submitting ? "ログイン中..." : "Googleでログイン"}
          </button>
          {errorMessage ? (
            <div className="text-xs text-red-600">{errorMessage}</div>
          ) : (
            <div className="text-xs text-zinc-500">
              Googleアカウントでログインします。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

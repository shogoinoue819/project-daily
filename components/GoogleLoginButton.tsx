"use client";

import { GoogleLogin } from "@react-oauth/google";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type Props = {
  onSuccess?: () => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * GSI（Google Identity Services）を使用したログインボタン。
 * signInWithRedirect を使わないため、Safari のストレージ分離環境でも動作する。
 */
export function GoogleLoginButton({
  onSuccess,
  onError,
  disabled,
  className = "",
}: Props) {
  if (!clientId) {
    return (
      <div className={className}>
        <p className="text-sm text-amber-600">
          ログイン機能の設定が完了していません。NEXT_PUBLIC_GOOGLE_CLIENT_ID
          を設定してください。
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex justify-center ${className}`.trim()}
      style={disabled ? { opacity: 0.6, pointerEvents: "none" as const } : undefined}
    >
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          const idToken = credentialResponse.credential;
          if (!idToken) {
            onError?.("ログインに失敗しました。もう一度お試しください。");
            return;
          }
          try {
            const credential = GoogleAuthProvider.credential(idToken);
            await signInWithCredential(auth, credential);
            onSuccess?.();
          } catch (error) {
            console.error(error);
            onError?.("ログインに失敗しました。もう一度お試しください。");
          }
        }}
        onError={() => {
          onError?.("ログインに失敗しました。もう一度お試しください。");
        }}
        theme="filled_black"
        size="large"
        width="280"
        text="signin_with"
        shape="pill"
        useOneTap={false}
      />
    </div>
  );
}

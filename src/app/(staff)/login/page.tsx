import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { safeNextPath } from "@/lib/auth/redirect";
import { LOGIN_NOTICES } from "@/lib/auth/sign-in-messages";
import { site } from "@/lib/site";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
  manifest: "/dashboard.webmanifest",
  appleWebApp: { capable: true, title: `${site.shortName} Dashboard`, statusBarStyle: "default" },
};

async function LoginFormWithParams({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const message = typeof params.message === "string" ? (LOGIN_NOTICES[params.message] ?? null) : null;
  return <LoginForm next={next} notice={message} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/brand/badge-disc-160.webp" alt="" width={96} height={96} preload className="size-24" />
          <h1 className="mt-4 text-h2 font-extrabold">Staff sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">{site.name}</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Suspense fallback={<div className="h-72" aria-hidden />}>
            <LoginFormWithParams searchParams={searchParams} />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/" className="inline-flex min-h-11 items-center text-link underline underline-offset-4 hover:no-underline">
            Back to the website
          </Link>
        </p>
      </div>
    </main>
  );
}

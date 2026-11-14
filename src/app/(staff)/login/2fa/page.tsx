import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { checkStaff } from "@/lib/auth/staff";
import { safeNextPath } from "@/lib/auth/redirect";
import { site } from "@/lib/site";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false, follow: false } };

/** Only for a signed-in person whose account has two-step sign-in and who hasn't entered a code yet. */
async function Step({ searchParams }: { searchParams: PageProps<"/login/2fa">["searchParams"] }) {
  const next = safeNextPath((await searchParams).next);
  const check = await checkStaff();
  if (check.state === "signed_out") redirect("/login");
  if (check.state === "switched_off") redirect("/auth/signout?reason=switched_off");
  if (check.state === "ok") redirect(next);
  return <CodeForm next={next} />;
}

export default function TwoStepPage({ searchParams }: PageProps<"/login/2fa">) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/brand/badge-disc-160.webp" alt="" width={96} height={96} preload className="size-24" />
          <h1 className="mt-4 text-h2 font-extrabold">Two-step sign-in</h1>
          <p className="mt-1 text-sm text-muted-foreground">{site.name}</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Suspense fallback={<div className="h-56" aria-hidden />}>
            <Step searchParams={searchParams} />
          </Suspense>
        </div>
        <form action="/auth/signout" method="post" className="mt-6 text-center">
          <button type="submit" className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4 hover:no-underline">
            Use a different account
          </button>
        </form>
      </div>
    </main>
  );
}

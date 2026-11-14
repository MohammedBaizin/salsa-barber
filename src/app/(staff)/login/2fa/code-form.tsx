"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safely } from "@/lib/connection";
import { verifySignInCode, type CodeState } from "./actions";

const verifySafely = safely(verifySignInCode);

export function CodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(verifySafely, { error: null, attempt: 0 });
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          // A fresh, empty box after each wrong code.
          key={state.attempt}
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          autoFocus
          className="text-center font-mono text-2xl tracking-[0.4em]"
          aria-describedby="code-hint"
          aria-invalid={state.error ? true : undefined}
        />
        <p id="code-hint" className="text-sm text-muted-foreground">
          Open your authenticator app and enter the code it shows for this dashboard.
        </p>
      </div>
      <Button type="submit" variant="pop" size="lg" className="w-full" disabled={pending}>
        <ShieldCheck aria-hidden />
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}

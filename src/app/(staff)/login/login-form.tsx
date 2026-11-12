"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safely } from "@/lib/connection";
import { signIn, type SignInState } from "./actions";

const signInSafely = safely(signIn);

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInSafely, { error: null, username: "" });
  const [username, setUsername] = useState(state.username);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : notice ? (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm font-medium">
          {notice}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-12"
            aria-invalid={state.error ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        </div>
      </div>

      <Button type="submit" variant="pop" size="lg" className="w-full" disabled={pending}>
        <LogIn aria-hidden />
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

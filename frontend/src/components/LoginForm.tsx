import { useState, type FormEvent } from "react";

export type AuthMode = "sign-in" | "register";

type LoginFormProps = {
  // Resolves to an error message, or null on success.
  onSubmit: (mode: AuthMode, username: string, password: string) => Promise<string | null>;
};

export const inputClass =
  "rounded-xl border border-(--stroke) bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none transition focus:border-(--primary-blue)";
export const labelClass =
  "flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-(--gray-text)";

export const LoginForm = ({ onSubmit }: LoginFormProps) => {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const registering = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError((await onSubmit(mode, username, password)) ?? "");
  };

  const switchMode = () => {
    setMode(registering ? "sign-in" : "register");
    setError("");
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-4xl border border-(--stroke) bg-white/80 p-8 shadow-(--shadow)"
      >
        <div className="h-2 w-10 rounded-full bg-(--accent-yellow)" />
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {registering ? "Create account" : "Sign in"}
        </h1>
        <p className="text-sm text-(--gray-text)">
          {registering
            ? "Pick a username and a password of at least 8 characters."
            : "Sign in to open your Kanban boards."}
        </p>
        <label className={labelClass}>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className={inputClass}
            required
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={registering ? "new-password" : "current-password"}
            className={inputClass}
            required
          />
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="rounded-full bg-(--secondary-purple) px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {registering ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={switchMode}
          className="text-sm font-semibold text-(--primary-blue) hover:underline"
        >
          {registering ? "I already have an account" : "Create an account"}
        </button>
      </form>
    </main>
  );
};

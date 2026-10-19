import { useState, type FormEvent } from "react";

type LoginFormProps = {
  onLogin: (username: string, password: string) => Promise<boolean>;
};

const inputClass =
  "rounded-xl border border-(--stroke) bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground outline-none transition focus:border-(--primary-blue)";
const labelClass =
  "flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-(--gray-text)";

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onLogin(username, password);
    if (!ok) {
      setError("Invalid username or password");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-4xl border border-(--stroke) bg-white/80 p-8 shadow-(--shadow)"
      >
        <div className="h-2 w-10 rounded-full bg-(--accent-yellow)" />
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Sign in
        </h1>
        <p className="text-sm text-(--gray-text)">
          Sign in to open your Kanban board.
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
            autoComplete="current-password"
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
          Sign in
        </button>
      </form>
    </main>
  );
};

"use client";

import { useEffect, useState } from "react";
import { LoginForm, type AuthMode } from "@/components/LoginForm";
import { Workspace } from "@/components/Workspace";
import { api, ApiError, type User } from "@/lib/api";

const errorMessage = (mode: AuthMode, err: unknown) => {
  const status = err instanceof ApiError ? err.status : 0;
  if (mode === "sign-in" && status === 401) {
    return "Invalid username or password";
  }
  if (status === 409) {
    return "That username is taken";
  }
  if (status === 422) {
    return "Use 3 to 32 lowercase letters, digits, - or _, and a password of at least 8 characters.";
  }
  return "Could not reach the server. Please try again.";
};

export const AuthGate = () => {
  // undefined while checking the session, null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(setUser, () => setUser(null));
  }, []);

  const handleSubmit = async (mode: AuthMode, username: string, password: string) => {
    try {
      const call = mode === "sign-in" ? api.login : api.register;
      setUser(await call(username, password));
      return null;
    } catch (err) {
      return errorMessage(mode, err);
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  if (user === undefined) {
    return null;
  }
  if (user === null) {
    return <LoginForm onSubmit={handleSubmit} />;
  }
  // Also used when the session has expired or the account was deleted.
  return <Workspace key={user.id} user={user} onLogout={handleLogout} />;
};

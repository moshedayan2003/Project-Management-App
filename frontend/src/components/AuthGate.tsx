"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type Status = "loading" | "signed-out" | "signed-in";

export const AuthGate = () => {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    fetch("/api/me")
      .then((response) => setStatus(response.ok ? "signed-in" : "signed-out"))
      .catch(() => setStatus("signed-out"));
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (response.ok) {
      setStatus("signed-in");
    }
    return response.ok;
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setStatus("signed-out");
  };

  if (status === "loading") {
    return null;
  }
  if (status === "signed-out") {
    return <LoginForm onLogin={handleLogin} />;
  }
  return <KanbanBoard onLogout={handleLogout} />;
};

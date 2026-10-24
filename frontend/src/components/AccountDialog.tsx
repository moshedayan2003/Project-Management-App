import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { inputClass, labelClass } from "@/components/LoginForm";
import { api, ApiError } from "@/lib/api";

const buttonClass =
  "self-start rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110";

const statusOf = (err: unknown) => (err instanceof ApiError ? err.status : 0);

type AccountDialogProps = {
  username: string;
  onClose: () => void;
  onDeleted: () => void;
};

export const AccountDialog = ({ username, onClose, onDeleted }: AccountDialogProps) => {
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordMessage, setPasswordMessage] = useState({ text: "", ok: false });
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "" });
      setPasswordMessage({ text: "Password changed.", ok: true });
    } catch (err) {
      const status = statusOf(err);
      setPasswordMessage({
        text:
          status === 403
            ? "Your current password is wrong."
            : status === 422
              ? "The new password needs at least 8 characters."
              : "Could not change the password.",
        ok: false,
      });
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm("Delete your account and all your boards? This cannot be undone.")) {
      return;
    }
    try {
      await api.deleteAccount(deletePassword);
      onDeleted();
    } catch (err) {
      setDeleteError(
        statusOf(err) === 403 ? "Wrong password." : "Could not delete the account."
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-(--navy-dark)/30 p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="flex max-h-full w-full max-w-sm flex-col gap-6 overflow-y-auto rounded-3xl border border-(--stroke) bg-white p-6 shadow-(--shadow)"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="account-title" className="font-display text-xl font-semibold text-foreground">
              Account
            </h2>
            <p className="text-sm text-(--gray-text)">Signed in as {username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-(--gray-text) transition hover:bg-(--surface)"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={changePassword} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">Change password</h3>
          <label className={labelClass}>
            Current password
            <input
              type="password"
              value={passwords.current}
              onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
              autoComplete="current-password"
              className={inputClass}
              required
            />
          </label>
          <label className={labelClass}>
            New password
            <input
              type="password"
              value={passwords.next}
              onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </label>
          {passwordMessage.text && (
            <p
              role={passwordMessage.ok ? "status" : "alert"}
              className={`text-sm font-medium ${passwordMessage.ok ? "text-green-700" : "text-red-600"}`}
            >
              {passwordMessage.text}
            </p>
          )}
          <button type="submit" className={`${buttonClass} bg-(--secondary-purple)`}>
            Change password
          </button>
        </form>

        <form
          onSubmit={deleteAccount}
          className="flex flex-col gap-3 border-t border-(--stroke) pt-5"
        >
          <h3 className="text-sm font-semibold text-red-700">Delete account</h3>
          <p className="text-xs text-(--gray-text)">
            Removes your account and every board in it.
          </p>
          <label className={labelClass}>
            Password
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              className={inputClass}
              required
            />
          </label>
          {deleteError && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {deleteError}
            </p>
          )}
          <button type="submit" className={`${buttonClass} bg-red-600`}>
            Delete account
          </button>
        </form>
      </section>
    </div>
  );
};

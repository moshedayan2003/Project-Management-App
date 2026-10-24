import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

const fill = async (username: string, password: string) => {
  await userEvent.type(screen.getByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
};

describe("LoginForm", () => {
  it("submits the entered credentials to sign in", async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<LoginForm onSubmit={onSubmit} />);
    await fill("user", "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSubmit).toHaveBeenCalledWith("sign-in", "user", "password");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error it gets back", async () => {
    render(<LoginForm onSubmit={vi.fn().mockResolvedValue("Invalid username or password")} />);
    await fill("user", "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
  });

  it("switches to creating an account and back", async () => {
    const onSubmit = vi.fn().mockResolvedValue("That username is taken");
    render(<LoginForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autocomplete", "new-password");

    await fill("ann", "long password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(onSubmit).toHaveBeenCalledWith("register", "ann", "long password");
    expect(await screen.findByRole("alert")).toHaveTextContent("That username is taken");

    await userEvent.click(screen.getByRole("button", { name: "I already have an account" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

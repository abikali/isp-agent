import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../button";

describe("Button", () => {
	it("renders children correctly", () => {
		render(<Button>Click me</Button>);
		expect(
			screen.getByRole("button", { name: "Click me" }),
		).toBeInTheDocument();
	});

	it("handles click events", async () => {
		const handleClick = vi.fn();
		const user = userEvent.setup();

		render(<Button onClick={handleClick}>Click me</Button>);
		await user.click(screen.getByRole("button"));

		expect(handleClick).toHaveBeenCalledTimes(1);
	});

	it("renders with primary variant by default", () => {
		render(<Button>Primary</Button>);
		const button = screen.getByRole("button");
		expect(button).toHaveClass("bg-primary");
	});

	it("renders with secondary variant", () => {
		render(<Button variant="secondary">Secondary</Button>);
		const button = screen.getByRole("button");
		expect(button).toHaveClass("bg-secondary");
	});

	it("renders with outline variant", () => {
		render(<Button variant="outline">Outline</Button>);
		const button = screen.getByRole("button");
		expect(button).toHaveClass("border-input");
	});

	it("renders with ghost variant", () => {
		render(<Button variant="ghost">Ghost</Button>);
		const button = screen.getByRole("button");
		expect(button).toHaveClass("hover:bg-accent");
	});

	it("renders with destructive variant", () => {
		render(<Button variant="destructive">Delete</Button>);
		const button = screen.getByRole("button");
		expect(button).toHaveClass("bg-destructive");
	});

	it("renders with different sizes", () => {
		const { rerender } = render(<Button size="sm">Small</Button>);
		expect(screen.getByRole("button")).toHaveClass("h-8");

		rerender(<Button size="md">Medium</Button>);
		expect(screen.getByRole("button")).toHaveClass("h-9");

		rerender(<Button size="lg">Large</Button>);
		expect(screen.getByRole("button")).toHaveClass("h-10");

		rerender(<Button size="icon">Icon</Button>);
		expect(screen.getByRole("button")).toHaveClass("size-9");
	});

	it("is disabled when disabled prop is true", () => {
		render(<Button disabled>Disabled</Button>);
		expect(screen.getByRole("button")).toBeDisabled();
	});

	it("is disabled when loading is true", () => {
		render(<Button loading>Loading</Button>);
		expect(screen.getByRole("button")).toBeDisabled();
	});

	it("shows spinner when loading", () => {
		render(<Button loading>Loading</Button>);
		const button = screen.getByRole("button");
		expect(button.querySelector("svg")).toBeInTheDocument();
	});

	it("does not trigger click when disabled", async () => {
		const handleClick = vi.fn();
		const user = userEvent.setup();

		render(
			<Button onClick={handleClick} disabled>
				Disabled
			</Button>,
		);
		await user.click(screen.getByRole("button"));

		expect(handleClick).not.toHaveBeenCalled();
	});

	it("does not trigger click when loading", async () => {
		const handleClick = vi.fn();
		const user = userEvent.setup();

		render(
			<Button onClick={handleClick} loading>
				Loading
			</Button>,
		);
		await user.click(screen.getByRole("button"));

		expect(handleClick).not.toHaveBeenCalled();
	});

	it("applies custom className", () => {
		render(<Button className="custom-class">Custom</Button>);
		expect(screen.getByRole("button")).toHaveClass("custom-class");
	});

	it("renders as child component when asChild is true", () => {
		render(
			<Button asChild>
				<a href="/test">Link Button</a>
			</Button>,
		);
		const link = screen.getByRole("link", { name: "Link Button" });
		expect(link).toHaveAttribute("href", "/test");
	});
});

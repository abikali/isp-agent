import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../dialog";

describe("Dialog", () => {
	it("opens when trigger is clicked", async () => {
		const user = userEvent.setup();

		render(
			<Dialog>
				<DialogTrigger>Open Dialog</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Dialog Title</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Open Dialog" }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
	});

	it("closes when close button is clicked", async () => {
		const user = userEvent.setup();

		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Dialog Title</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByRole("dialog")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Close" }));

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});
	});

	it("closes when Escape key is pressed", async () => {
		const user = userEvent.setup();

		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Dialog Title</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByRole("dialog")).toBeInTheDocument();

		await user.keyboard("{Escape}");

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});
	});

	it("calls onOpenChange when dialog state changes", async () => {
		const onOpenChange = vi.fn();
		const user = userEvent.setup();

		render(
			<Dialog onOpenChange={onOpenChange}>
				<DialogTrigger>Open</DialogTrigger>
				<DialogContent>
					<DialogTitle>Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		await user.click(screen.getByRole("button", { name: "Open" }));

		expect(onOpenChange).toHaveBeenCalledWith(true);
	});
});

describe("DialogHeader", () => {
	it("renders children correctly", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogHeader data-testid="header">
						Header content
					</DialogHeader>
					<DialogTitle>Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("header")).toHaveTextContent(
			"Header content",
		);
	});

	it("applies correct styles", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogHeader data-testid="header">Content</DialogHeader>
					<DialogTitle>Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		const header = screen.getByTestId("header");
		expect(header).toHaveClass("flex");
		expect(header).toHaveClass("flex-col");
	});

	it("applies custom className", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogHeader
						className="custom-header"
						data-testid="header"
					>
						Content
					</DialogHeader>
					<DialogTitle>Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("header")).toHaveClass("custom-header");
	});
});

describe("DialogTitle", () => {
	it("renders the title text", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogTitle>My Dialog Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByText("My Dialog Title")).toBeInTheDocument();
	});

	it("applies font styles", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogTitle data-testid="title">Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		const title = screen.getByTestId("title");
		expect(title).toHaveClass("font-semibold");
		expect(title).toHaveClass("text-lg");
	});
});

describe("DialogDescription", () => {
	it("renders the description text", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogTitle>Title</DialogTitle>
					<DialogDescription>This is a description</DialogDescription>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByText("This is a description")).toBeInTheDocument();
	});

	it("applies muted foreground styles", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogTitle>Title</DialogTitle>
					<DialogDescription data-testid="desc">
						Description
					</DialogDescription>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("desc")).toHaveClass("text-muted-foreground");
	});
});

describe("DialogFooter", () => {
	it("renders children correctly", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogTitle>Title</DialogTitle>
					<DialogFooter data-testid="footer">
						<button type="button">Cancel</button>
						<button type="button">Confirm</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		const footer = screen.getByTestId("footer");
		expect(footer).toContainElement(
			screen.getByRole("button", { name: "Cancel" }),
		);
		expect(footer).toContainElement(
			screen.getByRole("button", { name: "Confirm" }),
		);
	});

	it("applies flex layout styles", () => {
		render(
			<Dialog defaultOpen>
				<DialogContent>
					<DialogTitle>Title</DialogTitle>
					<DialogFooter data-testid="footer">Actions</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		const footer = screen.getByTestId("footer");
		expect(footer).toHaveClass("flex");
	});
});

describe("Dialog composition", () => {
	it("renders a complete dialog with all subcomponents", async () => {
		const user = userEvent.setup();

		render(
			<Dialog>
				<DialogTrigger>Open</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm Action</DialogTitle>
						<DialogDescription>
							Are you sure you want to proceed?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<button type="button">Cancel</button>
						<button type="button">Confirm</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		await user.click(screen.getByRole("button", { name: "Open" }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
			expect(screen.getByText("Confirm Action")).toBeInTheDocument();
			expect(
				screen.getByText("Are you sure you want to proceed?"),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Cancel" }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Confirm" }),
			).toBeInTheDocument();
		});
	});
});

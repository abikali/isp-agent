import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "../card";

describe("Card", () => {
	it("renders children correctly", () => {
		render(<Card>Card content</Card>);
		expect(screen.getByText("Card content")).toBeInTheDocument();
	});

	it("applies default variant styles", () => {
		render(<Card data-testid="card">Content</Card>);
		const card = screen.getByTestId("card");
		expect(card).toHaveClass("bg-card");
		expect(card).toHaveClass("border-border");
	});

	it("applies glass variant styles", () => {
		render(
			<Card variant="glass" data-testid="card">
				Glass content
			</Card>,
		);
		const card = screen.getByTestId("card");
		expect(card).toHaveClass("bg-card/80");
		expect(card).toHaveClass("backdrop-blur-sm");
	});

	it("applies elevated variant styles", () => {
		render(
			<Card variant="elevated" data-testid="card">
				Elevated content
			</Card>,
		);
		const card = screen.getByTestId("card");
		expect(card).toHaveClass("shadow-md");
	});

	it("applies custom className", () => {
		render(
			<Card className="custom-class" data-testid="card">
				Custom
			</Card>,
		);
		expect(screen.getByTestId("card")).toHaveClass("custom-class");
	});
});

describe("CardHeader", () => {
	it("renders children correctly", () => {
		render(<CardHeader>Header content</CardHeader>);
		expect(screen.getByText("Header content")).toBeInTheDocument();
	});

	it("applies default styles", () => {
		render(<CardHeader data-testid="header">Header</CardHeader>);
		const header = screen.getByTestId("header");
		expect(header).toHaveClass("flex");
		expect(header).toHaveClass("flex-col");
		expect(header).toHaveClass("p-6");
	});

	it("applies custom className", () => {
		render(
			<CardHeader className="custom-header" data-testid="header">
				Header
			</CardHeader>,
		);
		expect(screen.getByTestId("header")).toHaveClass("custom-header");
	});
});

describe("CardTitle", () => {
	it("renders as h3 element", () => {
		render(<CardTitle>Card Title</CardTitle>);
		expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
			"Card Title",
		);
	});

	it("applies font styles", () => {
		render(<CardTitle data-testid="title">Title</CardTitle>);
		const title = screen.getByTestId("title");
		expect(title).toHaveClass("font-semibold");
		expect(title).toHaveClass("text-xl");
	});

	it("applies custom className", () => {
		render(
			<CardTitle className="custom-title" data-testid="title">
				Title
			</CardTitle>,
		);
		expect(screen.getByTestId("title")).toHaveClass("custom-title");
	});
});

describe("CardDescription", () => {
	it("renders children correctly", () => {
		render(<CardDescription>Card description text</CardDescription>);
		expect(screen.getByText("Card description text")).toBeInTheDocument();
	});

	it("applies muted foreground styles", () => {
		render(
			<CardDescription data-testid="desc">Description</CardDescription>,
		);
		expect(screen.getByTestId("desc")).toHaveClass("text-muted-foreground");
	});

	it("applies custom className", () => {
		render(
			<CardDescription className="custom-desc" data-testid="desc">
				Description
			</CardDescription>,
		);
		expect(screen.getByTestId("desc")).toHaveClass("custom-desc");
	});
});

describe("CardContent", () => {
	it("renders children correctly", () => {
		render(<CardContent>Content area</CardContent>);
		expect(screen.getByText("Content area")).toBeInTheDocument();
	});

	it("applies padding styles", () => {
		render(<CardContent data-testid="content">Content</CardContent>);
		const content = screen.getByTestId("content");
		expect(content).toHaveClass("p-6");
		expect(content).toHaveClass("pt-0");
	});

	it("applies custom className", () => {
		render(
			<CardContent className="custom-content" data-testid="content">
				Content
			</CardContent>,
		);
		expect(screen.getByTestId("content")).toHaveClass("custom-content");
	});
});

describe("CardFooter", () => {
	it("renders children correctly", () => {
		render(<CardFooter>Footer content</CardFooter>);
		expect(screen.getByText("Footer content")).toBeInTheDocument();
	});

	it("applies flex and padding styles", () => {
		render(<CardFooter data-testid="footer">Footer</CardFooter>);
		const footer = screen.getByTestId("footer");
		expect(footer).toHaveClass("flex");
		expect(footer).toHaveClass("items-center");
		expect(footer).toHaveClass("p-6");
	});

	it("applies custom className", () => {
		render(
			<CardFooter className="custom-footer" data-testid="footer">
				Footer
			</CardFooter>,
		);
		expect(screen.getByTestId("footer")).toHaveClass("custom-footer");
	});
});

describe("Card composition", () => {
	it("renders a complete card with all subcomponents", () => {
		render(
			<Card data-testid="card">
				<CardHeader>
					<CardTitle>Example Card</CardTitle>
					<CardDescription>This is a description</CardDescription>
				</CardHeader>
				<CardContent>Main content goes here</CardContent>
				<CardFooter>Footer actions</CardFooter>
			</Card>,
		);

		expect(screen.getByTestId("card")).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Example Card" }),
		).toBeInTheDocument();
		expect(screen.getByText("This is a description")).toBeInTheDocument();
		expect(screen.getByText("Main content goes here")).toBeInTheDocument();
		expect(screen.getByText("Footer actions")).toBeInTheDocument();
	});
});

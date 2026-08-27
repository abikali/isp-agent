import { TableColumnsToggle } from "@shared/components/TableColumnsToggle";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const COLUMNS = [
	"Name",
	"Username",
	"Mobile",
	"Address",
	"Plan",
	"Station",
	"Dealer",
	"Collector",
	"Expires",
].map((label) => ({ id: label.toLowerCase(), label }));

function renderToggle() {
	const onChange = vi.fn();
	render(
		<TableColumnsToggle columns={COLUMNS} value={{}} onChange={onChange} />,
	);
	return { onChange };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: /columns/i }));
	return screen.findByPlaceholderText("Search columns…");
}

describe("TableColumnsToggle", () => {
	it("focuses the search box on open and narrows the list as you type", async () => {
		const user = userEvent.setup();
		renderToggle();
		const search = await openMenu(user);
		expect(search).toHaveFocus();

		await user.keyboard("coll");

		expect(
			screen.getByRole("option", { name: "Collector" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: "Name" }),
		).not.toBeInTheDocument();
	});

	it("toggles the first match on Enter", async () => {
		const user = userEvent.setup();
		const { onChange } = renderToggle();
		await openMenu(user);

		await user.keyboard("dealer");
		await user.keyboard("{Enter}");

		expect(onChange).toHaveBeenCalledWith({ dealer: false });
	});

	it("says so when nothing matches", async () => {
		const user = userEvent.setup();
		renderToggle();
		await openMenu(user);

		await user.keyboard("zzz");

		expect(screen.getByText("No columns found")).toBeInTheDocument();
	});
});

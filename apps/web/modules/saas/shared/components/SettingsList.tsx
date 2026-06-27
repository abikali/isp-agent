import type { PropsWithChildren } from "react";

export function SettingsList({ children }: PropsWithChildren) {
	return (
		<div className="@container flex flex-col gap-4">
			{Array.isArray(children)
				? children.map((child, i) => {
						if (!child) {
							return null;
						}
						// react-doctor-disable-next-line react-doctor/no-array-index-as-key -- children are positionally-stable source siblings with no intrinsic id; index reflects fixed source order, never reordered/filtered
						return <div key={`settings-item-${i}`}>{child}</div>;
					})
				: children}
		</div>
	);
}

"use client";

import { useEffect, useRef, useState } from "react";

export interface AnimatedNumberProps {
	value: number;
	/** Animation duration in ms. Default 600. */
	duration?: number;
	/** Format: raw number, currency (USD), or percent (multiplies by 1 — value is already %). */
	format?: "raw" | "currency" | "percent";
	/** Locale for number formatting. */
	locale?: string;
	className?: string;
}

const formatters: Record<
	NonNullable<AnimatedNumberProps["format"]>,
	(n: number, locale: string) => string
> = {
	raw: (n, locale) =>
		new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n),
	currency: (n, locale) =>
		new Intl.NumberFormat(locale, {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 0,
		}).format(n),
	percent: (n, locale) =>
		`${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n)}%`,
};

/**
 * Animates a number from its previous value to the new value using
 * requestAnimationFrame. Used in stat chips, hero stats, dashboard counters.
 *
 * Respects `prefers-reduced-motion` — instant updates when reduced motion
 * is requested.
 */
export function AnimatedNumber({
	value,
	duration = 600,
	format = "raw",
	locale = "en-US",
	className,
}: AnimatedNumberProps) {
	const [displayed, setDisplayed] = useState(value);
	const fromRef = useRef(value);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		const target = value;
		const start = fromRef.current;
		const reducedMotion =
			typeof window !== "undefined" &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

		if (reducedMotion || start === target) {
			setDisplayed(target);
			fromRef.current = target;
			return;
		}

		const startTime = performance.now();
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / duration, 1);
			// ease-out-quad
			const eased = 1 - (1 - t) * (1 - t);
			const next = start + (target - start) * eased;
			setDisplayed(next);
			if (t < 1) {
				rafRef.current = requestAnimationFrame(tick);
			} else {
				fromRef.current = target;
				rafRef.current = null;
			}
		};
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			if (rafRef.current != null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [value, duration]);

	return (
		<span className={className} data-tabular-nums>
			{formatters[format](displayed, locale)}
		</span>
	);
}

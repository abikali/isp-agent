import React from "react";

export function Logo({ withLabel = true }: { withLabel?: boolean }) {
	return (
		<span className="flex items-center font-semibold text-primary leading-none">
			{withLabel ? (
				<svg
					style={{ height: "32px", width: "auto" }}
					viewBox="0 0 145 44"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>LibanCom</title>
					<path
						d="M30.27 27.88C30.27 37.93 24.11 43.75 16.52 43.75C11.65 43.75 7.89 41.3 6.1 37.44L5.79 43.14H0V0H6.602V17.16C8.58 14.03 12.33 11.89 16.9 11.89C24.61 11.89 30.287 17.77 30.287 27.88H30.27ZM23.56 27.82C23.56 21.32 20.54 17.46 15.17 17.46C9.8 17.46 6.602 21.57 6.602 27.95C6.602 34.32 10.06 38.12 15.105 38.12C20.47 38.12 23.56 34.32 23.56 27.83V27.82Z"
						fill="currentColor"
					/>
					<path
						d="M43.4 0V33.95C43.4 36.88 44.63 37.86 46.55 37.86C48.025 37.86 49.01 37.558 49.94 37.07L51.11 42.46C49.39 43.25 47.41 43.75 45.19 43.75C39.64 43.75 36.8 40.86 36.8 35.11V0H43.4Z"
						fill="currentColor"
					/>
					<path
						d="M62.71 43.14V9.93C61.54 12.562 57.47 15.57 52.35 16.43L51.3 9.69C56.91 8.64 61.54 5.58 63.88 0.01H69.42V43.15H62.71V43.14Z"
						fill="currentColor"
					/>
					<path
						d="M106.852 23.41V43.15H100.25V25.32C100.25 19.56 97.35 17.59 93.6 17.59C89.59 17.59 85.27 20.11 85.27 26.85V43.15H78.67V12.5H84.53L84.77 17.64C86.87 13.72 90.63 11.89 95.07 11.89C101.676 11.89 106.852 15.63 106.852 23.4V23.41Z"
						fill="currentColor"
					/>
					<path
						d="M137.114 43.14L127.557 29.11L121.765 34.992V43.14H115.163V0H121.765V27.2L136.317 12.5H144.268L132.425 24.57L145 43.15H137.114V43.14Z"
						fill="currentColor"
					/>
				</svg>
			) : (
				<svg
					style={{ height: "32px", width: "32px" }}
					viewBox="0 0 512 512"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>LibanCom</title>
					<rect
						width="512"
						height="512"
						rx="96"
						fill="currentColor"
					/>
				</svg>
			)}
		</span>
	);
}

export interface Stat {
	id: string;
	value: string;
	label: string;
	/** Numeric value for animation (without suffix) */
	numericValue: number;
	/** Suffix to append (e.g., "+", "K", "M") */
	suffix?: string;
}

export const stats: Stat[] = [
	{
		id: "profiles",
		value: "50,000+",
		label: "Profiles Created",
		numericValue: 50000,
		suffix: "+",
	},
	{
		id: "leads",
		value: "1M+",
		label: "Leads Captured",
		numericValue: 1000000,
		suffix: "+",
	},
	{
		id: "countries",
		value: "150+",
		label: "Countries",
		numericValue: 150,
		suffix: "+",
	},
];

export interface CompanyLogo {
	id: string;
	name: string;
	/** Path to logo image */
	src: string;
}

// Placeholder logos - replace with actual company logos
export const companyLogos: CompanyLogo[] = [
	{ id: "1", name: "Company 1", src: "/images/logos/company-1.png" },
	{ id: "2", name: "Company 2", src: "/images/logos/company-2.png" },
	{ id: "3", name: "Company 3", src: "/images/logos/company-3.png" },
	{ id: "4", name: "Company 4", src: "/images/logos/company-4.png" },
	{ id: "5", name: "Company 5", src: "/images/logos/company-5.png" },
];

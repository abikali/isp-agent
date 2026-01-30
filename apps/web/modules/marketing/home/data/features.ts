import {
	BarChart3Icon,
	LinkIcon,
	NfcIcon,
	QrCodeIcon,
	UserCircleIcon,
	UsersIcon,
} from "lucide-react";
import type { ComponentType } from "react";

export interface Feature {
	id: string;
	title: string;
	description: string;
	icon: ComponentType<{ className?: string }>;
	/** Grid span configuration */
	span: {
		cols: 1 | 2;
		rows: 1 | 2;
	};
	/** Visual content type for the card */
	visual: "profile" | "lead" | "qr" | "nfc" | "analytics" | "team";
	/** Highlight features or benefits */
	highlights?: string[];
}

export const features: Feature[] = [
	{
		id: "digital-profiles",
		title: "Digital Profiles",
		description:
			"Create stunning, customizable profiles that showcase who you are. Choose from professional templates and make it uniquely yours.",
		icon: UserCircleIcon,
		span: { cols: 2, rows: 2 },
		visual: "profile",
		highlights: [
			"8+ professional templates",
			"Custom colors & branding",
			"Bio, links & social media",
		],
	},
	{
		id: "lead-capture",
		title: "Lead Capture",
		description:
			"Turn every connection into a lead. Capture contact info automatically and export to your CRM.",
		icon: LinkIcon,
		span: { cols: 2, rows: 1 },
		visual: "lead",
		highlights: [
			"Automatic contact forms",
			"CRM integrations",
			"Lead scoring",
		],
	},
	{
		id: "qr-code",
		title: "QR Code Sharing",
		description:
			"Generate instant QR codes for your profile. Perfect for business cards, presentations, and events.",
		icon: QrCodeIcon,
		span: { cols: 1, rows: 1 },
		visual: "qr",
	},
	{
		id: "nfc",
		title: "NFC Accessories",
		description:
			"Tap to share with NFC-enabled cards and tags. The fastest way to exchange contact info.",
		icon: NfcIcon,
		span: { cols: 1, rows: 1 },
		visual: "nfc",
	},
	{
		id: "analytics",
		title: "Analytics Dashboard",
		description:
			"Know exactly who views your profile and when. Track engagement, clicks, and conversions.",
		icon: BarChart3Icon,
		span: { cols: 2, rows: 1 },
		visual: "analytics",
		highlights: [
			"Real-time views",
			"Click tracking",
			"Conversion insights",
		],
	},
	{
		id: "teams",
		title: "Team Management",
		description:
			"Manage your entire team's digital presence from one dashboard. Perfect for organizations.",
		icon: UsersIcon,
		span: { cols: 1, rows: 1 },
		visual: "team",
	},
];

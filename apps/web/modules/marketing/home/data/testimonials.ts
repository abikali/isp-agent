export interface Testimonial {
	id: string;
	quote: string;
	author: {
		name: string;
		title: string;
		company: string;
		avatar?: string;
	};
	rating: number;
}

export const testimonials: Testimonial[] = [
	{
		id: "1",
		quote: "LibanCom transformed how I network at conferences. I just tap my card and they have all my info instantly. It's magical.",
		author: {
			name: "Sarah Chen",
			title: "Founder & CEO",
			company: "TechStart Ventures",
		},
		rating: 5,
	},
	{
		id: "2",
		quote: "The analytics alone are worth it. I can see exactly who viewed my profile and followed up at the right time to close deals.",
		author: {
			name: "Marcus Johnson",
			title: "Sales Director",
			company: "Enterprise Solutions Inc",
		},
		rating: 5,
	},
	{
		id: "3",
		quote: "We rolled out LibanCom to our entire sales team. The lead capture and CRM integration saved us hours every week.",
		author: {
			name: "Emily Rodriguez",
			title: "VP of Operations",
			company: "Global Consulting Group",
		},
		rating: 5,
	},
	{
		id: "4",
		quote: "As a real estate agent, first impressions matter. LibanCom gives me a professional edge that paper cards never could.",
		author: {
			name: "David Kim",
			title: "Senior Real Estate Agent",
			company: "Premier Properties",
		},
		rating: 5,
	},
	{
		id: "5",
		quote: "The customization options are incredible. My profile truly reflects my personal brand and stands out from the crowd.",
		author: {
			name: "Amara Okonkwo",
			title: "Creative Director",
			company: "Design Forward Studio",
		},
		rating: 5,
	},
];

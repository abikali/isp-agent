import { FaqSection } from "@marketing/home/components/FaqSection";
import { FeaturesGrid } from "@marketing/home/components/FeaturesGrid";
import { FinalCTA } from "@marketing/home/components/FinalCTA";
import { HeroSection } from "@marketing/home/components/HeroSection";
import { HowItWorks } from "@marketing/home/components/HowItWorks";
import { PricingSection } from "@marketing/home/components/PricingSection";
import { SocialProofBar } from "@marketing/home/components/SocialProofBar";
import { TestimonialsSection } from "@marketing/home/components/TestimonialsSection";
import { config } from "@repo/config";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/")({
	head: () => ({
		links: [
			// Preload LCP image for faster rendering
			{
				rel: "preload",
				as: "image",
				href: "/images/hero-image.webp",
				type: "image/webp",
				imageSrcSet:
					"/images/hero-image-566.webp 566w, /images/hero-image-1132.webp 1132w, /images/hero-image.webp 2356w",
				imageSizes:
					"(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 566px",
				fetchPriority: "high",
			},
			{
				rel: "canonical",
				href: "https://libancom.co",
			},
		],
		meta: [
			{
				title: `${config.appName} - Digital Identity Platform | Create Shareable Profiles`,
			},
			{
				name: "description",
				content:
					"Create stunning digital profiles with lead capture, analytics, and NFC sharing. Join 10,000+ professionals using LibanCom to elevate their digital presence.",
			},
			{
				property: "og:title",
				content: `${config.appName} - Your Digital Identity, Elevated`,
			},
			{
				property: "og:description",
				content:
					"Create, share, and track your digital identity with LibanCom's professional profile platform.",
			},
			{
				property: "og:type",
				content: "website",
			},
			{
				property: "og:image",
				content: "/images/og-home.png",
			},
			{
				name: "twitter:card",
				content: "summary_large_image",
			},
			{
				name: "twitter:title",
				content: `${config.appName} - Digital Identity Platform`,
			},
			{
				name: "twitter:description",
				content:
					"Create stunning digital profiles with lead capture and analytics.",
			},
			{
				name: "twitter:image",
				content: "/images/og-home.png",
			},
			{
				name: "robots",
				content: "index, follow",
			},
			{
				name: "keywords",
				content:
					"digital profile, digital business card, NFC card, QR code, lead capture, networking, professional profile",
			},
		],
	}),
	component: HomePage,
});

function HomePage() {
	return (
		<main className="flex flex-col">
			{/* Hero - Above the fold, immediate impact */}
			<HeroSection />

			{/* Social Proof - Build trust with logos and stats */}
			<SocialProofBar />

			{/* Features - Bento grid showcasing capabilities */}
			<FeaturesGrid />

			{/* How It Works - Simple 3-step flow */}
			<HowItWorks />

			{/* Testimonials - Social proof carousel */}
			<TestimonialsSection />

			{/* Pricing - Plans and pricing table */}
			<PricingSection />

			{/* FAQ - Common questions */}
			<FaqSection />

			{/* Final CTA - Conversion focused closing section */}
			<FinalCTA />
		</main>
	);
}

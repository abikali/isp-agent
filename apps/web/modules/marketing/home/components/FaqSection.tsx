"use client";

import { Link } from "@tanstack/react-router";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/components/accordion";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { MessageCircleIcon } from "lucide-react";
import { motion } from "motion/react";
import {
	SectionHeader,
	SectionWrapper,
} from "../../shared/components/SectionWrapper";
import { fadeUpVariants, staggerContainerVariants } from "../lib/motion";

const faqs = [
	{
		question: "How do I share my LibanCom profile?",
		answer: "You can share your profile in multiple ways: via a unique link, QR code that you can add to business cards or presentations, or with NFC-enabled accessories that let others tap to view your profile instantly.",
	},
	{
		question: "Can I use LibanCom for my team?",
		answer: "Absolutely! Our Teams plan lets you manage unlimited team members from a single dashboard. You can create templates, enforce brand guidelines, and track team-wide analytics.",
	},
	{
		question: "How does lead capture work?",
		answer: "When someone views your profile, they can optionally share their contact information with you. You'll receive notifications for new leads and can export them to your CRM with one click.",
	},
	{
		question: "Is my data secure?",
		answer: "Yes, we take security seriously. All data is encrypted in transit and at rest. We're GDPR compliant and never sell your data to third parties.",
	},
	{
		question: "What's included in the free plan?",
		answer: "The free plan includes one profile with all core features: customizable design, QR code sharing, basic analytics, and up to 100 lead captures per month. Upgrade anytime for more features.",
	},
	{
		question: "Can I customize my profile's appearance?",
		answer: "Yes! Choose from 8+ professional templates, customize colors to match your brand, add your logo, and arrange your links however you like. Premium plans unlock even more customization options.",
	},
	{
		question: "Do you offer refunds?",
		answer: "Yes, we offer a 30-day money-back guarantee on all paid plans. If you're not satisfied, contact our support team for a full refund.",
	},
	{
		question: "What are NFC accessories?",
		answer: "NFC (Near Field Communication) accessories like cards and tags let you share your profile by simply tapping against someone's phone. It's the fastest way to exchange contact info at events and meetings.",
	},
];

export function FaqSection({ className }: { className?: string }) {
	return (
		<SectionWrapper
			id="faq"
			className={cn("border-t border-border", className)}
			padding="lg"
		>
			<SectionHeader
				badge="FAQ"
				title="Frequently Asked Questions"
				description="Find answers to common questions about LibanCom"
			/>

			<motion.div
				variants={staggerContainerVariants}
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true }}
				className="mx-auto max-w-5xl"
			>
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
					{[0, 1].map((columnIndex) => (
						<Accordion
							key={columnIndex}
							type="single"
							collapsible
							className="w-full"
						>
							{faqs
								.filter((_, i) => i % 2 === columnIndex)
								.map((item, i) => (
									<motion.div
										key={`faq-${columnIndex}-${i}`}
										variants={fadeUpVariants}
									>
										<AccordionItem
											value={`faq-${columnIndex}-${i}`}
											className="mb-4 rounded-lg border border-border bg-card px-5 last:mb-0 data-[state=open]:bg-card/80 lg:px-6"
										>
											<AccordionTrigger className="py-5 text-left font-semibold hover:no-underline">
												{item.question}
											</AccordionTrigger>
											<AccordionContent className="text-muted-foreground">
												{item.answer}
											</AccordionContent>
										</AccordionItem>
									</motion.div>
								))}
						</Accordion>
					))}
				</div>

				{/* Still have questions CTA */}
				<motion.div
					variants={fadeUpVariants}
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true }}
					className="mt-12 text-center"
				>
					<p className="mb-4 text-muted-foreground">
						Still have questions?
					</p>
					<Button variant="outline" asChild>
						<Link to="/contact">
							<MessageCircleIcon className="mr-2 size-4" />
							Contact Support
						</Link>
					</Button>
				</motion.div>
			</motion.div>
		</SectionWrapper>
	);
}

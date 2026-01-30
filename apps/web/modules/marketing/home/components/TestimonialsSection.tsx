"use client";

import { cn } from "@ui/lib";
import { ChevronLeftIcon, ChevronRightIcon, StarIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import {
	SectionHeader,
	SectionWrapper,
} from "../../shared/components/SectionWrapper";
import { testimonials } from "../data/testimonials";

export function TestimonialsSection() {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isPaused, setIsPaused] = useState(false);

	const nextTestimonial = useCallback(() => {
		setCurrentIndex((prev) => (prev + 1) % testimonials.length);
	}, []);

	const prevTestimonial = useCallback(() => {
		setCurrentIndex(
			(prev) => (prev - 1 + testimonials.length) % testimonials.length,
		);
	}, []);

	// Auto-advance carousel
	useEffect(() => {
		if (isPaused) {
			return;
		}

		const timer = setInterval(nextTestimonial, 5000);
		return () => clearInterval(timer);
	}, [isPaused, nextTestimonial]);

	const currentTestimonial = testimonials[currentIndex];

	if (!currentTestimonial) {
		return null;
	}

	return (
		<SectionWrapper id="testimonials" className="bg-muted/20">
			<SectionHeader
				badge="Testimonials"
				title="Loved by Professionals"
				description="See what our users have to say about their experience"
			/>

			<section
				aria-label="Testimonials carousel"
				className="relative mx-auto max-w-3xl"
				onMouseEnter={() => setIsPaused(true)}
				onMouseLeave={() => setIsPaused(false)}
			>
				{/* Testimonial card */}
				<div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 md:p-12">
					<AnimatePresence mode="wait">
						<motion.div
							key={currentTestimonial.id}
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							transition={{ duration: 0.3 }}
							className="text-center"
						>
							{/* Stars */}
							<div className="mb-6 flex justify-center gap-1">
								{Array.from({
									length: currentTestimonial.rating,
								}).map((_, i) => (
									<StarIcon
										key={i}
										className="size-5 fill-highlight text-highlight"
									/>
								))}
							</div>

							{/* Quote */}
							<blockquote className="mb-8 text-xl font-medium md:text-2xl">
								"{currentTestimonial.quote}"
							</blockquote>

							{/* Author */}
							<div className="flex flex-col items-center">
								<div className="mb-3 size-12 rounded-full bg-gradient-to-br from-muted to-muted-foreground" />
								<div className="font-semibold">
									{currentTestimonial.author.name}
								</div>
								<div className="text-sm text-muted-foreground">
									{currentTestimonial.author.title} at{" "}
									{currentTestimonial.author.company}
								</div>
							</div>
						</motion.div>
					</AnimatePresence>

					{/* Quote decoration */}
					<div className="absolute top-4 left-4 font-serif text-8xl text-muted/30">
						"
					</div>
				</div>

				{/* Navigation */}
				<div className="mt-6 flex items-center justify-center gap-4">
					<button
						type="button"
						onClick={prevTestimonial}
						className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-muted"
						aria-label="Previous testimonial"
					>
						<ChevronLeftIcon className="size-5" />
					</button>

					{/* Pagination dots */}
					<div className="flex gap-2">
						{testimonials.map((_, index) => (
							<button
								type="button"
								key={index}
								onClick={() => setCurrentIndex(index)}
								className={cn(
									"size-2 rounded-full transition-all",
									index === currentIndex
										? "w-6 bg-foreground"
										: "bg-muted-foreground/30 hover:bg-muted-foreground/50",
								)}
								aria-label={`Go to testimonial ${index + 1}`}
							/>
						))}
					</div>

					<button
						type="button"
						onClick={nextTestimonial}
						className="rounded-full border border-border bg-card p-2 transition-colors hover:bg-muted"
						aria-label="Next testimonial"
					>
						<ChevronRightIcon className="size-5" />
					</button>
				</div>
			</section>
		</SectionWrapper>
	);
}

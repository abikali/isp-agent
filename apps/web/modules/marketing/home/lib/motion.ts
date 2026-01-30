import { stagger, type Variants } from "motion/react";

// Apple-like easing curve for smooth, premium feel
const easeApple = [0.4, 0, 0.2, 1] as const;

// Fade up animation for individual elements
export const fadeUpVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 24,
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.5,
			ease: easeApple,
		},
	},
};

// Stagger container for child animations - uses Motion's stagger function
export const staggerContainerVariants: Variants = {
	hidden: {
		opacity: 0,
	},
	visible: {
		opacity: 1,
		transition: {
			when: "beforeChildren",
			delayChildren: stagger(0.1),
		},
	},
};

// Fast stagger for items
export const staggerItemVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 20,
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.4,
			ease: easeApple,
		},
	},
};

// Hero section specific animations with custom delay multiplier
export const heroTextVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 30,
	},
	visible: (custom = 0) => ({
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.6,
			ease: easeApple,
			delay: custom * 0.1,
		},
	}),
};

export const heroImageVariants: Variants = {
	hidden: {
		opacity: 0,
		scale: 0.92,
		y: 40,
	},
	visible: {
		opacity: 1,
		scale: 1,
		y: 0,
		transition: {
			duration: 0.8,
			ease: easeApple,
			delay: 0.3,
		},
	},
};

// Floating animation for decorative elements
export const floatVariants: Variants = {
	initial: {
		y: 0,
	},
	animate: {
		y: [-6, 6, -6],
		transition: {
			duration: 4,
			ease: "easeInOut",
			repeat: Number.POSITIVE_INFINITY,
		},
	},
};

// Counter animation (for stat numbers)
export const counterVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 10,
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: {
			duration: 0.4,
			ease: easeApple,
		},
	},
};

// Bento grid container with proper stagger using Motion's stagger function
export const bentoContainerVariants: Variants = {
	hidden: {
		opacity: 0,
	},
	visible: {
		opacity: 1,
		transition: {
			when: "beforeChildren",
			delayChildren: stagger(0.08, { from: "first" }),
		},
	},
};

// Bento item animation - each card animates in sequence
export const bentoItemVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 24,
		scale: 0.96,
	},
	visible: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: {
			duration: 0.5,
			ease: easeApple,
		},
	},
};

"use client";
import { useRouter } from "@shared/hooks/router";
import { useSearch } from "@tanstack/react-router";
import { Progress } from "@ui/components/progress";
import { OnboardingStep1 } from "./OnboardingStep1";

export function OnboardingForm() {
	const router = useRouter();
	const searchParams = useSearch({ strict: false }) as {
		step?: string;
		redirectTo?: string;
	};

	const stepSearchParam = searchParams.step;
	const redirectTo = searchParams.redirectTo;
	const onboardingStep = stepSearchParam
		? Number.parseInt(stepSearchParam, 10)
		: 1;

	const onCompleted = () => {
		router.replace(redirectTo ?? "/app");
	};

	const steps = [
		{
			component: <OnboardingStep1 onCompleted={() => onCompleted()} />,
		},
	];

	return (
		<div>
			<h1 className="font-bold text-xl md:text-2xl">
				Welcome to LibanCom
			</h1>
			<p className="mt-2 mb-6 text-foreground/60">
				Let's create your digital identity
			</p>

			{steps.length > 1 && (
				<div className="mb-6 flex items-center gap-3">
					<Progress
						value={(onboardingStep / steps.length) * 100}
						className="h-2"
					/>
					<span className="shrink-0 text-foreground/60 text-xs">
						Step {onboardingStep} of {steps.length}
					</span>
				</div>
			)}

			{steps[onboardingStep - 1]?.component}
		</div>
	);
}

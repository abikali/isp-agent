import { ContactForm } from "@marketing/home/components/ContactForm";
import { config } from "@repo/config";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/contact")({
	beforeLoad: () => {
		if (!config.contactForm.enabled) {
			throw redirect({ to: "/" });
		}
	},
	head: () => ({
		meta: [
			{ title: `Contact - ${config.appName}` },
			{
				name: "description",
				content:
					"Get in touch with our team. We'd love to hear from you.",
			},
		],
	}),
	component: ContactPage,
});

function ContactPage() {
	return (
		<div className="container max-w-xl pt-32 pb-16">
			<div className="mb-12 pt-8 text-center">
				<h1 className="mb-2 font-bold text-5xl">Contact</h1>
				<p className="text-balance text-lg opacity-50">
					Get in touch with our team. We'd love to hear from you.
				</p>
			</div>

			<ContactForm />
		</div>
	);
}

"use client";

import {
	emailSchema,
	messageSchema,
	nameSchema,
} from "@repo/api/lib/validation";
import { useForm, useStore } from "@tanstack/react-form";
import { Alert, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { Field, FieldError, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Textarea } from "@ui/components/textarea";
import { MailCheckIcon, MailIcon } from "lucide-react";
import { useState } from "react";

export function ContactForm() {
	const [isSubmitSuccessful, setIsSubmitSuccessful] = useState(false);
	const [rootError, setRootError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			message: "",
		},
		onSubmit: async ({ value }) => {
			setRootError(null);
			try {
				const response = await fetch("/api/contact", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(value),
				});
				if (!response.ok) {
					throw new Error("Failed");
				}
				setIsSubmitSuccessful(true);
			} catch {
				setRootError("Failed to send message. Please try again.");
			}
		},
	});

	const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

	return (
		<div>
			{isSubmitSuccessful ? (
				<Alert variant="success">
					<MailCheckIcon />
					<AlertTitle>Message sent successfully!</AlertTitle>
				</Alert>
			) : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-col items-stretch gap-4"
				>
					{rootError && (
						<Alert variant="error">
							<MailIcon />
							<AlertTitle>{rootError}</AlertTitle>
						</Alert>
					)}

					<form.Field
						name="name"
						validators={{
							onBlur: nameSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="contact-name">
										Name
									</FieldLabel>
									<Input
										id="contact-name"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										aria-invalid={hasErrors || undefined}
									/>
									{hasErrors && (
										<FieldError
											errors={field.state.meta.errors}
										/>
									)}
								</Field>
							);
						}}
					</form.Field>

					<form.Field
						name="email"
						validators={{
							onBlur: emailSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="contact-email">
										Email
									</FieldLabel>
									<Input
										id="contact-email"
										type="email"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										aria-invalid={hasErrors || undefined}
									/>
									{hasErrors && (
										<FieldError
											errors={field.state.meta.errors}
										/>
									)}
								</Field>
							);
						}}
					</form.Field>

					<form.Field
						name="message"
						validators={{
							onBlur: messageSchema,
						}}
					>
						{(field) => {
							const hasErrors =
								field.state.meta.isTouched &&
								field.state.meta.errors.length > 0;
							return (
								<Field data-invalid={hasErrors || undefined}>
									<FieldLabel htmlFor="contact-message">
										Message
									</FieldLabel>
									<Textarea
										id="contact-message"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										onBlur={field.handleBlur}
										aria-invalid={hasErrors || undefined}
									/>
									{hasErrors && (
										<FieldError
											errors={field.state.meta.errors}
										/>
									)}
								</Field>
							);
						}}
					</form.Field>

					<Button
						type="submit"
						className="w-full"
						loading={isSubmitting}
					>
						Send message
					</Button>
				</form>
			)}
		</div>
	);
}

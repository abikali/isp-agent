import { getUserByEmail } from "@repo/database";
import { z } from "zod";
import { authProcedure } from "../../../orpc/procedures";

const checkEmailStatusSchema = z.object({
	email: z.string().email(),
});

export const checkEmailStatus = authProcedure
	.route({
		method: "POST",
		path: "/auth/check-email-status",
		tags: ["Auth"],
		summary: "Check email verification status",
		description:
			"Check if an email exists and whether it needs verification. Only call after signup attempt fails with user already exists error.",
	})
	.input(checkEmailStatusSchema)
	.handler(async ({ input: { email } }) => {
		const user = await getUserByEmail(email);

		if (!user) {
			return { exists: false, needsVerification: false };
		}

		return {
			exists: true,
			needsVerification: !user.emailVerified,
		};
	});

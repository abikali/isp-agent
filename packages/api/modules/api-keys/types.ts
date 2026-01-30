import z from "zod";

export const ApiKeyPermissionSchema = z.enum([
	"*",
	"read:*",
	"write:*",
	"read:users",
	"read:members",
	"read:organization",
	"write:members",
	"write:organization",
]);

export type ApiKeyPermission = z.infer<typeof ApiKeyPermissionSchema>;

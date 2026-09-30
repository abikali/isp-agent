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
	"read:customers",
	"write:tasks",
	"write:customer-mac",
]);

export type ApiKeyPermission = z.infer<typeof ApiKeyPermissionSchema>;

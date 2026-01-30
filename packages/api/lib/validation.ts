/**
 * Shared validation utilities
 * Used by both API and frontend to ensure consistent validation across the stack
 */
import { z } from "zod";

// ============================================================================
// Email Validation
// ============================================================================

/**
 * Basic email regex pattern
 * Validates format: local@domain.tld
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_PATTERN_STRING = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

/**
 * Validates an email address
 */
export function isValidEmail(email: string): boolean {
	return EMAIL_PATTERN.test(email.trim());
}

/**
 * Validates email and returns error message or null if valid
 */
export function validateEmail(email: string): string | null {
	if (!email || email.trim().length === 0) {
		return "Email is required";
	}
	if (!isValidEmail(email)) {
		return "Please enter a valid email address";
	}
	return null;
}

// ============================================================================
// Phone Validation
// ============================================================================

/**
 * Phone regex pattern that accepts:
 * - Optional leading +
 * - Optional country code in parentheses
 * - Digits with optional separators (hyphens, spaces, dots, slashes)
 */
export const PHONE_PATTERN = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,}$/;
export const PHONE_PATTERN_STRING = "^[+]?[(]?[0-9]{1,4}[)]?[-\\s./0-9]{6,}$";

/**
 * Validates a phone number
 */
export function isValidPhone(phone: string): boolean {
	const cleaned = phone.replace(/\s/g, "");
	return PHONE_PATTERN.test(cleaned);
}

/**
 * Validates phone and returns error message or null if valid
 */
export function validatePhone(phone: string): string | null {
	if (!phone || phone.trim().length === 0) {
		return "Phone number is required";
	}
	if (!isValidPhone(phone)) {
		return "Please enter a valid phone number";
	}
	return null;
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validates a URL string
 * Requires http:// or https:// prefix
 */
export function isValidUrl(url: string): boolean {
	if (!url.startsWith("http://") && !url.startsWith("https://")) {
		return false;
	}
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validates URL and returns error message or null if valid
 */
export function validateUrl(url: string): string | null {
	if (!url || url.trim().length === 0) {
		return "URL is required";
	}
	const trimmed = url.trim();
	if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
		return "URL must start with http:// or https://";
	}
	try {
		new URL(trimmed);
	} catch {
		return "Please enter a valid URL";
	}
	return null;
}

// ============================================================================
// Username Validation
// ============================================================================

/**
 * Username validation rules:
 * - 3-30 characters
 * - Must start with letter or number
 * - Only lowercase letters, numbers, hyphens, and underscores
 * - Cannot have consecutive special characters
 * - Cannot end with special character
 */
export const USERNAME_RULES = {
	minLength: 3,
	maxLength: 30,
	startPattern: /^[a-z0-9]/,
	allowedPattern: /^[a-z0-9_-]+$/,
	noConsecutiveSpecial: /^(?!.*[-_]{2})/,
	endPattern: /[a-z0-9]$/,
} as const;

/**
 * Validates a username and returns error message or null if valid
 */
export function validateUsername(username: string): string | null {
	if (!username || username.trim().length === 0) {
		return "Username is required";
	}

	const value = username.toLowerCase().trim();

	if (value.length < USERNAME_RULES.minLength) {
		return `Username must be at least ${USERNAME_RULES.minLength} characters`;
	}
	if (value.length > USERNAME_RULES.maxLength) {
		return `Username must be less than ${USERNAME_RULES.maxLength} characters`;
	}
	if (!USERNAME_RULES.startPattern.test(value)) {
		return "Username must start with a letter or number";
	}
	if (!USERNAME_RULES.allowedPattern.test(value)) {
		return "Username can only contain lowercase letters, numbers, hyphens, and underscores";
	}
	if (!USERNAME_RULES.noConsecutiveSpecial.test(value)) {
		return "Username cannot have consecutive special characters";
	}
	if (!USERNAME_RULES.endPattern.test(value)) {
		return "Username must end with a letter or number";
	}

	return null;
}

/**
 * Zod schema for username validation (Single Source of Truth)
 * Used by all forms and API schemas that validate usernames
 */
export const usernameSchema = z
	.string()
	.min(
		USERNAME_RULES.minLength,
		`Username must be at least ${USERNAME_RULES.minLength} characters`,
	)
	.max(
		USERNAME_RULES.maxLength,
		`Username must be less than ${USERNAME_RULES.maxLength} characters`,
	)
	.regex(
		USERNAME_RULES.startPattern,
		"Username must start with a letter or number",
	)
	.regex(
		USERNAME_RULES.allowedPattern,
		"Username can only contain lowercase letters, numbers, hyphens, and underscores",
	)
	.regex(
		USERNAME_RULES.noConsecutiveSpecial,
		"Username cannot have consecutive special characters",
	)
	.regex(
		USERNAME_RULES.endPattern,
		"Username must end with a letter or number",
	);

// ============================================================================
// Hex Color Validation
// ============================================================================

/**
 * Hex color pattern (6 digits with #)
 */
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const HEX_COLOR_PATTERN_STRING = "^#[0-9A-Fa-f]{6}$";

/**
 * Validates a hex color
 */
export function isValidHexColor(color: string): boolean {
	return HEX_COLOR_PATTERN.test(color);
}

/**
 * Validates hex color and returns error message or null if valid
 */
export function validateHexColor(color: string): string | null {
	if (!color || color.trim().length === 0) {
		return "Color is required";
	}
	if (!isValidHexColor(color.trim())) {
		return "Please enter a valid hex color (e.g., #FF0000)";
	}
	return null;
}

/**
 * Zod schema for hex color validation
 * Use this in all API schemas instead of creating local copies
 */
export const hexColorSchema = z
	.string()
	.regex(HEX_COLOR_PATTERN, "Invalid hex color");

// ============================================================================
// Optional String Schema Helpers
// ============================================================================

/**
 * Schema that accepts empty string and transforms it to undefined.
 * Use with .or() to make any string schema accept empty strings as "not provided".
 */
export const emptyStringToUndefined = z
	.literal("")
	.transform(() => undefined as undefined);

/**
 * Creates a Zod schema that treats empty strings as undefined.
 *
 * This is the best practice for optional string fields in forms where:
 * - Form fields default to empty string ""
 * - API schemas use .optional() which only accepts undefined, not ""
 *
 * Usage:
 * ```ts
 * // Instead of: username: profileUsernameSchema.optional()
 * // Use: username: emptyStringAsUndefined(profileUsernameSchema)
 * ```
 *
 * @param schema - The base string schema to apply when value is non-empty
 * @returns Schema that passes undefined for empty strings, or validates non-empty strings
 */
export function emptyStringAsUndefined<T extends z.ZodString>(schema: T) {
	return schema.optional().or(emptyStringToUndefined);
}

// ============================================================================
// Common Field Validation Schemas
// ============================================================================

/**
 * Name field schema (user's display name).
 * Requirements: 1-100 chars
 */
export const nameSchema = z
	.string()
	.min(1, "Name is required")
	.max(100, "Name must be 100 characters or less");

/**
 * Email field schema.
 * Uses zod's built-in email validation.
 */
export const emailSchema = z
	.string()
	.min(1, "Email is required")
	.email("Please enter a valid email address");

/**
 * Password field schema for login (just requires non-empty).
 */
export const passwordLoginSchema = z.string().min(1, "Password is required");

/**
 * Password field schema for registration/reset (requires 8+ chars).
 */
export const passwordSchema = z
	.string()
	.min(1, "Password is required")
	.min(8, "Password must be at least 8 characters");

/**
 * Organization name field schema.
 * Requirements: 3-32 chars
 */
export const organizationNameSchema = z
	.string()
	.min(1, "Organization name is required")
	.min(3, "Organization name must be at least 3 characters")
	.max(32, "Organization name must be 32 characters or less");

/**
 * URL field schema.
 * Requires valid URL format.
 */
export const urlSchema = z
	.string()
	.min(1, "URL is required")
	.url("Please enter a valid URL");

/**
 * Message field schema (for contact forms, etc).
 * Requirements: non-empty
 */
export const messageSchema = z.string().min(1, "Message is required");

/**
 * Role name schema (for custom organization roles).
 * Requirements: 2-50 chars, lowercase alphanumeric with hyphens only
 */
export const roleNameSchema = z
	.string()
	.min(1, "Role name is required")
	.min(2, "Role name must be at least 2 characters")
	.max(50, "Role name must be at most 50 characters")
	.regex(
		/^[a-z0-9-]+$/,
		"Role name must be lowercase alphanumeric with hyphens only",
	);

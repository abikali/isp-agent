/**
 * Test stub for `@repo/mail`.
 *
 * The real package re-exports React Email `.tsx` templates (`./emails`),
 * which vite's import-analysis can't parse under the shared react-library
 * tsconfig (`jsx: preserve`) — crashing any api suite that transitively
 * imports `@repo/mail` (e.g. via bare `@repo/auth`'s email senders).
 *
 * No api unit test exercises email rendering, so aliasing the package to
 * these no-op shapes (in vitest.config.ts) keeps suites loadable without
 * pulling the JSX templates into the transform.
 */
export const mailTemplates = {} as Record<string, unknown>;

export async function send(): Promise<void> {
	// no-op in tests
}

export async function sendEmail(): Promise<void> {
	// no-op in tests
}

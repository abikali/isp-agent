export interface SendSmsParams {
	/** Destination number, digits with country code and no "+" (961…). */
	to: string;
	/** Fully-rendered message body. */
	body: string;
	/** Registered alphanumeric sender. Defaults to `SMS_SENDER_ID` / "Libancom". */
	senderId?: string | undefined;
}

export interface SmsResult {
	success: boolean;
	/** Provider-assigned id/count when available. */
	providerMessageId?: string | undefined;
	/** Raw provider response (always captured for the delivery log). */
	raw: string;
	/** Human-readable error when `success` is false. */
	error?: string | undefined;
	/**
	 * True when the failure is transient (network, timeout, HTTP 5xx) and the
	 * send should be retried. `ERR:` answers are permanent.
	 */
	retriable?: boolean | undefined;
}

export const WATCHER_TYPES = [
	{ value: "ping", label: "TCP Ping" },
	{ value: "http", label: "HTTP" },
	{ value: "port", label: "Port Check" },
	{ value: "dns", label: "DNS" },
] as const;

export const INTERVAL_OPTIONS = [
	{ value: 60, label: "1 minute" },
	{ value: 300, label: "5 minutes" },
	{ value: 900, label: "15 minutes" },
	{ value: 1800, label: "30 minutes" },
	{ value: 3600, label: "1 hour" },
] as const;

export const REMINDER_INTERVAL_OPTIONS = [
	{ value: 15, label: "15 minutes" },
	{ value: 30, label: "30 minutes" },
	{ value: 60, label: "1 hour" },
	{ value: 120, label: "2 hours" },
	{ value: 240, label: "4 hours" },
	{ value: 480, label: "8 hours" },
	{ value: 1440, label: "24 hours" },
] as const;

/**
 * Playwright Global Teardown - Cleans up after test run
 *
 * Stops the tunnel if it was started.
 */
import { isTunnelEnabled, stopTunnel } from "./lib/tunnel";

function log(message: string): void {
	process.stdout.write(`${message}\n`);
}

async function globalTeardown() {
	log("\n🧹 Running test teardown...\n");

	// Stop tunnel if it was started
	if (isTunnelEnabled()) {
		try {
			await stopTunnel();
			log("✓ Tunnel stopped");
		} catch (error) {
			log(`⚠ Error stopping tunnel: ${error}`);
		}
	}

	log("\n✓ Test teardown complete\n");
}

export default globalTeardown;

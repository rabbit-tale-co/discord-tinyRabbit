import { LicenseManager } from './licenseManager.js'
import { bunnyLog } from 'bunny-log'

/**
 * Endpoint for verifying a license.
 * Expects a body with licenseKey and botId.
 * Returns an object with premium flag and trialActive flag.
 */
export async function licenseVerifyEndpoint(body: {
	licenseKey: string,
	botId: string
}): Promise<{ valid: boolean; trialActive: boolean }> {
	if (!body.licenseKey || !body.botId) {
		throw new Error('Missing licenseKey or botId');
	}
	try {
		await LicenseManager.verifyLicense(body.licenseKey);
		return {
			valid: LicenseManager.premium,
			trialActive: LicenseManager.trialActive,
		};
	} catch (error) {
		bunnyLog.error('Error in licenseVerifyEndpoint:', error);
		throw error;
	}
}

/**
 * Endpoint for checking the trial status.
 * Expects a body with botId.
 * Returns an object with the trialActive flag.
 */
export async function licenseTrialEndpoint(body: {
	botId: string
}): Promise<{ trialActive: boolean }> {
	if (!body.botId) {
		throw new Error('Missing botId');
	}
	try {
		await LicenseManager.checkTrialStatus();
		return {
			trialActive: LicenseManager.trialActive,
		};
	} catch (error) {
		bunnyLog.error('Error in licenseTrialEndpoint:', error);
		throw error;
	}
}

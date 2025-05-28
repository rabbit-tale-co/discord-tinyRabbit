import supabase from '@/db/supabase.js'
import { bunnyLog } from 'bunny-log'

const LicenseManager = {
	// Internal state for license status.
	_isPremium: false,
	_isTrialActive: false,

	// Getters to expose license flags.
	get premium(): boolean {
		return this._isPremium
	},
	get trialActive(): boolean {
		return this._isTrialActive
	},

	/**
	 * Verifies the license by querying the plugin_licenses table.
	 * If the license exists and is active (and not expired), it sets the premium/trial flags.
	 *
	 * @param licenseKey The license key to verify.
	 */
	async verifyLicense(licenseKey: string): Promise<void> {
		try {
			const { data, error } = await supabase
				.from('plugin_licenses')
				.select('*')
				.eq('license_key', licenseKey)
				.single()

			if (error) {
				throw error
			}

			if (data) {
				const now = new Date()
				const expiresAt = data.expires_at ? new Date(data.expires_at) : null
				// Premium if license_type is 'premium' or 'enterprise', active, and not expired.
				this._isPremium =
					(data.license_type === 'premium' ||
						data.license_type === 'enterprise') &&
					data.is_active &&
					(!expiresAt || expiresAt > now)

				// Trial active if license_type is 'standard', active, and not expired.
				this._isTrialActive =
					data.license_type === 'standard' &&
					data.is_active &&
					(!expiresAt || expiresAt > now)

				bunnyLog.info(
					`License verified. Premium: ${this._isPremium}, Trial: ${this._isTrialActive}`
				)
			} else {
				bunnyLog.warn(`No license found for key ${licenseKey}`)
				this._isPremium = false
				this._isTrialActive = false
			}
		} catch (err: any) {
			bunnyLog.error('Error verifying license:', err)
			this._isPremium = false
			this._isTrialActive = false
		}
	},

	/**
	 * Checks the trial status by querying the trial_servers table for an active, non-converted trial.
	 * Adjust the logic as needed.
	 */
	async checkTrialStatus(): Promise<void> {
		try {
			const now = new Date().toISOString()
			const { data, error } = await supabase
				.from('trial_servers')
				.select('*')
				.gt('expires_at', now) // select trials that have not expired
				.eq('is_converted', false)
				.limit(1)
				.single()

			this._isTrialActive = !!(!error && data)

			bunnyLog.info(
				`Trial status checked. Trial active: ${this._isTrialActive}`
			)
		} catch (err: any) {
			bunnyLog.error('Error checking trial status:', err)
			this._isTrialActive = false
		}
	},
}

/**
 * Retrieves license key information from the database.
 * @param licenseKey The license key string.
 * @returns Promise resolving to license info data.
 */
async function getLicenseInfo(licenseKey: string): Promise<any> {
	try {
		const { data, error } = await supabase
			.from('plugin_licenses')
			.select('*')
			.eq('license_key', licenseKey)
			.single()
		if (error) {
			throw error
		}
		return data
	} catch (err) {
		bunnyLog.error('Error fetching license info:', err)
		throw err
	}
}

export { LicenseManager, getLicenseInfo }

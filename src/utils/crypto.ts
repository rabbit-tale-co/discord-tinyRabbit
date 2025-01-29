import crypto from 'node:crypto'

// Algorithm used for encryption
const algorithm = 'aes-256-ctr'

// Using the generated values earlier
const key = Buffer.from(
	'1030F818276714110CA1A36909CEF55C5EF205C0984724FE783644ADBD1CAFD3',
	'hex'
)
const iv = Buffer.from('A373BE56A31A18A8DFFA53656A78B40D', 'hex')

/**
 * @param {string} token - The token to encrypt.
 * @returns {string} The encrypted token.
 */
function encryptToken(token: string): string {
	const cipher = crypto.createCipheriv(algorithm, key, iv)
	const encrypted = Buffer.concat([cipher.update(token), cipher.final()])

	// Return the encrypted text in hex format
	return encrypted.toString('hex')
}

/**
 * @param {string} encryptedToken - The encrypted token to decrypt.
 * @returns {string} The decrypted token.
 */
function decryptToken(encryptedToken: string): string {
	const decipher = crypto.createDecipheriv(algorithm, key, iv)
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(encryptedToken, 'hex')),
		decipher.final(),
	])

	// Return the decrypted text
	return decrypted.toString()
}

export { encryptToken, decryptToken }

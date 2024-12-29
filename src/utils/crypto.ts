import { bunnyLog } from 'bunny-log'
import crypto from 'node:crypto'

// Algorytm szyfrowania
const algorithm = 'aes-256-ctr'
const secret_key = process.env.TOKEN_HASH_KEY

// Używamy wygenerowanych wcześniej wartości
const key = Buffer.from(
	'1030F818276714110CA1A36909CEF55C5EF205C0984724FE783644ADBD1CAFD3',
	'hex'
)
const iv = Buffer.from('A373BE56A31A18A8DFFA53656A78B40D', 'hex')

// Funkcja do szyfrowania tokena
function encryptToken(token: string): string {
	const cipher = crypto.createCipheriv(algorithm, key, iv)
	const encrypted = Buffer.concat([cipher.update(token), cipher.final()])

	// Zwracamy zaszyfrowany tekst w formacie hex
	return encrypted.toString('hex')
}

// Funkcja do deszyfrowania tokena
function decryptToken(encryptedToken: string): string {
	const decipher = crypto.createDecipheriv(algorithm, key, iv)
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(encryptedToken, 'hex')),
		decipher.final(),
	])

	return decrypted.toString()
}

export { encryptToken, decryptToken }

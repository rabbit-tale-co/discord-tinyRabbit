import { bunnyLog } from 'bunny-log'

type ResponseStatus = 'success' | 'error' | 'warning'

interface ApiResponse<T> {
	status: ResponseStatus
	data: T
	message?: string
}

const RESPONSE_MESSAGES: Record<ResponseStatus, string> = {
	success: '✅ Success!',
	error: '❌ Error occurred.',
	warning: '⚠️ Warning!',
}

class ApiResponseHandler<T> {
	private message: string
	private data: T

	constructor(response: ApiResponse<T>) {
		this.message = response.message || RESPONSE_MESSAGES[response.status]
		this.data = response.data
	}

	getMessage(): string {
		return this.message
	}

	getData(): T {
		return this.data
	}
}

const fetchAndMapResponse = async <T>(url: string): Promise<T | null> => {
	try {
		const response = await fetch(url)
		const result = new ApiResponseHandler<T>(await response.json())

		bunnyLog.info(`${result.getMessage()}: ${JSON.stringify(result.getData())}`)
		return result.getData()
	} catch (error) {
		bunnyLog.error(RESPONSE_MESSAGES.error)
		return null
	}
}

export { fetchAndMapResponse }

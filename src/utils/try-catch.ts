type Success<T> = {
	data: T
	error: null
}

type Failure<E> = {
	data: null
	error: E
}

/**
 * The result of a try-catch operation.
 */
type Result<T, E = Error> = Success<T> | Failure<E>

/**
 * Try to execute a promise and return the result.
 * If the promise throws an error, return a Failure with the error.
 * If the promise resolves, return a Success with the data.
 */
export async function tryCatch<T, E = Error>(
	promise: Promise<T>
): Promise<Result<T, E>> {
	try {
		const data = await promise
		return { data, error: null }
	} catch (error) {
		return { data: null, error: error as E }
	}
}

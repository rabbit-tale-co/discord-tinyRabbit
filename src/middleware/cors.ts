export function setCorsHeaders(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', process.env.FRONTEND_URL!);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

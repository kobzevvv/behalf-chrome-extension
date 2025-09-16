/**
 * HTTP Utilities
 * Common HTTP helpers for request/response handling
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, X-Delivery-Id',
  'Access-Control-Max-Age': '86400'
};

/**
 * Create success response with consistent format
 */
export function createSuccessResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * Create error response with consistent format
 */
export function createErrorResponse(
  message: string, 
  status: number = 400, 
  details?: any
): Response {
  const errorBody = {
    error: message,
    status,
    timestamp: new Date().toISOString(),
    ...details
  };
  
  return new Response(JSON.stringify(errorBody), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

/**
 * Validate and parse JSON body with required fields
 */
export async function validateJsonBody(
  request: Request, 
  requiredFields: string[] = []
): Promise<any> {
  const contentType = request.headers.get('content-type');
  
  if (!contentType?.includes('application/json')) {
    throw new Error('Content-Type must be application/json');
  }
  
  let body: any;
  try {
    body = await request.json();
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
  
  // Check required fields
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  return body;
}

/**
 * Extract query parameters with defaults
 */
export function getQueryParams(request: Request): URLSearchParams {
  const url = new URL(request.url);
  return url.searchParams;
}

/**
 * Validate request method
 */
export function validateMethod(request: Request, allowedMethods: string[]): void {
  if (!allowedMethods.includes(request.method)) {
    throw new Error(`Method ${request.method} not allowed. Allowed: ${allowedMethods.join(', ')}`);
  }
}

/**
 * Get bearer token from Authorization header
 */
export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Validate API token (placeholder for future implementation)
 */
export async function validateApiToken(token: string): Promise<boolean> {
  // TODO: Implement token validation against D1
  // For now, accept any non-empty token
  return Boolean(token && token.length > 0);
}

/**
 * Rate limiting helper (placeholder for future implementation)
 */
export async function checkRateLimit(
  identifier: string, 
  limit: number, 
  windowMs: number
): Promise<{ allowed: boolean; remaining: number }> {
  // TODO: Implement rate limiting using KV or D1
  // For now, always allow
  return { allowed: true, remaining: limit };
}

/**
 * Create webhook signature
 */
export async function createWebhookSignature(
  payload: string, 
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `sha256=${hashHex}`;
}

/**
 * Verify webhook signature
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature.startsWith('sha256=')) {
    return false;
  }
  
  const expectedSignature = await createWebhookSignature(payload, secret);
  
  // Use timing-safe comparison
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expectedSignature);
  const actualBytes = encoder.encode(signature);
  
  if (expectedBytes.length !== actualBytes.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    result |= expectedBytes[i] ^ actualBytes[i];
  }
  
  return result === 0;
}

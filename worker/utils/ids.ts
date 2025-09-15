/**
 * ID Generation Utilities
 * Consistent ID generation for jobs, leases, and other entities
 */

/**
 * Generate a unique job ID
 */
export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `j_${timestamp}_${random}`;
}

/**
 * Generate a unique lease ID
 */
export function generateLeaseId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `L_${timestamp}_${random}`;
}

/**
 * Generate a unique delivery ID for webhooks
 */
export function generateDeliveryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 12);
  return `del_${timestamp}_${random}`;
}

/**
 * Generate a unique retry ID
 */
export function generateRetryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `retry_${timestamp}_${random}`;
}

/**
 * Generate a unique metric ID
 */
export function generateMetricId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `metric_${timestamp}_${random}`;
}

/**
 * Generate a UUID v4 (for more formal requirements)
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Get current timestamp in seconds (Unix timestamp)
 */
export function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Generate a future timestamp (current time + offset in milliseconds)
 */
export function getFutureTimestamp(offsetMs: number): number {
  return Date.now() + offsetMs;
}

/**
 * Check if a timestamp is expired
 */
export function isTimestampExpired(timestamp: number): boolean {
  return Date.now() > timestamp;
}

/**
 * Format timestamp for logging
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Generate R2 key for content storage
 */
export function generateR2Key(jobId: string, type: 'raw' | 'parsed' = 'raw'): string {
  const extension = type === 'raw' ? 'html' : 'json';
  return `${type}/${jobId}.${extension}`;
}

/**
 * Extract job ID from R2 key
 */
export function extractJobIdFromR2Key(r2Key: string): string | null {
  const match = r2Key.match(/^(raw|parsed)\/(.+)\.(html|json)$/);
  return match ? match[2] : null;
}

/**
 * Generate browser-specific lease key
 */
export function generateBrowserLeaseKey(browserId: string): string {
  return `browser_lease_${browserId}`;
}

/**
 * Validate job ID format
 */
export function isValidJobId(jobId: string): boolean {
  return /^j_[a-z0-9]+_[a-z0-9]+$/.test(jobId);
}

/**
 * Validate lease ID format
 */
export function isValidLeaseId(leaseId: string): boolean {
  return /^L_[a-z0-9]+_[a-z0-9]+$/.test(leaseId);
}

/**
 * Generate a short hash for content deduplication
 */
export function generateShortHash(content: string, length: number = 8): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substring(0, length);
}

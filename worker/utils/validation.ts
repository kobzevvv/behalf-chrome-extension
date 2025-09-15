/**
 * Validation Utilities
 * Input validation and sanitization functions
 */

/**
 * Validate and sanitize content type for table naming
 */
export function sanitizeContentType(contentType: string): string {
  if (!contentType || typeof contentType !== 'string') {
    return 'default';
  }
  
  // Remove special characters and convert to lowercase
  const sanitized = contentType
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50); // Limit length
  
  return sanitized || 'default';
}

/**
 * Validate content type is allowed
 */
export function validateContentType(contentType: string): boolean {
  const allowedTypes = [
    'default',
    'resumes',
    'search_results',
    'job_listings',
    'company_profiles',
    'product_pages',
    'news_articles',
    'test_content'
  ];
  
  const sanitized = sanitizeContentType(contentType);
  return allowedTypes.includes(sanitized) || /^[a-z0-9_-]+$/.test(sanitized);
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }
  
  try {
    const parsedUrl = new URL(url);
    
    // Check protocol
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }
    
    // Check for localhost in production (optional security measure)
    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      // Allow localhost for development/testing
      console.warn('Localhost URL detected:', url);
    }
    
    return { valid: true };
    
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate browser ID format
 */
export function validateBrowserId(browserId: string): { valid: boolean; error?: string } {
  if (!browserId || typeof browserId !== 'string') {
    return { valid: false, error: 'Browser ID is required' };
  }
  
  if (browserId.length < 3 || browserId.length > 100) {
    return { valid: false, error: 'Browser ID must be between 3 and 100 characters' };
  }
  
  // Allow alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(browserId)) {
    return { valid: false, error: 'Browser ID can only contain letters, numbers, hyphens, and underscores' };
  }
  
  return { valid: true };
}

/**
 * Validate task name
 */
export function validateTaskName(taskName: string): { valid: boolean; error?: string } {
  if (!taskName || typeof taskName !== 'string') {
    return { valid: false, error: 'Task name is required' };
  }
  
  const allowedTaskNames = [
    'Get Page HTML',
    'Extract Content',
    'Scrape Data',
    'Capture Screenshot',
    'Test Task'
  ];
  
  if (!allowedTaskNames.includes(taskName)) {
    return { valid: false, error: `Task name must be one of: ${allowedTaskNames.join(', ')}` };
  }
  
  return { valid: true };
}

/**
 * Validate webhook URL
 */
export function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    return urlValidation;
  }
  
  try {
    const parsedUrl = new URL(url);
    
    // Additional webhook-specific validations
    if (parsedUrl.protocol !== 'https:' && !parsedUrl.hostname.includes('localhost')) {
      return { valid: false, error: 'Webhook URLs must use HTTPS (except localhost)' };
    }
    
    // Check for common webhook patterns
    if (!parsedUrl.pathname.includes('webhook') && !parsedUrl.pathname.includes('hook')) {
      console.warn('Webhook URL does not contain "webhook" or "hook" in path:', url);
    }
    
    return { valid: true };
    
  } catch (error) {
    return { valid: false, error: 'Invalid webhook URL' };
  }
}

/**
 * Validate content size
 */
export function validateContentSize(size: number, maxSize: number = 10 * 1024 * 1024): { valid: boolean; error?: string } {
  if (typeof size !== 'number' || size < 0) {
    return { valid: false, error: 'Content size must be a positive number' };
  }
  
  if (size > maxSize) {
    return { 
      valid: false, 
      error: `Content size ${size} bytes exceeds maximum of ${maxSize} bytes` 
    };
  }
  
  return { valid: true };
}

/**
 * Validate SHA-256 hash format
 */
export function validateSHA256(hash: string): { valid: boolean; error?: string } {
  if (!hash || typeof hash !== 'string') {
    return { valid: false, error: 'SHA-256 hash is required' };
  }
  
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { valid: false, error: 'Invalid SHA-256 hash format' };
  }
  
  return { valid: true };
}

/**
 * Validate priority value
 */
export function validatePriority(priority: number): { valid: boolean; error?: string } {
  if (typeof priority !== 'number') {
    return { valid: false, error: 'Priority must be a number' };
  }
  
  if (priority < 0 || priority > 100) {
    return { valid: false, error: 'Priority must be between 0 and 100' };
  }
  
  return { valid: true };
}

/**
 * Validate lease duration
 */
export function validateLeaseDuration(durationMs: number): { valid: boolean; error?: string } {
  const minDuration = 5 * 60 * 1000; // 5 minutes
  const maxDuration = 2 * 60 * 60 * 1000; // 2 hours
  
  if (typeof durationMs !== 'number' || durationMs < minDuration || durationMs > maxDuration) {
    return { 
      valid: false, 
      error: `Lease duration must be between ${minDuration}ms and ${maxDuration}ms` 
    };
  }
  
  return { valid: true };
}

/**
 * Sanitize HTML content for safe storage
 */
export function sanitizeHtmlContent(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  // Basic HTML sanitization - remove script tags and dangerous attributes
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Validate JSON structure
 */
export function validateJsonStructure(json: any, requiredFields: string[]): { valid: boolean; error?: string } {
  if (!json || typeof json !== 'object') {
    return { valid: false, error: 'Invalid JSON object' };
  }
  
  for (const field of requiredFields) {
    if (!(field in json)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  
  return { valid: true };
}

/**
 * Validate callback secret ID
 */
export function validateCallbackSecretId(secretId: string): { valid: boolean; error?: string } {
  if (!secretId || typeof secretId !== 'string') {
    return { valid: false, error: 'Callback secret ID is required' };
  }
  
  if (secretId.length < 3 || secretId.length > 50) {
    return { valid: false, error: 'Callback secret ID must be between 3 and 50 characters' };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(secretId)) {
    return { valid: false, error: 'Callback secret ID can only contain letters, numbers, hyphens, and underscores' };
  }
  
  return { valid: true };
}

/**
 * Comprehensive request validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCreateTaskRequest(body: any): ValidationResult {
  const errors: string[] = [];
  
  // Validate browser ID
  const browserIdValidation = validateBrowserId(body.browserId);
  if (!browserIdValidation.valid) {
    errors.push(browserIdValidation.error!);
  }
  
  // Validate task name
  const taskNameValidation = validateTaskName(body.taskName);
  if (!taskNameValidation.valid) {
    errors.push(taskNameValidation.error!);
  }
  
  // Validate URL
  const urlValidation = validateUrl(body.url);
  if (!urlValidation.valid) {
    errors.push(urlValidation.error!);
  }
  
  // Validate content type (optional)
  if (body.contentType && !validateContentType(body.contentType)) {
    errors.push('Invalid content type');
  }
  
  // Validate priority (optional)
  if (body.priority !== undefined) {
    const priorityValidation = validatePriority(body.priority);
    if (!priorityValidation.valid) {
      errors.push(priorityValidation.error!);
    }
  }
  
  // Validate callback URL (optional)
  if (body.callbackUrl) {
    const webhookValidation = validateWebhookUrl(body.callbackUrl);
    if (!webhookValidation.valid) {
      errors.push(webhookValidation.error!);
    }
  }
  
  // Validate callback secret ID (optional)
  if (body.callbackSecretId) {
    const secretValidation = validateCallbackSecretId(body.callbackSecretId);
    if (!secretValidation.valid) {
      errors.push(secretValidation.error!);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

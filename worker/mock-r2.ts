/**
 * Mock R2 for Local Development
 * Simple in-memory storage to simulate R2 bucket operations
 */

export interface MockR2Object {
  key: string;
  body: ArrayBuffer | string;
  contentType?: string;
  size: number;
  uploaded: number;
}

export class MockR2Bucket {
  private objects: Map<string, MockR2Object> = new Map();

  async put(key: string, body: ArrayBuffer | string, options?: any): Promise<void> {
    const size = typeof body === 'string' ? body.length : body.byteLength;
    
    this.objects.set(key, {
      key,
      body,
      contentType: options?.httpMetadata?.contentType || 'application/octet-stream',
      size,
      uploaded: Date.now()
    });
    
    console.log(`📁 Mock R2: Stored ${size} bytes to key: ${key}`);
  }

  async get(key: string): Promise<MockR2Object | null> {
    const obj = this.objects.get(key);
    if (!obj) {
      console.log(`📁 Mock R2: Key not found: ${key}`);
      return null;
    }
    
    console.log(`📁 Mock R2: Retrieved ${obj.size} bytes from key: ${key}`);
    return obj;
  }

  async delete(key: string): Promise<void> {
    const existed = this.objects.delete(key);
    console.log(`📁 Mock R2: ${existed ? 'Deleted' : 'Key not found'}: ${key}`);
  }

  async list(options?: any): Promise<{ objects: MockR2Object[] }> {
    const prefix = options?.prefix || '';
    const objects = Array.from(this.objects.values())
      .filter(obj => obj.key.startsWith(prefix))
      .slice(0, options?.limit || 1000);
    
    console.log(`📁 Mock R2: Listed ${objects.length} objects with prefix: ${prefix}`);
    return { objects };
  }

  // Generate a simple "signed" URL for uploads (just a mock)
  async getSignedUploadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const expiresAt = Date.now() + (expiresIn * 1000);
    const signature = btoa(`${key}:${expiresAt}`);
    const url = `https://mock-r2.local/upload/${key}?signature=${signature}&expires=${expiresAt}`;
    
    console.log(`📁 Mock R2: Generated signed URL for key: ${key} (expires in ${expiresIn}s)`);
    return url;
  }

  // Mock the signed URL upload process
  async handleSignedUpload(key: string, body: ArrayBuffer | string, signature: string): Promise<boolean> {
    try {
      // In a real implementation, we'd verify the signature
      // For mock, just store the object
      await this.put(key, body);
      console.log(`📁 Mock R2: Signed upload successful for key: ${key}`);
      return true;
    } catch (error) {
      console.error(`📁 Mock R2: Signed upload failed for key: ${key}`, error);
      return false;
    }
  }

  // Get stats about stored objects
  getStats(): { totalObjects: number; totalSize: number; keys: string[] } {
    const objects = Array.from(this.objects.values());
    const totalSize = objects.reduce((sum, obj) => sum + obj.size, 0);
    const keys = objects.map(obj => obj.key);
    
    return {
      totalObjects: objects.length,
      totalSize,
      keys
    };
  }
}

// Global mock R2 bucket for persistence across requests
let mockR2Bucket: MockR2Bucket | null = null;

export function getMockR2Bucket(): MockR2Bucket {
  if (!mockR2Bucket) {
    console.log('🔧 Creating mock R2 bucket');
    mockR2Bucket = new MockR2Bucket();
  }
  return mockR2Bucket;
}

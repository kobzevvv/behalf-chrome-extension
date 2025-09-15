/**
 * Mock Durable Object for Local Development
 * Simulates Durable Object behavior using in-memory storage
 */

export interface MockDurableObjectState {
  storage: MockDurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export class MockDurableObjectStorage {
  private data: Map<string, any> = new Map();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key);
  }

  async put(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(): Promise<Map<string, any>> {
    return new Map(this.data);
  }
}

export class MockDurableObjectState implements MockDurableObjectState {
  storage: MockDurableObjectStorage;

  constructor() {
    this.storage = new MockDurableObjectStorage();
  }

  async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    // In a real DO, this would block other requests
    // For mock, just execute the function
    return await fn();
  }
}

// Global storage for mock DOs to persist across requests
const mockDOStorage = new Map<string, MockDurableObjectState>();

export function getMockDurableObjectState(id: string): MockDurableObjectState {
  if (!mockDOStorage.has(id)) {
    console.log(`🔧 Creating mock Durable Object state for ID: ${id}`);
    mockDOStorage.set(id, new MockDurableObjectState());
  }
  return mockDOStorage.get(id)!;
}

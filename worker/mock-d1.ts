/**
 * Mock D1 Database for Local Development
 * Simulates D1 database operations using in-memory storage
 */

export interface D1Result<T = any> {
  results?: T[];
  success: boolean;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = any>(): Promise<D1Result<T>>;
}

export class MockD1Database {
  private tables: Map<string, any[]> = new Map();
  private autoIncrement: Map<string, number> = new Map();

  constructor() {
    // Initialize with our schema tables
    this.tables.set('jobs', []);
    this.tables.set('artifacts', []);
    this.tables.set('callbacks', []);
    this.tables.set('job_retries', []);
    this.tables.set('job_metrics', []);
    this.tables.set('system_config', [
      { config_key: 'lease_duration_ms', config_value: '1800000', config_type: 'number', description: 'Task lease duration (30 min)', updated_at: Date.now() },
      { config_key: 'max_retries', config_value: '3', config_type: 'number', description: 'Max retry attempts per job', updated_at: Date.now() },
      { config_key: 'webhook_timeout_ms', config_value: '30000', config_type: 'number', description: 'Webhook request timeout', updated_at: Date.now() },
      { config_key: 'max_content_size_bytes', config_value: '10485760', config_type: 'number', description: 'Max content size (10MB)', updated_at: Date.now() },
      { config_key: 'heartbeat_interval_ms', config_value: '300000', config_type: 'number', description: 'Heartbeat interval (5 min)', updated_at: Date.now() }
    ]);
    this.tables.set('api_tokens', []);
    this.tables.set('browser_auth', []);
    this.tables.set('system_health', []);
    this.tables.set('retention_policies', [
      { policy_id: 'default', content_type: '*', raw_retention_days: 90, parsed_retention_days: 365, archive_to_cold_storage: false, created_at: Date.now() },
      { policy_id: 'test-content', content_type: 'test-content', raw_retention_days: 1, parsed_retention_days: 7, archive_to_cold_storage: false, created_at: Date.now() },
      { policy_id: 'resumes', content_type: 'resumes', raw_retention_days: 180, parsed_retention_days: 730, archive_to_cold_storage: true, created_at: Date.now() }
    ]);
  }

  prepare(query: string): D1PreparedStatement {
    return new MockD1PreparedStatement(query, this);
  }

  batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return Promise.all(statements.map(stmt => (stmt as MockD1PreparedStatement).run()));
  }

  // Internal methods for mock operations
  _insert(table: string, data: any): D1Result {
    if (!this.tables.has(table)) {
      this.tables.set(table, []);
    }
    
    const tableData = this.tables.get(table)!;
    tableData.push({ ...data });
    
    return {
      success: true,
      meta: {
        duration: Math.random() * 10,
        changes: 1,
        last_row_id: tableData.length,
        rows_read: 0,
        rows_written: 1
      }
    };
  }

  _select(table: string, where?: any, limit?: number): any[] {
    if (!this.tables.has(table)) {
      return [];
    }
    
    let results = [...this.tables.get(table)!]; // Clone array to avoid mutations
    
    // Simple where clause matching
    if (where) {
      results = results.filter(row => {
        return Object.entries(where).every(([key, value]) => row[key] === value);
      });
    }
    
    // Apply limit
    if (limit) {
      results = results.slice(0, limit);
    }
    
    console.log(`Mock D1: _select returning ${results.length} results from ${table}:`, results);
    
    return results;
  }

  _update(table: string, updates: any, where: any): D1Result {
    if (!this.tables.has(table)) {
      return { success: false, meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 } };
    }
    
    const tableData = this.tables.get(table)!;
    let changes = 0;
    
    for (let i = 0; i < tableData.length; i++) {
      const row = tableData[i];
      const matches = Object.entries(where).every(([key, value]) => row[key] === value);
      
      if (matches) {
        Object.assign(row, updates);
        changes++;
      }
    }
    
    return {
      success: true,
      meta: {
        duration: Math.random() * 10,
        changes,
        last_row_id: 0,
        rows_read: tableData.length,
        rows_written: changes
      }
    };
  }

  _delete(table: string, where: any): D1Result {
    if (!this.tables.has(table)) {
      return { success: false, meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 } };
    }
    
    const tableData = this.tables.get(table)!;
    const originalLength = tableData.length;
    
    const filtered = tableData.filter(row => {
      return !Object.entries(where).every(([key, value]) => row[key] === value);
    });
    
    this.tables.set(table, filtered);
    const changes = originalLength - filtered.length;
    
    return {
      success: true,
      meta: {
        duration: Math.random() * 10,
        changes,
        last_row_id: 0,
        rows_read: originalLength,
        rows_written: 0
      }
    };
  }
}

class MockD1PreparedStatement implements D1PreparedStatement {
  private bindings: any[] = [];

  constructor(private query: string, private db: MockD1Database) {}

  bind(...values: any[]): D1PreparedStatement {
    this.bindings = values;
    return this;
  }

  async first<T = any>(): Promise<T | null> {
    const result = await this.all<T>();
    return result.results && result.results.length > 0 ? result.results[0] : null;
  }

  async run(): Promise<D1Result> {
    return this._execute();
  }

  async all<T = any>(): Promise<D1Result<T>> {
    return this._execute();
  }

  private _execute(): D1Result {
    const query = this.query.toLowerCase().trim();
    
    try {
      if (query.startsWith('insert')) {
        return this._handleInsert();
      } else if (query.startsWith('select')) {
        return this._handleSelect();
      } else if (query.startsWith('update')) {
        return this._handleUpdate();
      } else if (query.startsWith('delete')) {
        return this._handleDelete();
      } else {
        // For other queries (CREATE TABLE, etc.), just return success
        return {
          success: true,
          meta: {
            duration: 1,
            changes: 0,
            last_row_id: 0,
            rows_read: 0,
            rows_written: 0
          }
        };
      }
    } catch (error) {
      console.error('Mock D1 query error:', error);
      return {
        success: false,
        meta: {
          duration: 1,
          changes: 0,
          last_row_id: 0,
          rows_read: 0,
          rows_written: 0
        }
      };
    }
  }

  private _handleInsert(): D1Result {
    // Simple INSERT parsing - this is a mock, so we'll make assumptions
    const match = this.query.match(/insert\s+(?:or\s+replace\s+)?into\s+(\w+)/i);
    if (!match) throw new Error('Could not parse INSERT statement');
    
    const table = match[1];
    
    console.log(`Mock D1: INSERT into ${table} with ${this.bindings.length} bindings:`, this.bindings);
    
    // For mock purposes, create a simple object from bindings
    // In a real implementation, you'd parse the column names
    const data: any = {};
    
    // Common patterns for our schema
    if (table === 'jobs') {
      data.job_id = this.bindings[0];
      data.browser_id = this.bindings[1];
      data.task_name = this.bindings[2];
      data.url = this.bindings[3];
      data.content_type = this.bindings[4];
      data.state = this.bindings[5];
      data.priority = this.bindings[6];
      data.callback_url = this.bindings[7];
      data.callback_secret_id = this.bindings[8];
      data.created_at = this.bindings[9];
      data.updated_at = this.bindings[10];
      
      console.log(`Mock D1: Creating job record:`, data);
    } else if (table === 'artifacts') {
      data.job_id = this.bindings[0];
      data.raw_r2_key = this.bindings[1];
      data.raw_sha256 = this.bindings[2];
      data.raw_bytes = this.bindings[3];
      data.raw_content_type = this.bindings[4];
      data.created_at = this.bindings[5];
      data.updated_at = this.bindings[6];
    } else {
      // Generic handling
      this.bindings.forEach((value, index) => {
        data[`col_${index}`] = value;
      });
    }
    
    const result = this.db._insert(table, data);
    console.log(`Mock D1: INSERT result:`, result);
    return result;
  }

  private _handleSelect(): D1Result {
    const match = this.query.match(/from\s+(\w+)/i);
    if (!match) throw new Error('Could not parse SELECT statement');
    
    const table = match[1];
    
    console.log(`Mock D1: SELECT from ${table} with ${this.bindings.length} bindings:`, this.bindings);
    console.log(`Mock D1: Query:`, this.query);
    
    // Enhanced WHERE clause parsing for our specific queries
    let whereClause: any = {};
    if (this.bindings.length > 0) {
      if (table === 'jobs') {
        // Handle different job query patterns - order matters!
        if (this.query.includes('job_id') && this.query.includes('lease_id')) {
          // This is likely a lease validation query: WHERE job_id = ? AND lease_id = ?
          whereClause.job_id = this.bindings[0];
          whereClause.lease_id = this.bindings[1];
        } else if (this.query.includes('browser_id') && this.query.includes('state') && this.bindings.length >= 2) {
          // This is likely a lease query: WHERE browser_id = ? AND state = 'queued'
          console.log('Mock D1: Detected lease query with browser_id and state');
          whereClause.browser_id = this.bindings[0];
          whereClause.state = 'queued'; // Assume queued for lease queries
        } else if (this.query.includes('job_id') && this.query.includes("state = 'leased'")) {
          // Upload URL query: WHERE job_id = ? AND state = 'leased'
          whereClause.job_id = this.bindings[0];
          whereClause.state = 'leased';
        } else if (this.query.includes('WHERE job_id = ?')) {
          // Simple job lookup by ID - most specific match first
          whereClause.job_id = this.bindings[0];
        } else if (this.query.includes('job_id')) {
          // Other job_id queries
          whereClause.job_id = this.bindings[0];
        } else if (this.query.includes('browser_id')) {
          // Simple browser lookup
          whereClause.browser_id = this.bindings[0];
        }
      }
    }
    
    console.log(`Mock D1: WHERE clause:`, whereClause);
    
    // Handle LIMIT
    let limit: number | undefined;
    const limitMatch = this.query.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      limit = parseInt(limitMatch[1]);
    } else if (this.query.includes('limit ?')) {
      // For queries like "LIMIT ?" the limit is usually the last binding
      if (table === 'jobs' && this.query.includes('browser_id') && this.bindings.length >= 2) {
        limit = this.bindings[1]; // Second binding is limit for browser_id queries
      } else if (this.bindings.length > 0) {
        limit = this.bindings[this.bindings.length - 1];
      }
    }
    
    console.log(`Mock D1: LIMIT:`, limit);
    
    const results = this.db._select(table, whereClause, limit);
    
    console.log(`Mock D1: SELECT results:`, results.length, 'rows');
    
    return {
      results,
      success: true,
      meta: {
        duration: Math.random() * 10,
        changes: 0,
        last_row_id: 0,
        rows_read: results.length,
        rows_written: 0
      }
    };
  }

  private _handleUpdate(): D1Result {
    const match = this.query.match(/update\s+(\w+)/i);
    if (!match) throw new Error('Could not parse UPDATE statement');
    
    const table = match[1];
    
    // Simple update handling - assumes last binding is the WHERE clause value
    const updates: any = {};
    const whereClause: any = {};
    
    if (table === 'jobs') {
      // Handle lease update: SET state = 'leased', lease_id = ?, lease_until = ?, updated_at = ? WHERE job_id = ?
      if (this.query.includes('state') && this.query.includes('leased')) {
        updates.state = 'leased'; // hardcoded in query
        updates.lease_id = this.bindings[0];
        updates.lease_until = this.bindings[1];
        updates.updated_at = this.bindings[2];
        whereClause.job_id = this.bindings[3];
        
        console.log('Mock D1: Lease UPDATE with bindings:', this.bindings);
        console.log('Mock D1: Updates:', updates);
        console.log('Mock D1: Where clause:', whereClause);
      }
    }
    
    return this.db._update(table, updates, whereClause);
  }

  private _handleDelete(): D1Result {
    const match = this.query.match(/delete\s+from\s+(\w+)/i);
    if (!match) throw new Error('Could not parse DELETE statement');
    
    const table = match[1];
    const whereClause: any = {};
    
    // Simple WHERE clause
    if (this.bindings.length > 0) {
      whereClause.id = this.bindings[0]; // Assume deleting by ID
    }
    
    return this.db._delete(table, whereClause);
  }
}

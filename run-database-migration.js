#!/usr/bin/env node

/**
 * Database Migration Script for Enhanced Behalf Chrome Extension
 * 
 * This script migrates the database to the new behalf_chrome_extension schema
 * with multi-table content extraction support.
 * 
 * Usage:
 *   node run-database-migration.js
 * 
 * Prerequisites:
 *   - .env file with DATABASE_URL
 *   - Node.js with pg package installed
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load environment variables
try {
  require('dotenv').config();
} catch (e) {
  console.log('dotenv not installed, skipping .env file loading');
}

const { Client } = require('pg');

async function runMigration() {
  console.log('🚀 Starting Enhanced Database Migration for Behalf Chrome Extension...\n');

  // Validate environment
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.error('   Please create a .env file with your DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database successfully\n');

    // Read and execute migration script
    console.log('📜 Reading migration script...');
    const migrationSql = readFileSync('./database-migration-enhanced.sql', 'utf8');
    
    console.log('⚡ Executing migration script...');
    console.log('   This may take a few moments for large datasets...\n');
    
    await client.query(migrationSql);
    
    console.log('✅ Migration executed successfully!\n');

    // Verify migration results
    console.log('🔍 Verifying migration results...');
    
    const verificationQueries = [
      {
        name: 'Schema Creation',
        query: `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'behalf_chrome_extension'`,
        expectedCount: 1
      },
      {
        name: 'Tasks Queue Table',
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'behalf_chrome_extension' AND table_name = 'tasks_queue'`,
        expectedCount: 1
      },
      {
        name: 'Task Completions Table',
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'behalf_chrome_extension' AND table_name = 'task_completions'`,
        expectedCount: 1
      },
      {
        name: 'Default Content Table',
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'behalf_chrome_extension' AND table_name = 'page_html_default'`,
        expectedCount: 1
      },
      {
        name: 'Migrated Tasks',
        query: `SELECT COUNT(*) as count FROM behalf_chrome_extension.tasks_queue`,
        logResult: true
      },
      {
        name: 'Migrated Content',
        query: `SELECT COUNT(*) as count FROM behalf_chrome_extension.page_html_default`,
        logResult: true
      },
      {
        name: 'Task Completions',
        query: `SELECT COUNT(*) as count FROM behalf_chrome_extension.task_completions`,
        logResult: true
      }
    ];

    for (const verification of verificationQueries) {
      try {
        const result = await client.query(verification.query);
        
        if (verification.expectedCount !== undefined) {
          const actualCount = result.rows.length;
          if (actualCount === verification.expectedCount) {
            console.log(`   ✅ ${verification.name}: OK`);
          } else {
            console.log(`   ❌ ${verification.name}: Expected ${verification.expectedCount}, got ${actualCount}`);
          }
        }
        
        if (verification.logResult) {
          const count = result.rows[0]?.count || 0;
          console.log(`   📊 ${verification.name}: ${count} records`);
        }
      } catch (error) {
        console.log(`   ❌ ${verification.name}: Error - ${error.message}`);
      }
    }

    console.log('\n🎉 Database migration completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Test the enhanced worker locally: npm run test-worker');
    console.log('   2. Deploy to Cloudflare: npm run deploy-worker');
    console.log('   3. Verify deployment with new multi-table functionality');
    
    console.log('\n💡 New Features Available:');
    console.log('   • Multi-table content extraction (resumes, search results, etc.)');
    console.log('   • Enhanced task queueing with table_name parameter');
    console.log('   • Content deduplication with SHA-256 hashing');
    console.log('   • Detailed task completion tracking');
    console.log('   • Performance monitoring and statistics');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error details:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().catch((error) => {
    console.error('Migration script error:', error);
    process.exit(1);
  });
}

export { runMigration };




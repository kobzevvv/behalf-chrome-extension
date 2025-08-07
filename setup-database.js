#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    console.log('Please make sure you have a .env file with your Neon database connection string');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔗 Connecting to database...');
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to database successfully');
    
    // Check if we can read existing tables (safety check)
    const existingTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log(`📊 Found ${existingTables.rows.length} existing tables in database`);

    // Read and execute the SQL setup script
    const fs = require('fs');
    const sqlScript = fs.readFileSync('./database-setup.sql', 'utf8');
    
    console.log('📝 Setting up database tables...');
    console.log('⚠️  This script is SAFE and will not affect existing data');
    await client.query(sqlScript);
    
    console.log('✅ Database setup completed successfully!');
    
    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('tasks_ques', 'worker_report')
    `);
    
    console.log('📊 Created tables:', tablesResult.rows.map(row => row.table_name));
    
    // Check test data
    const testDataResult = await client.query(`
      SELECT browser_id, Task, created_at 
      FROM tasks_ques 
      WHERE browser_id = 'test_browser_id'
    `);
    
    if (testDataResult.rows.length > 0) {
      console.log('✅ Test data inserted successfully');
      console.log('   Browser ID:', testDataResult.rows[0].browser_id);
      console.log('   Task:', testDataResult.rows[0].Task);
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
setupDatabase();

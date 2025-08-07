#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function addTestTask() {
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

    // Check if test task already exists
    const existingTask = await client.query(`
      SELECT * FROM tasks_ques 
      WHERE browser_id = 'test_browser_id'
    `);

    if (existingTask.rows.length > 0) {
      console.log('✅ Test task already exists');
      console.log('   Browser ID:', existingTask.rows[0].browser_id);
      console.log('   Task:', existingTask.rows[0].task);
    } else {
      // Insert test task
      console.log('📝 Adding test task to database...');
      
      await client.query(`
        INSERT INTO tasks_ques (browser_id, Task, Params_json) 
        VALUES ($1, $2, $3)
      `, [
        'test_browser_id',
        'Get Page HTML',
        JSON.stringify({
          URL: 'https://hh.ru/resume/22c04954000baf52a70097a6046b517a693869?hhtmFrom=chat&vacancyId=123286350&resumeId=196039335&t=4664068255'
        })
      ]);

      console.log('✅ Test task added successfully!');
      console.log('   Browser ID: test_browser_id');
      console.log('   Task: Get Page HTML');
      console.log('   URL: https://hh.ru/resume/22c04954000baf52a70097a6046b517a693869?hhtmFrom=chat&vacancyId=123286350&resumeId=196039335&t=4664068255');
    }

    // Show all tasks in the table
    const allTasks = await client.query(`
      SELECT browser_id, Task, created_at 
      FROM tasks_ques 
      ORDER BY created_at DESC
    `);

    console.log('\n📊 All tasks in database:');
    allTasks.rows.forEach((task, index) => {
      console.log(`   ${index + 1}. Browser ID: ${task.browser_id}, Task: ${task.task}, Created: ${task.created_at}`);
    });

    client.release();
    
  } catch (error) {
    console.error('❌ Failed to add test task:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
addTestTask();

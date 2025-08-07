// Configuration - you'll need to update these URLs
const CLOUDFLARE_WORKER_URL = 'https://behalf-task-manager-production.dev-a96.workers.dev'; // Update this
const TASK_CHECK_ENDPOINT = '/api/check-task';
const TASK_REPORT_ENDPOINT = '/api/report-task';

let taskCheckInterval = null;
let currentBrowserId = null;
let currentTaskInterval = 300; // Default 5 minutes

// Initialize on extension load
chrome.runtime.onStartup.addListener(initializeExtension);
chrome.runtime.onInstalled.addListener(initializeExtension);

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'updateBrowserId':
      currentBrowserId = message.browserId;
      startTaskChecking();
      sendResponse({ success: true });
      break;
      
    case 'updateTaskInterval':
      currentTaskInterval = message.interval;
      startTaskChecking();
      sendResponse({ success: true });
      break;
      
    case 'testConnection':
      testConnection(message.browserId, sendResponse);
      return true; // Keep message channel open for async response
      
    case "runTasksNow":
      runTasksNow(message.browserId, sendResponse);
      return true; // Keep message channel open for async response
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

function initializeExtension() {
  // Load saved settings
  chrome.storage.local.get(['browserId', 'taskInterval'], function(result) {
    if (result.browserId) {
      currentBrowserId = result.browserId;
    }
    if (result.taskInterval) {
      currentTaskInterval = result.taskInterval;
    }
    
    if (currentBrowserId) {
      startTaskChecking();
    }
  });
}

function startTaskChecking() {
  // Clear existing interval
  if (taskCheckInterval) {
    clearInterval(taskCheckInterval);
  }
  
  // Start new interval if we have a browser ID
  if (currentBrowserId) {
    taskCheckInterval = setInterval(checkForTasks, currentTaskInterval * 1000);
    console.log(`Task checking started with interval: ${currentTaskInterval} seconds`);
  }
}

async function checkForTasks() {
  if (!currentBrowserId) {
    console.log('No browser ID set, skipping task check');
    return;
  }

  try {
    console.log('Checking for tasks...');
    
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}${TASK_CHECK_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        browserId: currentBrowserId
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const taskData = await response.json();
    
    if (taskData.hasTask) {
      console.log('Task received:', taskData.task);
      await executeTask(taskData.task);
    } else {
      console.log('No tasks available');
    }
    
  } catch (error) {
    console.error('Error checking for tasks:', error);
  }
}

async function executeTask(task) {
  try {
    console.log('Executing task:', task.taskName);
    
    let result = null;
    
    switch (task.taskName) {
      case 'Get Page HTML':
        result = await getPageHTML(task.paramsJson.URL);
        break;
      case "runTasksNow":
      runTasksNow(message.browserId, sendResponse);
      return true; // Keep message channel open for async response
      
    default:
        throw new Error(`Unknown task type: ${task.taskName}`);
    }
    
    // Report task completion
    await reportTaskCompletion(task, result);
    
  } catch (error) {
    console.error('Error executing task:', error);
    await reportTaskCompletion(task, { error: error.message });
  }
}

async function getPageHTML(url) {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    // Navigate to the URL if it's different from current tab
    if (tab.url !== url) {
      await chrome.tabs.update(tab.id, { url: url });
      
      // Wait for page to load
      await new Promise((resolve) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        });
      });
    }
    
    // Execute script to get page HTML
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML
    });
    
    return {
      htmlContent: results[0].result
    };
    
  } catch (error) {
    console.error('Error getting page HTML:', error);
    throw error;
  }
}

async function reportTaskCompletion(task, result) {
  try {
    const reportData = {
      datime: new Date().toISOString(),
      taskName: task.taskName,
      version: '0.1',
      artifactsJson: result
    };
    
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}${TASK_REPORT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reportData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('Task completion reported successfully');
    
  } catch (error) {
    console.error('Error reporting task completion:', error);
  }
}

async function testConnection(browserId, sendResponse) {
  try {
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}${TASK_CHECK_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        browserId: browserId
      })
    });
    
    if (response.ok) {
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: `HTTP ${response.status}` });
    }
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
} 
async function runTasksNow(browserId, sendResponse) {
  try {
    console.log('Manual task execution triggered for browserId:', browserId);
    
    // Use the same logic as checkForTasks but with the provided browserId
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}${TASK_CHECK_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        browserId: browserId
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const taskData = await response.json();
    
    if (taskData.hasTask) {
      console.log('Task found and executing:', taskData.task);
      await executeTask(taskData.task);
      sendResponse({ success: true, message: 'Task executed successfully' });
    } else {
      console.log('No tasks available for manual execution');
      sendResponse({ success: true, message: 'No tasks available' });
    }
    
  } catch (error) {
    console.error('Error in manual task execution:', error);
    sendResponse({ success: false, error: error.message });
  }
}

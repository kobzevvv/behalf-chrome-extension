document.addEventListener('DOMContentLoaded', function() {
  const browserIdInput = document.getElementById('browserIdInput');
  const setBrowserIdBtn = document.getElementById('setBrowserIdBtn');
  const currentBrowserId = document.getElementById('currentBrowserId');
  const browserIdDisplay = document.getElementById('browserIdDisplay');
  const taskInterval = document.getElementById('taskInterval');
  const saveIntervalBtn = document.getElementById('saveIntervalBtn');
  const statusMessage = document.getElementById('statusMessage');
  const testConnectionBtn = document.getElementById('testConnectionBtn');

  // Load saved values on popup open
  loadSavedValues();

  // Set Browser ID button click handler
  setBrowserIdBtn.addEventListener('click', function() {
    const browserId = browserIdInput.value.trim();
    if (!browserId) {
      showStatus('Please enter a browser ID', 'error');
      return;
    }

    chrome.storage.local.set({ browserId: browserId }, function() {
      showStatus('Browser ID saved successfully!', 'success');
      displayCurrentBrowserId(browserId);
      browserIdInput.value = '';
      
      // Send message to background script to update task checking
      chrome.runtime.sendMessage({
        action: 'updateBrowserId',
        browserId: browserId
      });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
    });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
  });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });

  // Save Interval button click handler
  saveIntervalBtn.addEventListener('click', function() {
    const interval = parseInt(taskInterval.value);
    if (interval < 30 || interval > 3600) {
      showStatus('Interval must be between 30 and 3600 seconds', 'error');
      return;
    }

    chrome.storage.local.set({ taskInterval: interval }, function() {
      showStatus('Task interval saved successfully!', 'success');
      
      // Send message to background script to update interval
      chrome.runtime.sendMessage({
        action: 'updateTaskInterval',
        interval: interval
      });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
    });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
  });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });

  // Test Connection button click handler
  testConnectionBtn.addEventListener('click', function() {
    chrome.storage.local.get(['browserId'], function(result) {
      if (!result.browserId) {
        showStatus('Please set a browser ID first', 'error');
        return;
      }

      // Send test request to background script
      chrome.runtime.sendMessage({
        action: 'testConnection',
        browserId: result.browserId
      }, function(response) {
        if (response && response.success) {
          showStatus('Connection test successful!', 'success');
        } else {
          showStatus('Connection test failed: ' + (response?.error || 'Unknown error'), 'error');
        }
      });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
    });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
  // Run Tasks Now button click handler
  runTasksNowBtn.addEventListener("click", function() {
    chrome.storage.local.get(["browserId"], function(result) {
      if (!result.browserId) {
        showStatus("Please set a browser ID first", "error");
        return;
      }

      showStatus("Running tasks now...", "success");

      // Send manual task execution request to background script
      chrome.runtime.sendMessage({
        action: "runTasksNow",
        browserId: result.browserId
      }, function(response) {
        if (response && response.success) {
          showStatus("Tasks executed successfully!", "success");
        } else {
          showStatus("Task execution failed: " + (response?.error || "Unknown error"), "error");
        }
      });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
    });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
  });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });  });

  function loadSavedValues() {
    chrome.storage.local.get(['browserId', 'taskInterval'], function(result) {
      if (result.browserId) {
        displayCurrentBrowserId(result.browserId);
      }
      if (result.taskInterval) {
        taskInterval.value = result.taskInterval;
      }
    });

  // Clear Status button click handler
  clearStatusBtn.addEventListener("click", function() {
    statusMessage.textContent = "";
    statusMessage.className = "status";
    clearStatusBtn.style.display = "none";
  });
  }

  function displayCurrentBrowserId(browserId) {
    browserIdDisplay.textContent = browserId;
    currentBrowserId.style.display = 'block';
  }

  function showStatus(message, type) {
    clearStatusBtn.style.display = type === "error" ? "block" : "none";
    statusMessage.textContent = message;
    statusMessage.className = 'status ' + type;
    
    // Clear status after 10 seconds for errors, 5 seconds for success
        const timeout = type === "error" ? 10000 : 5000;
    setTimeout(() => {
      statusMessage.textContent = '';
      statusMessage.className = 'status';
    }, 3000);
  }
}); 
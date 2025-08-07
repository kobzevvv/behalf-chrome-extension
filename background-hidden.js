// Alternative version with hidden tabs (for reference)
async function getPageHTMLHidden(url) {
  try {
    // Create a completely hidden tab (not visible in UI)
    const newTab = await chrome.tabs.create({
      url: url,
      active: false,
      pinned: false,
      // Note: Chrome doesn't support truly hidden tabs, but we can minimize visibility
    });
    
    console.log('Created hidden tab:', newTab.id);
    
    // Wait for page to load
    await new Promise((resolve) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });
    
    // Execute script to get page HTML
    const results = await chrome.scripting.executeScript({
      target: { tabId: newTab.id },
      func: () => document.documentElement.outerHTML
    });
    
    // Close the hidden tab after getting HTML
    await chrome.tabs.remove(newTab.id);
    console.log('Closed hidden tab:', newTab.id);
    
    return {
      htmlContent: results[0].result
    };
    
  } catch (error) {
    console.error('Error getting page HTML:', error);
    throw error;
  }
}

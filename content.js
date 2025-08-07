// Content script for potential future functionality
// Currently minimal as the main functionality is handled by background script

console.log('Behalf Task Manager content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  sendResponse({ received: true });
}); 
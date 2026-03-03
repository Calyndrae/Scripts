// background.js - Handles secure cross-origin API requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchAPI") {
        fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.data
        })
        .then(async response => {
            const text = await response.text();
            sendResponse({ status: response.status, responseText: text });
        })
        .catch(error => {
            sendResponse({ error: error.toString() });
        });
        return true; // Tells Chrome we will send the response asynchronously
    }
});

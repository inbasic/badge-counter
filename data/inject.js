'use strict';

window.addEventListener('message', ({data}) => {
  if (data && data.method === 'request-update') {
    chrome.runtime.sendMessage({
      method: 'request-update'
    });
  }
});
// a new gmail tab is opened
chrome.runtime.sendMessage({
  method: 'request-update'
});

document.documentElement.appendChild(Object.assign(document.createElement('script'), {
  textContent: `
  {
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      open.apply(this, arguments);
      if (url && url.indexOf('&act=') !== -1 && url.indexOf('act=prefs') === -1) {
        window.postMessage({
          method: 'request-update'
        }, '*');
      }
    }
  }
  `
}));

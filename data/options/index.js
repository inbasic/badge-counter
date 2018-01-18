/* globals webext */
'use strict';

var init = () => webext.storage.get({
  color: '#a03333',
  query: 'https://mail.google.com/mail/u/[account]/#search/[query]',
  thread: 'https://mail.google.com/mail/u/[account]/#search/[query]/[thread]',
  account: 'https://mail.google.com/mail/u/[account]/#inbox',
  mode: 'thread',
  queries: ['is:unread label:inbox', 'is:unread label:inbox a:1'],
  period: 15,
  delay: 5,
  'in-background': false,
  'next-to-active': false,
  'single-tab': true
}).then(prefs => {
  document.getElementById('color').value = prefs.color;
  document.getElementById('mode').value = prefs.mode;
  document.getElementById('query').value = prefs.query;
  document.getElementById('thread').value = prefs.thread;
  document.getElementById('account').value = prefs.account;
  document.getElementById('delay').value = prefs.delay;
  document.getElementById('period').value = prefs.period;
  document.getElementById('queries').value = prefs.queries.join(', ');

  document.getElementById('in-background').checked = prefs['in-background'];
  document.getElementById('next-to-active').checked = prefs['next-to-active'];
  document.getElementById('single-tab').checked = prefs['single-tab'];
});
document.addEventListener('DOMContentLoaded', init);

document.getElementById('save').addEventListener('click', () => {
  const queries = document.getElementById('queries').value.split(/\s*,\s*/).map(s => s.trim())
    .filter((s, i, l) => s && l.indexOf(s) === i);
  webext.storage.set({
    color: document.getElementById('color').value,
    mode: document.getElementById('mode').value,
    account: document.getElementById('account').value,
    thread: document.getElementById('thread').value,
    query: document.getElementById('query').value,
    period: Math.max(Number(document.getElementById('period').value), 2),
    delay: Math.max(Number(document.getElementById('delay').value), 1),
    queries,
    'in-background': document.getElementById('in-background').checked,
    'next-to-active': document.getElementById('next-to-active').checked,
    'single-tab': document.getElementById('single-tab').checked,
  }).then(() => {
    const info = document.getElementById('info');
    info.textContent = 'Options saved';
    window.setTimeout(() => info.textContent = '', 750);
  });
  webext.browserAction.setBadgeBackgroundColor({
    color: document.getElementById('color').value
  });
  init();
});

document.getElementById('support').addEventListener('click', () => webext.tabs.create({
  url: chrome.runtime.getManifest().homepage_url + '?rd=donate'
}));

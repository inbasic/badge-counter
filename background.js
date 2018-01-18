/* globals gmail, webext */
'use strict';

var open = url => Promise.all([
  webext.storage.get({
    'in-background': false,
    'next-to-active': false,
    'single-tab': true
  }),
  webext.tabs.query({
    url: '*://*/*'
  }),
  webext.tabs.query({
    currentWindow: true,
    active: true
  }),
  webext.tabs.query({}),
]).then(([prefs, tabs, activeTabs]) => {
  const newtab = () => {
    const options = {
      url
    };
    if (prefs['next-to-active'] && activeTabs.length) {
      options.index = activeTabs[0].index + 1;
    }
    if (prefs['in-background']) {
      options.active = false;
    }
    webext.tabs.create(options);
  };

  if (prefs['single-tab'] === false) {
    newtab();
  }
  else {
    if (tabs.length) {
      webext.tabs.update(tabs[0].id, {
        url,
        active: true
      });
      webext.windows.update(tabs[0].windowId, {
        focused: true
      });
    }
    else {
      newtab();
    }
  }
});

var search = () => {
  var get = query => {
    const reg = /\ba:(\d+)/;
    const account = (reg.exec(query) || [null, 0])[1];
    query = query.replace(reg, '').trim();
    return gmail.search({
      url: 'https://mail.google.com/mail/u/' + account,
      query,
    }).then(o => {
      if (o.responseURL.indexOf(`/u/${account}/`) === -1) {
        return Object.assign(o, {
          count: 0,
          'logged-in': false,
          entries: []
        });
      }
      o.account = account;
      o.query = query;
      return o;
    }).catch(e => e);
  };

  webext.storage.get({
    queries: ['is:unread label:inbox', 'is:unread label:inbox a:1'],
    labels: []
  }).then(prefs => Promise.all(prefs.queries.map(get)).then(arr => {
    const labels = arr.filter(o => o.entries && o.name).map(o => o.name + '/' + o.account)
      .filter((n, i, l) => l.indexOf(n) === i);
    console.log(arr, labels);
    if (
      labels.length !== prefs.labels.length ||
      labels.filter((n, i) => n === prefs.labels[i]).length !== labels.length
    ) {
      webext.storage.set({
        labels
      });
    }
    const active = arr.filter(o => o.count).map(o => Object.assign({
      account: o.account,
      query: o.query
    }, o.entries[0])).sort((a, b) => b.date - a.date).shift();
    if (active) {
      webext.storage.set({
        active: {
          account: active.account,
          thread: active.thread,
          query: active.query
        }
      });
    }
    else {
      webext.storage.remove('active');
    }

    webext.browserAction.setTitle({
      title: arr.map((r, i) => {
        if (r['logged-in']) {
          return `${r.count}\t→ ${r.name || 'unknown account'} (${r.query})`;
        }
        return '?\t→ ' + prefs.queries[i];
      }).join('\n')
    });
    const count = arr.reduce((p, c) => p + (c.entries ? c.count : 0), 0);
    webext.browserAction.setBadgeText({
      text: count ? String(count) : ''
    });
  }));
};

// alarm
var alarm = delay => webext.storage.get({
  period: 15, // in minutes
  delay: 5 // in seconds
}).then(prefs => webext.alarms.clearAll(() => webext.alarms.create({
  when: Date.now() + (delay || prefs.delay) * 1000,
  periodInMinutes: prefs.period
})));
webext.alarms.on('alarm', search);

// alarm conditions
webext.runtime.on('start-up', () => alarm());
webext.runtime.on('message', () => alarm(1)).if(r => r.method === 'request-update');
webext.storage.on('changed', () => alarm(1)).if(p => p.period || p.queries);
webext.contextMenus.on('clicked', () => {
  webext.browserAction.setBadgeText({
    text: '.'
  });
  alarm(1);
}).if(({menuItemId}) => menuItemId === 'refresh');

// browser action
webext.browserAction.on('clicked', () => webext.storage.get({
  active: null,
  mode: 'thread',
  query: 'https://mail.google.com/mail/u/[account]/#search/[query]',
  thread: 'https://mail.google.com/mail/u/[account]/#search/[query]/[thread]',
  account: 'https://mail.google.com/mail/u/[account]/#inbox'
}).then(prefs => {
  if (prefs.active) {
    const {account, query, thread} = prefs.active;
    open(prefs[prefs.mode]
      .replace('[account]', account)
      .replace('[thread]', thread)
      .replace('[query]', encodeURIComponent(query))
    );
  }
  else {
    open('https://mail.google.com/mail/u/0/#inbox');
  }
}));

// badge color
webext.runtime.on('start-up', () => webext.storage.get({
  color: '#a03333'
}).then(({color}) => webext.browserAction.setBadgeBackgroundColor({
  color
})));

// context-menu items
webext.runtime.on('start-up', () => webext.storage.get({
  labels: []
}).then(({labels}) => {
  const arr = [{
    title: 'Refresh now',
    id: 'refresh',
    contexts: ['browser_action']
  }, {
    title: 'Logged-in accounts',
    id: 'root',
    contexts: ['browser_action'],
    enabled: labels.length !== 0
  }, ...labels.map(n => ({
    title: n.split('/')[0],
    id: 'account-' + n.split('/')[1],
    parentId: 'root',
    contexts: ['browser_action']
  }))];
  webext.contextMenus.batch(arr);
}));
webext.storage.on('changed', ({labels}) => {
  Promise.all(
    (labels.oldValue || []).map(n => 'account-' + n.split('/')[1]).map(webext.contextMenus.remove)
  ).then(() => webext.contextMenus.batch(labels.newValue.map(n => ({
    title: n.split('/')[0],
    id: 'account-' + n.split('/')[1],
    parentId: 'root',
    contexts: ['browser_action']
  }))));
  webext.contextMenus.update('root', {
    enabled: labels.newValue.length !== 0
  });
}).if(p => p.labels);
webext.contextMenus.on(
  'clicked',
  ({menuItemId}) => open(`https://mail.google.com/mail/u/${menuItemId.split('-')[1]}/#inbox`)
).if(({menuItemId}) => menuItemId.startsWith('account-'));

// FAQs and Feedback
webext.runtime.on('start-up', () => {
  const {name, version, homepage_url} = webext.runtime.getManifest();
  const page = homepage_url; // eslint-disable-line camelcase
  // FAQs
  webext.storage.get({
    'version': null,
    'faqs': navigator.userAgent.indexOf('Firefox') === -1,
    'last-update': 0,
  }).then(prefs => {
    if (prefs.version ? (prefs.faqs && prefs.version !== version) : true) {
      const now = Date.now();
      const doUpdate = (now - prefs['last-update']) / 1000 / 60 / 60 / 24 > 30;
      webext.storage.set({
        version,
        'last-update': doUpdate ? Date.now() : prefs['last-update']
      }).then(() => {
        // do not display the FAQs page if last-update occurred less than 30 days ago.
        if (doUpdate) {
          const p = Boolean(prefs.version);
          webext.tabs.create({
            url: page + '?version=' + version +
              '&type=' + (p ? ('upgrade&p=' + prefs.version) : 'install'),
            active: p === false
          });
        }
      });
    }
  });
  // Feedback
  webext.runtime.setUninstallURL(
    page + '?rd=feedback&name=' + name + '&version=' + version
  );
});

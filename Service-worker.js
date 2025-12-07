// Enhanced Service Worker for Immunisation Tracker PWA
// Version: 3.0.0

const CACHE_NAME = 'immunisation-tracker-v3.0.0';
const OFFLINE_CACHE = 'offline-data-v1';
const API_CACHE = 'api-cache-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-72x72.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/plugin/relativeTime.js'
];

// Install Event
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('Service Worker: Caching app shell');
          return cache.addAll(PRECACHE_ASSETS);
        }),
      caches.open(OFFLINE_CACHE)
        .then(cache => {
          console.log('Service Worker: Initializing offline cache');
          return cache.put('last-sync', new Response(Date.now().toString()));
        }),
      self.skipWaiting()
    ]).then(() => {
      console.log('Service Worker: Installation complete');
    })
  );
});

// Activate Event
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== OFFLINE_CACHE && 
                cacheName !== API_CACHE) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Claim clients immediately
      self.clients.claim(),
      
      // Initialize background sync
      initializeBackgroundSync()
    ]).then(() => {
      console.log('Service Worker: Activation complete');
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            data: { version: '3.0.0' }
          });
        });
      });
    })
  );
});

// Fetch Event - Advanced Strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests and browser extensions
  if (!url.origin.startsWith(self.location.origin) ||
      request.url.startsWith('chrome-extension://') ||
      request.url.includes('extension')) {
    return;
  }
  
  // Handle API requests with network-first strategy
  if (url.pathname.includes('/api/') || 
      url.href.includes('firebaseio.com') ||
      url.href.includes('firestore.googleapis.com')) {
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // Handle static assets with cache-first strategy
  if (PRECACHE_ASSETS.some(asset => url.href.includes(asset)) ||
      request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'image') {
    event.respondWith(handleStaticRequest(request));
    return;
  }
  
  // Handle navigation requests with network-first strategy
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }
  
  // Default: network-first strategy
  event.respondWith(handleDefaultRequest(request));
});

// Push Notification Event
self.addEventListener('push', event => {
  console.log('Service Worker: Push notification received');
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: 'Immunisation Tracker',
      body: event.data.text() || 'New notification',
      icon: '/icon-192x192.png'
    };
  }
  
  const options = {
    body: data.body || 'New notification from Immunisation Tracker',
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [100, 50, 100, 50, 100],
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
      type: data.type || 'general',
      priority: data.priority || 'normal'
    },
    actions: [
      {
        action: 'view',
        title: 'View Details',
        icon: '/icon-72x72.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icon-72x72.png'
      }
    ],
    tag: data.tag || 'immunisation-notification',
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false
  };
  
  // Show notification
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Immunisation Tracker',
      options
    ).then(() => {
      // Send analytics
      sendAnalyticsEvent('push_notification_received', {
        notification_type: data.type,
        priority: data.priority
      });
    })
  );
});

// Notification Click Event
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  const { notification } = event;
  const { data } = notification;
  
  // Handle action buttons
  if (event.action === 'view') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        // Focus existing client or open new window
        for (const client of clients) {
          if (client.url === data.url && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(data.url);
      })
    );
  } else if (event.action === 'dismiss') {
    // Just dismiss the notification
    console.log('Notification dismissed');
  } else {
    // Default click behavior
    event.waitUntil(
      self.clients.openWindow(data.url || '/')
    );
  }
  
  // Send analytics
  sendAnalyticsEvent('push_notification_clicked', {
    action: event.action || 'default',
    notification_type: data.type
  });
});

// Background Sync Event
self.addEventListener('sync', event => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  switch (event.tag) {
    case 'sync-offline-data':
      event.waitUntil(syncOfflineData());
      break;
    case 'sync-periodic':
      event.waitUntil(syncPeriodicData());
      break;
    default:
      console.log('Unknown sync tag:', event.tag);
  }
});

// Periodic Sync Event (for background updates)
self.addEventListener('periodicsync', event => {
  console.log('Service Worker: Periodic sync triggered:', event.tag);
  
  if (event.tag === 'update-cache') {
    event.waitUntil(updateCache());
  } else if (event.tag === 'sync-stats') {
    event.waitUntil(syncStatistics());
  }
});

// Message Event (for communication with app)
self.addEventListener('message', event => {
  console.log('Service Worker: Message received:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'CACHE_DATA':
      handleCacheData(data);
      break;
    case 'GET_CACHED_DATA':
      handleGetCachedData(event);
      break;
    case 'CLEAR_CACHE':
      handleClearCache();
      break;
    case 'REGISTER_SYNC':
      registerBackgroundSync(data.tag);
      break;
    case 'GET_SYNC_STATUS':
      handleGetSyncStatus(event);
      break;
    default:
      console.log('Unknown message type:', type);
  }
});

// Request Handlers
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful response
      const responseClone = networkResponse.clone();
      cache.put(request, responseClone);
      
      // Update last sync time
      await updateLastSync();
      
      return networkResponse;
    }
    
    // If network fails, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cache, return network error
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', error);
    
    // Try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response
    return new Response(JSON.stringify({
      error: 'Network error',
      offline: true,
      timestamp: Date.now()
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Update cache in background if stale
    updateCacheInBackground(request, cache);
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return offline fallback
    if (request.destination === 'document') {
      return cache.match('/index.html');
    }
    throw error;
  }
}

async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Try network first for fresh content
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache the response
      const responseClone = networkResponse.clone();
      cache.put(request, responseClone);
      return networkResponse;
    }
  } catch (error) {
    console.log('Network failed for navigation:', error);
  }
  
  // Fall back to cache
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Ultimate fallback to index.html
  return cache.match('/index.html');
}

async function handleDefaultRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Background Sync Functions
async function syncOfflineData() {
  console.log('Syncing offline data...');
  
  const offlineCache = await caches.open(OFFLINE_CACHE);
  const keys = await offlineCache.keys();
  
  const syncTasks = keys.map(async request => {
    if (request.url.endsWith('last-sync')) return;
    
    try {
      const response = await offlineCache.match(request);
      const data = await response.json();
      
      // Send data to server
      const syncResponse = await fetch(request.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Sync': 'true'
        },
        body: JSON.stringify(data)
      });
      
      if (syncResponse.ok) {
        // Remove from offline cache
        await offlineCache.delete(request);
        console.log('Synced:', request.url);
        return { success: true, url: request.url };
      } else {
        console.log('Sync failed:', request.url);
        return { success: false, url: request.url, error: await syncResponse.text() };
      }
    } catch (error) {
      console.error('Sync error:', error);
      return { success: false, url: request.url, error: error.message };
    }
  });
  
  const results = await Promise.allSettled(syncTasks);
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - successful;
  
  console.log(`Sync completed: ${successful} successful, ${failed} failed`);
  
  // Notify app about sync completion
  await notifyClients({
    type: 'SYNC_COMPLETED',
    data: { successful, failed, total: results.length }
  });
  
  return results;
}

async function syncPeriodicData() {
  console.log('Running periodic sync...');
  
  try {
    // Sync important data periodically
    await syncStatistics();
    await updateCache();
    await checkForUpdates();
    
    return { success: true, timestamp: Date.now() };
  } catch (error) {
    console.error('Periodic sync error:', error);
    return { success: false, error: error.message };
  }
}

async function syncStatistics() {
  // Sync aggregated statistics
  const cache = await caches.open(API_CACHE);
  
  try {
    const responses = await Promise.all([
      fetch('/api/stats/summary'),
      fetch('/api/stats/coverage'),
      fetch('/api/stats/alerts')
    ]);
    
    await Promise.all(
      responses.map((response, index) => {
        if (response.ok) {
          const url = responses[index].url;
          return cache.put(url, response.clone());
        }
      })
    );
    
    console.log('Statistics synced successfully');
  } catch (error) {
    console.error('Statistics sync error:', error);
  }
}

// Cache Management
async function updateCache() {
  console.log('Updating cache...');
  
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  
  for (const request of requests) {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        await cache.put(request, networkResponse);
      }
    } catch (error) {
      console.warn('Failed to update cache for:', request.url);
    }
  }
  
  console.log('Cache update completed');
}

async function updateCacheInBackground(request, cache) {
  // Don't block response, update cache in background
  fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse);
    }
  }).catch(() => {
    // Ignore errors in background update
  });
}

// IndexedDB for offline data
const OFFLINE_DB_NAME = 'immunisationOfflineDB';
const OFFLINE_DB_VERSION = 2;

async function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      
      // Create object stores
      if (!db.objectStoreNames.contains('children')) {
        const store = db.createObjectStore('children', { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('facility', 'facility', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('vaccinations')) {
        const store = db.createObjectStore('vaccinations', { keyPath: 'id', autoIncrement: true });
        store.createIndex('childId', 'childId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
}

async function saveOfflineData(type, data) {
  const db = await openOfflineDB();
  const transaction = db.transaction([type], 'readwrite');
  const store = transaction.objectStore(type);
  
  return new Promise((resolve, reject) => {
    const request = store.add({
      ...data,
      offline: true,
      timestamp: Date.now(),
      status: 'pending'
    });
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getOfflineData(type, filters = {}) {
  const db = await openOfflineDB();
  const transaction = db.transaction([type], 'readonly');
  const store = transaction.objectStore(type);
  
  return new Promise((resolve, reject) => {
    let request;
    
    if (filters.key) {
      request = store.get(filters.key);
    } else if (filters.index) {
      const index = store.index(filters.index);
      request = index.getAll(filters.value);
    } else {
      request = store.getAll();
    }
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Helper Functions
async function updateLastSync() {
  const cache = await caches.open(OFFLINE_CACHE);
  await cache.put('last-sync', new Response(Date.now().toString()));
}

async function initializeBackgroundSync() {
  if ('periodicSync' in self.registration) {
    try {
      await self.registration.periodicSync.register('update-cache', {
        minInterval: 24 * 60 * 60 * 1000, // 24 hours
      });
      console.log('Periodic sync registered');
    } catch (error) {
      console.warn('Periodic sync not supported:', error);
    }
  }
}

async function registerBackgroundSync(tag) {
  if ('sync' in self.registration) {
    try {
      await self.registration.sync.register(tag);
      console.log('Background sync registered:', tag);
      return true;
    } catch (error) {
      console.error('Background sync registration failed:', error);
      return false;
    }
  }
  return false;
}

async function checkForUpdates() {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    const data = await response.json();
    
    if (data.version !== '3.0.0') {
      await notifyClients({
        type: 'UPDATE_AVAILABLE',
        data: { version: data.version }
      });
    }
  } catch (error) {
    // Ignore errors
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage(message);
  });
}

async function sendAnalyticsEvent(eventName, data = {}) {
  // Send analytics to server if online
  if (navigator.onLine) {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: eventName,
          data: data,
          timestamp: Date.now(),
          sw: true
        })
      });
    } catch (error) {
      // Store offline for later sync
      await saveOfflineData('analytics', {
        event: eventName,
        data: data,
        timestamp: Date.now()
      });
    }
  }
}

// Message Handlers
async function handleCacheData(data) {
  const { type, key, value } = data;
  const cache = await caches.open(OFFLINE_CACHE);
  
  if (key && value) {
    await cache.put(key, new Response(JSON.stringify(value)));
  } else if (type === 'clear') {
    const keys = await cache.keys();
    await Promise.all(keys.map(key => cache.delete(key)));
  }
}

async function handleGetCachedData(event) {
  const { key } = event.data;
  const cache = await caches.open(OFFLINE_CACHE);
  const response = await cache.match(key);
  
  if (response) {
    const data = await response.json();
    event.ports[0].postMessage({ success: true, data: data });
  } else {
    event.ports[0].postMessage({ success: false, error: 'Not found' });
  }
}

async function handleClearCache() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('All caches cleared');
}

async function handleGetSyncStatus(event) {
  const offlineCache = await caches.open(OFFLINE_CACHE);
  const response = await offlineCache.match('last-sync');
  const lastSync = response ? await response.text() : null;
  
  const db = await openOfflineDB();
  const transaction = db.transaction(['syncQueue'], 'readonly');
  const store = transaction.objectStore('syncQueue');
  const pendingCount = await new Promise(resolve => {
    const request = store.index('status').count('pending');
    request.onsuccess = () => resolve(request.result);
  });
  
  event.ports[0].postMessage({
    lastSync: lastSync,
    pendingSyncs: pendingCount,
    isOnline: navigator.onLine
  });
}

// Error Handling
self.addEventListener('error', event => {
  console.error('Service Worker Error:', event.error);
  sendAnalyticsEvent('service_worker_error', {
    message: event.error?.message,
    stack: event.error?.stack
  });
});

self.addEventListener('unhandledrejection', event => {
  console.error('Service Worker Unhandled Rejection:', event.reason);
  sendAnalyticsEvent('service_worker_unhandled_rejection', {
    reason: event.reason?.message || String(event.reason)
  });
});
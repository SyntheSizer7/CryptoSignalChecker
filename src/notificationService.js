// Notification Service for Breakout Alerts

// Check if browser supports notifications
export const isNotificationSupported = () => {
  return 'Notification' in window && 'serviceWorker' in navigator;
};

// Request notification permission
export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) {
    console.warn('[Notifications] Browser does not support notifications');
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('[Notifications] Permission:', permission);
    return permission;
  } catch (error) {
    console.error('[Notifications] Error requesting permission:', error);
    return 'denied';
  }
};

// Check current notification permission
export const getNotificationPermission = () => {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
};

// Register service worker
export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[Notifications] Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('[Notifications] Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
};

// Send notification via service worker
export const sendNotification = async (title, options = {}) => {
  if (!isNotificationSupported()) {
    console.warn('[Notifications] Notifications not supported');
    return false;
  }

  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    console.warn('[Notifications] Permission not granted:', permission);
    return false;
  }

  try {
    // Try to send via service worker first (works even when tab is closed)
    const registration = await navigator.serviceWorker.ready;
    if (registration) {
      registration.showNotification(title, {
        body: options.body || '',
        icon: options.icon || '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: options.tag || 'crypto-breakout',
        requireInteraction: options.requireInteraction !== false,
        data: options.data || {},
        ...options
      });
      return true;
    }
  } catch (error) {
    console.error('[Notifications] Error sending notification via service worker:', error);
  }

  // Fallback to regular notification (only works when tab is open)
  try {
    new Notification(title, {
      body: options.body || '',
      icon: options.icon || '/icon-192x192.png',
      tag: options.tag || 'crypto-breakout',
      requireInteraction: options.requireInteraction !== false,
      ...options
    });
    return true;
  } catch (error) {
    console.error('[Notifications] Error sending notification:', error);
    return false;
  }
};

// Format notification message for breakout
// Note: formatNYTime should be imported from binance.js when used
export const formatBreakoutNotification = (symbol, breakoutTime, reentryTime, direction, formatNYTimeFn) => {
  const symbolName = symbol.replace('/USDT', '');
  
  // Use provided formatNYTime function or fallback
  const formatTime = formatNYTimeFn || ((timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return formatter.format(date);
    } catch (e) {
      return 'Invalid Date';
    }
  });
  
  const time = breakoutTime ? formatTime(breakoutTime) : 'Now';
  const directionText = direction === 'long' ? 'LONG' : 'SHORT';
  
  if (reentryTime) {
    return {
      title: `🚀 ${symbolName} Breakout & Re-entry`,
      body: `${directionText} signal detected\nBreakout: ${time}\nRe-entry: ${formatTime(reentryTime)}`,
      icon: '/icon-192x192.png',
      tag: `breakout-${symbolName}-${Date.now()}`,
      data: { symbol, type: 'breakout-reentry', direction }
    };
  } else {
    return {
      title: `📈 ${symbolName} Breakout Detected`,
      body: `${directionText} breakout at ${time}\nWaiting for re-entry...`,
      icon: '/icon-192x192.png',
      tag: `breakout-${symbolName}-${Date.now()}`,
      data: { symbol, type: 'breakout-only', direction }
    };
  }
};

// Note: formatNYTime is imported from binance.js in App.js where this is used


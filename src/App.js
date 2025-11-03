import React, { useState, useEffect, useRef } from 'react';
import { fetchMultipleRSI, fetchOversoldHistory, fetchMultipleBreakoutSignals, formatNYTime } from './binance';
import { 
  isNotificationSupported, 
  requestNotificationPermission, 
  getNotificationPermission,
  registerServiceWorker,
  sendNotification,
  formatBreakoutNotification
} from './notificationService';
import './App.css';

// Helper function to get RSI signal interpretation
const getRSISignal = (rsi) => {
  if (rsi >= 70) return { text: '[RED] OVERBOUGHT', color: '#ff6b6b', bgColor: 'rgba(255, 107, 107, 0.2)' };
  if (rsi >= 50) return { text: '[YELLOW] NEUTRAL', color: '#ffd93d', bgColor: 'rgba(255, 217, 61, 0.2)' };
  if (rsi >= 30) return { text: '[GREEN] NEUTRAL', color: '#6bcf7f', bgColor: 'rgba(107, 207, 127, 0.2)' };
  return { text: '[BLUE] OVERSOLD', color: '#4dabf7', bgColor: 'rgba(77, 171, 247, 0.2)' };
};

// Timezone constant (UTC+7 - Bangkok/Indochina Time)
const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000; // 7 hours in milliseconds

// Format timestamp to UTC+7 (Bangkok/Indochina Time)
// For 1-hour candles, show time as HH:00
const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    // Timestamp from Binance is in UTC, display in UTC+7 (Bangkok timezone)
    const date = new Date(timestamp);
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const timeStr = dateFormatter.format(date);
    // Round to :00 for 1-hour candles
    const parts = timeStr.split(', ');
    if (parts.length === 2) {
      const [monthDay, time] = parts;
      const [hour, minute] = time.split(':');
      return `${monthDay}, ${hour.padStart(2, '0')}:00`;
    }
    // Fallback: format as MM/DD, HH:00
    const [month, day, ...timeParts] = timeStr.split(/[/ ]/);
    const time = timeParts.find(p => p.includes(':'));
    if (time) {
      const [hour] = time.split(':');
      return `${month}/${day}, ${hour.padStart(2, '0')}:00`;
    }
    // If parsing fails, just return with :00
    const [hour] = timeStr.split(':');
    return hour ? `${hour.padStart(2, '0')}:00` : timeStr;
  } catch (e) {
    return 'Invalid Date';
  }
};

// Format datetime to UTC+7 (Bangkok/Indochina Time) for display
// Format: YYYY-MM-DD HH:MM:SS
const formatDateTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    // Format returns: YYYY-MM-DD, HH:MM:SS
    const formatted = formatter.format(date);
    return formatted.replace(', ', ' '); // Replace comma with space
  } catch (e) {
    return 'Invalid Date';
  }
};

// Format date (YYYY-MM-DD) in UTC+7 using Bangkok timezone
const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    // Timestamp from Binance is in UTC, display in UTC+7 (Bangkok timezone)
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    return 'Invalid Date';
  }
};

// Check if timestamp is from today (in Bangkok timezone)
const isToday = (timestamp) => {
  if (!timestamp) return false;
  try {
    const date = new Date(timestamp);
    const now = new Date();
    
    // Format both dates in Bangkok timezone (YYYY-MM-DD)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const itemDate = formatter.format(date);
    const todayDate = formatter.format(now);
    
    return itemDate === todayDate;
  } catch (e) {
    return false;
  }
};

// Check if timestamp is between 22:00 and 06:00 (Bangkok timezone)
// This handles the night shift that spans midnight
const isNightTime = (timestamp) => {
  if (!timestamp) return false;
  try {
    const date = new Date(timestamp);
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const timeStr = timeFormatter.format(date);
    const hour = parseInt(timeStr.split(':')[0], 10);
    
    // Between 22:00 (22) and 06:00 (6) - spans midnight
    return hour >= 22 || hour < 6;
  } catch (e) {
    return false;
  }
};

// Format time (HH:00) in UTC+7 using Bangkok timezone
// For 1-hour candles, always show :00 (top of the hour)
const formatTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    // Timestamp from Binance is in UTC, display in UTC+7 (Bangkok timezone)
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const timeStr = formatter.format(date);
    // For 1-hour candles, round to :00 (top of the hour)
    // Extract hour and set minute to 00
    const [hour, minute] = timeStr.split(':');
    return `${hour.padStart(2, '0')}:00`;
  } catch (e) {
    return 'Invalid Date';
  }
};

// Get date/time at 11:00 UTC+7 for a given date
// Takes a date (Date object or date string) and returns Date object at 11:00 UTC+7 on that date
const getDateAt1100UTC7 = (date) => {
  if (!date) return null;
  try {
    const inputDate = date instanceof Date ? date : new Date(date);
    
    // Get the date in UTC+7 (Bangkok timezone) as YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const dateStr = formatter.format(inputDate); // e.g., '2025-11-01'
    
    // Parse the date string and create a date at 11:00 UTC+7
    // We need to create this in UTC first, then convert
    // UTC+7 means UTC is 7 hours behind, so 11:00 UTC+7 = 04:00 UTC
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Create date in UTC at 04:00 (which is 11:00 UTC+7)
    const dateAt1100 = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
    
    return dateAt1100;
  } catch (e) {
    console.error('Error calculating date at 11:00 UTC+7:', e);
    return null;
  }
};

// Format price for display
const formatPrice = (price) => {
  if (!price || isNaN(price)) return 'N/A';
  if (price >= 1000) {
    return price.toFixed(2);
  } else if (price >= 1) {
    return price.toFixed(4);
  } else if (price >= 0.01) {
    return price.toFixed(4);
  } else {
    return price.toFixed(6);
  }
};

// Shared cryptocurrency list - same across all features
// Order: BTC BNB ETH XRP SOL SUI DOGE ADA ASTER PEPE ENA LINK TAO PUMP
const DEFAULT_SYMBOLS = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'ENA/USDT', 'LINK/USDT', 'TAO/USDT', 'PUMP/USDT'];

// Cryptocurrency Filter Component
const CryptoFilter = ({ selectedCryptos, onToggleCrypto, onSelectAll, onDeselectAll }) => {
  const cryptoList = DEFAULT_SYMBOLS.map(s => s.replace('/USDT', ''));
  const allSelected = selectedCryptos.size === cryptoList.length;
  const someSelected = selectedCryptos.size > 0 && selectedCryptos.size < cryptoList.length;
  
  return (
    <div style={{ 
      marginBottom: '1.5rem',
      padding: '1rem',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '0.75rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
          Filter Cryptocurrencies
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onSelectAll}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
              backgroundColor: 'rgba(107, 207, 127, 0.2)',
              color: '#6bcf7f',
              border: '1px solid #6bcf7f',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(107, 207, 127, 0.3)'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(107, 207, 127, 0.2)'}
          >
            Select All
          </button>
          <button
            onClick={onDeselectAll}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
              backgroundColor: 'rgba(255, 107, 107, 0.2)',
              color: '#ff6b6b',
              border: '1px solid #ff6b6b',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 107, 107, 0.3)'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255, 107, 107, 0.2)'}
          >
            Deselect All
          </button>
        </div>
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        {cryptoList.map((crypto) => {
          const isSelected = selectedCryptos.has(crypto);
          return (
            <label
              key={crypto}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                backgroundColor: isSelected 
                  ? 'rgba(107, 207, 127, 0.2)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isSelected ? '#6bcf7f' : 'rgba(255, 255, 255, 0.2)'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontWeight: isSelected ? '600' : '400'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleCrypto(crypto)}
                style={{
                  marginRight: '0.5rem',
                  cursor: 'pointer',
                  width: '16px',
                  height: '16px'
                }}
              />
              <span style={{
                color: isSelected ? '#6bcf7f' : '#fff',
                fontSize: '0.9rem'
              }}>
                {crypto}
              </span>
            </label>
          );
        })}
      </div>
      <div style={{
        marginTop: '0.75rem',
        fontSize: '0.85rem',
        opacity: 0.7,
        color: someSelected ? '#ffd93d' : '#fff'
      }}>
        {allSelected 
          ? `All ${cryptoList.length} cryptocurrencies selected`
          : someSelected 
            ? `${selectedCryptos.size} of ${cryptoList.length} cryptocurrencies selected`
            : 'No cryptocurrencies selected - all data will be hidden'}
      </div>
    </div>
  );
};

// Helper function to normalize Date objects in data (convert strings to Date objects if needed)
const normalizeDates = (data) => {
  if (!data || !Array.isArray(data)) return data;
  return data.map(item => {
    const normalized = { ...item };
    // Normalize breakoutTime if it exists
    if (normalized.breakoutTime && !(normalized.breakoutTime instanceof Date)) {
      normalized.breakoutTime = new Date(normalized.breakoutTime);
    }
    // Normalize reentryTime if it exists
    if (normalized.reentryTime && !(normalized.reentryTime instanceof Date)) {
      normalized.reentryTime = new Date(normalized.reentryTime);
    }
    // Normalize closeTime if it exists
    if (normalized.closeTime && !(normalized.closeTime instanceof Date)) {
      normalized.closeTime = new Date(normalized.closeTime);
    }
    // Normalize rangeCloseTime if it exists
    if (normalized.rangeCloseTime && !(normalized.rangeCloseTime instanceof Date)) {
      normalized.rangeCloseTime = new Date(normalized.rangeCloseTime);
    }
    // Normalize timestamp if it exists
    if (normalized.timestamp && !(normalized.timestamp instanceof Date)) {
      normalized.timestamp = new Date(normalized.timestamp);
    }
    return normalized;
  });
};

// Helper function to filter data by selected cryptocurrencies
const filterDataByCryptos = (data, selectedCryptos) => {
  if (!data || !Array.isArray(data)) return data;
  if (!selectedCryptos || selectedCryptos.size === 0) return [];
  // Normalize dates first (in case data comes from cache as strings)
  const normalizedData = normalizeDates(data);
  return normalizedData.filter(item => {
    const symbol = (item.symbol || '').replace('/USDT', '');
    return selectedCryptos.has(symbol);
  });
};

// Section Toggle Component
const SectionToggle = ({ isExpanded, onToggle, title, count, lastUpdateTime }) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: 'pointer',
      padding: '0.5rem',
      borderRadius: '4px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      marginBottom: '0.5rem'
    }}
    onClick={onToggle}
    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
        <span style={{ fontSize: '1.2rem', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          ▶
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
            {title}
            {count !== null && count !== undefined && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', opacity: 0.7 }}>
                ({count})
              </span>
            )}
          </h3>
          {lastUpdateTime && (
            <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '1.5rem' }}>
              Last updated: {formatDateTime(lastUpdateTime)}
            </span>
          )}
        </div>
      </div>
      <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
        {isExpanded ? 'Click to collapse' : 'Click to expand'}
      </span>
    </div>
  );
};

// Merged RSI + Breakout Status Table Component
const MergedRSIBreakoutTable = ({ 
  rsiData, 
  rsiLoading, 
  rsiError, 
  onRefreshRSI,
  breakoutData, 
  breakoutLoading, 
  breakoutError,
  onRefreshBreakout,
  breakoutSignalsData,
  selectedCryptos, 
  isExpanded, 
  onToggleExpanded, 
  lastUpdateTime 
}) => {
  // Filter RSI data by selected cryptocurrencies
  let filteredRsiData = filterDataByCryptos(rsiData, selectedCryptos);
  
  // Ensure all selected cryptocurrencies are shown, even if RSI data is missing
  // Create a map of existing RSI data by symbol
  const rsiDataMap = new Map();
  if (filteredRsiData && Array.isArray(filteredRsiData)) {
    filteredRsiData.forEach(item => {
      const symbol = (item.symbol || '').replace('/USDT', '');
      rsiDataMap.set(symbol.toUpperCase(), item);
    });
  }
  
  // Ensure all selected cryptos have entries (create placeholder if missing)
  const allSelectedSymbols = Array.from(selectedCryptos).map(s => s.toUpperCase());
  const completeRsiData = allSelectedSymbols.map(symbol => {
    const existing = rsiDataMap.get(symbol);
    if (existing) {
      return existing;
    } else {
      // Create placeholder entry for missing RSI data
      return {
        symbol: `${symbol}/USDT`,
        rsi: null,
        previous_rsi: null,
        timestamp: null,
        price: null
      };
    }
  });
  
  filteredRsiData = completeRsiData;
  
  // Helper function to get latest breakout status per symbol
  // Returns the most recent pending breakout/signal for current status display
  const getLatestBreakoutStatus = (symbol) => {
    const symbolUpper = symbol.toUpperCase();
    
    // Handle case where breakoutSignalsData might be an object with { signals, breakoutsWithoutReentry }
    // or an array directly
    let signalsArray = null;
    if (breakoutSignalsData) {
      if (Array.isArray(breakoutSignalsData)) {
        signalsArray = breakoutSignalsData;
      } else if (typeof breakoutSignalsData === 'object' && breakoutSignalsData.signals) {
        signalsArray = breakoutSignalsData.signals;
      }
    }
    
    // First, check breakout signals (these have reentry) - find latest per symbol
    // Prioritize pending signals, but include all signals with re-entry time to ensure nothing is missed
    let latestSignal = null;
    if (signalsArray && Array.isArray(signalsArray)) {
      // Get all signals for this symbol that have re-entry time (signals with exit/re-entry)
      const symbolSignals = signalsArray
        .filter(s => {
          // Match symbol (handle both "BNB" and "BNB/USDT" formats)
          const sSymbol = (s.symbol || '').toUpperCase().replace('/USDT', '');
          const matchesSymbol = sSymbol === symbolUpper;
          const hasReentry = s.reentryTime && (s.reentryTime instanceof Date || new Date(s.reentryTime).getTime() > 0);
          // Prioritize pending, but also check others to see if we're missing something
          return matchesSymbol && hasReentry;
        })
        .sort((a, b) => {
          const aTime = a.reentryTime instanceof Date ? a.reentryTime.getTime() : new Date(a.reentryTime).getTime();
          const bTime = b.reentryTime instanceof Date ? b.reentryTime.getTime() : new Date(b.reentryTime).getTime();
          return bTime - aTime; // Most recent first
        });
      
      // Prioritize pending signals, but if none exist, use the most recent one with re-entry
      if (symbolSignals.length > 0) {
        // First try to find a pending signal
        const pendingSignal = symbolSignals.find(s => s.result === 'pending');
        if (pendingSignal) {
          latestSignal = pendingSignal;
        } else {
          // If no pending signal, use the most recent one (might be a signal that's not yet marked as pending)
          // But only if it doesn't have a closeTime (meaning it's still active)
          const activeSignal = symbolSignals.find(s => !s.closeTime || s.closeTime === null);
          if (activeSignal) {
            latestSignal = activeSignal;
          } else {
            // Last resort: use most recent signal (even if closed, we'll filter it out later in display logic)
            latestSignal = symbolSignals[0];
          }
        }
      }
    }
    
    // Then, check breakouts without reentry - find latest per symbol
    let latestBreakoutWithoutReentry = null;
    if (breakoutData && Array.isArray(breakoutData)) {
      const symbolBreakouts = breakoutData
        .filter(b => {
          const bSymbol = (b.symbol || '').toUpperCase().replace('/USDT', '');
          return bSymbol === symbolUpper;
        })
        .sort((a, b) => {
          const aTime = a.breakoutTime instanceof Date ? a.breakoutTime.getTime() : new Date(a.breakoutTime).getTime();
          const bTime = b.breakoutTime instanceof Date ? b.breakoutTime.getTime() : new Date(b.breakoutTime).getTime();
          return bTime - aTime; // Most recent first
        });
      if (symbolBreakouts.length > 0) {
        latestBreakoutWithoutReentry = symbolBreakouts[0];
      }
    }
    
    // Determine which one is more recent
    if (latestSignal && latestBreakoutWithoutReentry) {
      const signalTime = latestSignal.reentryTime instanceof Date 
        ? latestSignal.reentryTime.getTime() 
        : new Date(latestSignal.reentryTime).getTime();
      const breakoutTime = latestBreakoutWithoutReentry.breakoutTime instanceof Date 
        ? latestBreakoutWithoutReentry.breakoutTime.getTime() 
        : new Date(latestBreakoutWithoutReentry.breakoutTime).getTime();
      
      return signalTime > breakoutTime ? latestSignal : latestBreakoutWithoutReentry;
    } else if (latestSignal) {
      return latestSignal;
    } else if (latestBreakoutWithoutReentry) {
      return latestBreakoutWithoutReentry;
    }
    
    return null;
  };
  
  // Helper function to get latest closed signal (for showing close time)
  const getLatestClosedSignal = (symbol) => {
    const symbolUpper = symbol.toUpperCase();
    
    // Handle case where breakoutSignalsData might be an object with { signals, breakoutsWithoutReentry }
    // or an array directly
    let signalsArray = null;
    if (breakoutSignalsData) {
      if (Array.isArray(breakoutSignalsData)) {
        signalsArray = breakoutSignalsData;
      } else if (typeof breakoutSignalsData === 'object' && breakoutSignalsData.signals) {
        signalsArray = breakoutSignalsData.signals;
      }
    }
    
    if (signalsArray && Array.isArray(signalsArray)) {
      const closedSignals = signalsArray
        .filter(s => {
          const sSymbol = (s.symbol || '').toUpperCase().replace('/USDT', '');
          return sSymbol === symbolUpper && (s.result === 'win' || s.result === 'loss');
        })
        .sort((a, b) => {
          const aTime = a.closeTime instanceof Date ? a.closeTime.getTime() : (a.closeTime ? new Date(a.closeTime).getTime() : 0);
          const bTime = b.closeTime instanceof Date ? b.closeTime.getTime() : (b.closeTime ? new Date(b.closeTime).getTime() : 0);
          return bTime - aTime; // Most recent first
        });
      if (closedSignals.length > 0) {
        return closedSignals[0];
      }
    }
    
    return null;
  };

  // Helper function to check if a breakout is from a previous day's 4H timeframe
  // The 4H timeframe is 11:00-15:00 UTC+7 each day
  // If the breakout time is before today's 11:00 UTC+7, it should be cleared
  const isBreakoutFromPreviousDay = (breakoutTime) => {
    if (!breakoutTime) return false;
    
    try {
      const breakoutDate = breakoutTime instanceof Date ? breakoutTime : new Date(breakoutTime);
      
      // Get today's date at 11:00 UTC+7 (start of today's 4H timeframe)
      const todayAt1100UTC7 = getDateAt1100UTC7(new Date());
      
      if (!todayAt1100UTC7) return false;
      
      // If breakout time is before today's 11:00 UTC+7, it's from a previous day
      return breakoutDate.getTime() < todayAt1100UTC7.getTime();
    } catch (e) {
      console.error('Error checking if breakout is from previous day:', e);
      return false;
    }
  };

  // Track if we've already reset for today (to ensure reset happens only once per day)
  const lastResetDateRef = useRef(null);
  
  // Helper function to check if current time is after 15:00 UTC+7 (end of 4H timeframe)
  // After 15:00 UTC+7, all breakout data should be cleared to reset for the next day
  // Returns true only if we haven't reset for today yet (ensures reset happens only once)
  const isAfter1500UTC7 = () => {
    try {
      const now = new Date();
      
      // Get today's date at 15:00 UTC+7 (end of today's 4H timeframe)
      // UTC+7 means UTC is 7 hours behind, so 15:00 UTC+7 = 08:00 UTC
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const dateStr = formatter.format(now); // e.g., '2025-11-01'
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // Create date in UTC at 08:00 (which is 15:00 UTC+7)
      const todayAt1500UTC7 = new Date(Date.UTC(year, month - 1, day, 8, 0, 0));
      
      // Check if current time is after 15:00 UTC+7 today
      const isAfter1500 = now.getTime() >= todayAt1500UTC7.getTime();
      
      // Create consistent date string for comparison
      const todayDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      if (isAfter1500) {
        // Check if we've already reset for today
        if (lastResetDateRef.current !== todayDateStr) {
          // First time after 15:00 today, mark as reset
          console.log(`[RESET 15:00] First reset for today: ${todayDateStr} at ${now.toISOString()}`);
          lastResetDateRef.current = todayDateStr;
          return true; // Return true to trigger reset
        }
        // Already reset for today, return true to keep showing "-"
        return true;
      } else {
        // Before 15:00, clear reset date if it's from a previous day
        if (lastResetDateRef.current && lastResetDateRef.current !== todayDateStr) {
          console.log(`[RESET 15:00] Clearing previous day reset: ${lastResetDateRef.current} -> null (today: ${todayDateStr})`);
          lastResetDateRef.current = null;
        }
        return false;
      }
    } catch (e) {
      console.error('Error checking if current time is after 15:00 UTC+7:', e);
      return false;
    }
  };

  const dataCount = filteredRsiData ? filteredRsiData.length : 0;
  const loading = rsiLoading || breakoutLoading;
  const error = rsiError || breakoutError;

  if (!isExpanded) {
    return (
      <div className="rsi-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="RSI Analysis & Breakout Status"
          count={loading ? null : dataCount}
          lastUpdateTime={lastUpdateTime}
        />
      </div>
    );
  }

  if (loading && (!rsiData || !Array.isArray(rsiData) || rsiData.length === 0)) {
    return (
      <div className="rsi-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="RSI Analysis & Breakout Status"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="loading-mini">
        <div className="spinner-mini"></div>
        <span>Fetching data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rsi-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="RSI Analysis & Breakout Status"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="error-mini">
        <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  // Ensure RSI data is an array
  if (!rsiData || !Array.isArray(rsiData) || rsiData.length === 0) {
    return (
      <div className="rsi-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="RSI Analysis & Breakout Status"
          count={0}
          lastUpdateTime={lastUpdateTime}
        />
        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No RSI data available. Click "Refresh" to fetch data.
        </p>
      </div>
    );
  }

  return (
    <div className="rsi-table-container">
      <SectionToggle 
        isExpanded={isExpanded} 
        onToggle={onToggleExpanded} 
        title="RSI Analysis & Breakout Status"
        count={dataCount}
        lastUpdateTime={lastUpdateTime}
      />
      <div className="rsi-table-header">
        <div>
          <p className="rsi-subtitle">RSI: 1 Hour Timeframe | RSI Period: 14 | Type: Wilder's Smoothing | Breakouts: Latest Status Per Symbol | Timezone: UTC+7</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onRefreshRSI} className="refresh-btn-small" disabled={rsiLoading}>
            {rsiLoading ? 'Loading...' : 'Refresh RSI'}
          </button>
          <button onClick={onRefreshBreakout} className="refresh-btn-small" disabled={breakoutLoading}>
            {breakoutLoading ? 'Loading...' : 'Refresh Breakout'}
        </button>
        </div>
      </div>
      <div className="rsi-table-wrapper">
        <table className="rsi-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>RSI</th>
              <th>Breakout</th>
              <th>Re-entry</th>
              <th>Long/Short</th>
              <th>Close Status</th>
              <th>Distance from Range</th>
            </tr>
          </thead>
          <tbody>
            {filteredRsiData.map((item, index) => {
              const symbol = item.symbol?.replace('/USDT', '') || 'N/A';
              const prevRSI = item.previous_rsi ?? null;
              const currRSI = item.rsi ?? null;
              
              const currSignal = currRSI !== null ? getRSISignal(currRSI) : null;
              
              // Get latest breakout status for this symbol
              const latestStatus = getLatestBreakoutStatus(symbol);
              
              // Get latest closed signal for this symbol (for showing close time)
              const latestClosedSignal = getLatestClosedSignal(symbol);
              const closeTime = latestClosedSignal && latestClosedSignal.closeTime 
                ? (latestClosedSignal.closeTime instanceof Date ? formatNYTime(latestClosedSignal.closeTime) : formatNYTime(new Date(latestClosedSignal.closeTime)))
                : '-';
              
              // Check if current time is after 15:00 UTC+7 (end of 4H timeframe)
              // Cache the result to avoid multiple calls per render
              // This ensures reset happens only once per day
              const shouldReset = isAfter1500UTC7();
              
              // Debug logging (temporary) - Enhanced
              if (symbol === 'BNB' || symbol === 'BTC' || symbol === 'ETH' || symbol === 'ADA') {
                console.log(`[DEBUG ${symbol}] latestStatus:`, latestStatus ? {
                  hasReentryTime: !!latestStatus.reentryTime,
                  hasBreakoutTime: !!latestStatus.breakoutTime,
                  result: latestStatus.result,
                  hasCloseTime: !!latestStatus.closeTime,
                  closeTime: latestStatus.closeTime,
                  breakoutTime: latestStatus.breakoutTime,
                  reentryTime: latestStatus.reentryTime,
                  breakoutDirection: latestStatus.breakoutDirection,
                  symbol: latestStatus.symbol
                } : 'null (not found)');
                console.log(`[DEBUG ${symbol}] breakoutSignalsData type:`, typeof breakoutSignalsData, Array.isArray(breakoutSignalsData));
                console.log(`[DEBUG ${symbol}] breakoutSignalsData length:`, breakoutSignalsData ? (Array.isArray(breakoutSignalsData) ? breakoutSignalsData.length : (breakoutSignalsData.signals ? breakoutSignalsData.signals.length : 'unknown')) : 0);
                
                // Check what signals exist for this symbol
                let signalsArray = null;
                if (breakoutSignalsData) {
                  if (Array.isArray(breakoutSignalsData)) {
                    signalsArray = breakoutSignalsData;
                  } else if (typeof breakoutSignalsData === 'object' && breakoutSignalsData.signals) {
                    signalsArray = breakoutSignalsData.signals;
                  }
                }
                
                if (signalsArray && Array.isArray(signalsArray)) {
                  const symbolSignals = signalsArray.filter(s => {
                    const sSymbol = (s.symbol || '').toUpperCase().replace('/USDT', '');
                    return sSymbol === symbol.toUpperCase();
                  });
                  console.log(`[DEBUG ${symbol}] Found ${symbolSignals.length} signals for symbol:`, symbolSignals.map(s => ({
                    hasReentryTime: !!s.reentryTime,
                    result: s.result,
                    hasCloseTime: !!s.closeTime,
                    breakoutTime: s.breakoutTime
                  })));
                }
                
                // Check condition evaluation
                if (latestStatus) {
                  const noCloseTime = !latestStatus.closeTime || latestStatus.closeTime === null;
                  const notWinLoss = latestStatus.result !== 'win' && latestStatus.result !== 'loss';
                  const isPreviousDay = isBreakoutFromPreviousDay(latestStatus.breakoutTime);
                  console.log(`[DEBUG ${symbol}] Condition checks:`, {
                    hasLatestStatus: !!latestStatus,
                    noCloseTime,
                    notWinLoss,
                    shouldReset,
                    isPreviousDay,
                    willShow: !shouldReset && noCloseTime && notWinLoss && !isPreviousDay,
                    lastResetDate: lastResetDateRef.current
                  });
                }
              }
              
              // Determine what to show based on status
              let breakoutTime = '-';
              let reentryTime = '-';
              let direction = '-';
              let distance = '-';
              
              // Check if current time is after 15:00 UTC+7 (end of 4H timeframe)
              // Only clear breakout data if it's from a previous day
              // Allow same-day breakouts after 15:00 to be shown (they're still today's breakouts)
              // Note: shouldReset is used to clear OLD breakouts, not same-day ones after 15:00
              // The actual clearing happens in isBreakoutFromPreviousDay check below
              // Priority: Show pending breakout/signal if exists, otherwise show closed signal status
              // LOGIC: Check for pending breakout/signal first (has higher priority)
              // Show if signal doesn't have closeTime (still active) AND result is not win/loss (not closed)
              // This matches BreakoutSignalsTable which shows all signals with reentryTime
              // Accept signals with result: 'pending', undefined, null, or any value except 'win'/'loss'
              if (latestStatus && 
                  (!latestStatus.closeTime || latestStatus.closeTime === null) &&
                  (latestStatus.result === 'pending' || latestStatus.result === undefined || latestStatus.result === null || (latestStatus.result !== 'win' && latestStatus.result !== 'loss'))) {
                // Check if breakout is from a previous day's 4H timeframe
                // Only clear if it's from PREVIOUS day - allow same-day breakouts even after 15:00
                const breakoutTimeForCheck = latestStatus.breakoutTime instanceof Date 
                  ? latestStatus.breakoutTime 
                  : new Date(latestStatus.breakoutTime);
                
                // Also check if we should reset (after 15:00) AND breakout is from previous day
                // If breakout is from today (even after 15:00), show it
                const isPreviousDay = isBreakoutFromPreviousDay(breakoutTimeForCheck);
                const shouldClearOldBreakout = shouldReset && isPreviousDay;
                
                if (shouldClearOldBreakout) {
                  // Breakout is from previous day AND we're after 15:00 - clear it
                  breakoutTime = '-';
                  reentryTime = '-';
                  direction = '-';
                  distance = '-';
                } else if (isPreviousDay && !shouldReset) {
                  // Breakout is from previous day but we're not after 15:00 yet - still clear it
                  breakoutTime = '-';
                  reentryTime = '-';
                  direction = '-';
                  distance = '-';
                } else {
                  // Breakout is from today, show it
                  // Check if it's a signal (has reentry) or just a breakout
                  if (latestStatus.reentryTime) {
                    // LOGIC 2: Breakout + re-entry exists (ACTIVE/PENDING SIGNAL)
                    // Show: breakout time, re-entry time, long/short, distance from range
                    const reentryTimeObj = latestStatus.reentryTime instanceof Date 
                      ? latestStatus.reentryTime 
                      : new Date(latestStatus.reentryTime);
                    
                    breakoutTime = formatNYTime(breakoutTimeForCheck);
                    reentryTime = formatNYTime(reentryTimeObj);
                    direction = latestStatus.breakoutDirection === 'long' ? 'LONG' : 'SHORT';
                    
                    // Calculate distance from current price to target (take profit) for open position
                    // Use currentPrice if available (live price), otherwise use entryPrice
                    const currentPrice = latestStatus.currentPrice || latestStatus.entryPrice || latestStatus.reentryPrice;
                    const takeProfit = latestStatus.takeProfit;
                    
                    if (currentPrice && takeProfit) {
                      // For open positions, calculate distance between current price and take profit target
                      if (latestStatus.breakoutDirection === 'long') {
                        // LONG position: Distance to TP = (TP - currentPrice) / currentPrice * 100
                        // Positive = remaining % to reach TP from current price, negative = already past TP
                        const dist = ((takeProfit - currentPrice) / currentPrice) * 100;
                        distance = dist >= 0 ? `+${dist.toFixed(2)}%` : `${dist.toFixed(2)}%`;
                      } else {
                        // SHORT position: Distance to TP = (currentPrice - TP) / currentPrice * 100
                        // Positive = remaining % to reach TP from current price, negative = already past TP
                        const dist = ((currentPrice - takeProfit) / currentPrice) * 100;
                        distance = dist >= 0 ? `+${dist.toFixed(2)}%` : `${dist.toFixed(2)}%`;
                      }
                    } else {
                      distance = '-';
                    }
                  } else {
                    // LOGIC 1: Only breakout exists (no re-entry)
                    // Show: breakout time, distance from range
                    // Do not show: re-entry, long/short, close status
                    breakoutTime = formatNYTime(breakoutTimeForCheck);
                    reentryTime = '-';
                    direction = '-';
                    
                    // Calculate distance from range
                    if (latestStatus.currentPrice) {
                      if (latestStatus.isAbove) {
                        const dist = ((latestStatus.currentPrice - latestStatus.rangeHigh) / latestStatus.rangeHigh) * 100;
                        distance = `+${dist.toFixed(2)}%`;
                      } else {
                        const dist = ((latestStatus.rangeLow - latestStatus.currentPrice) / latestStatus.rangeLow) * 100;
                        distance = `+${dist.toFixed(2)}%`;
                      }
                    }
                  }
                }
              }
              // LOGIC: If no pending breakout, check for closed signal
              // If there's a closed signal, show close status
              // If closed outside the range, show close time as breakout time
              else if (latestClosedSignal && closeTime !== '-') {
                // First, check if the closed position was closed outside the range
                const isWin = latestClosedSignal.result === 'win';
                let closedOutsideRange = false;
                
                if (latestClosedSignal.takeProfit && latestClosedSignal.stopLoss && latestClosedSignal.breakoutDirection) {
                  if (latestClosedSignal.breakoutDirection === 'long') {
                    // LONG position:
                    // - WIN (TP hit): Close price = TP. If TP > rangeHigh, we closed above = outside
                    // - LOSS (SL hit): Close price = SL. If SL < rangeLow, we closed below = outside
                    if (isWin) {
                      closedOutsideRange = latestClosedSignal.takeProfit > latestClosedSignal.rangeHigh;
                    } else {
                      closedOutsideRange = latestClosedSignal.stopLoss < latestClosedSignal.rangeLow;
                    }
                  } else if (latestClosedSignal.breakoutDirection === 'short') {
                    // SHORT position:
                    // - WIN (TP hit): Close price = TP. If TP < rangeLow, we closed below = outside
                    // - LOSS (SL hit): Close price = SL. If SL > rangeHigh, we closed above = outside
                    if (isWin) {
                      closedOutsideRange = latestClosedSignal.takeProfit < latestClosedSignal.rangeLow;
                    } else {
                      closedOutsideRange = latestClosedSignal.stopLoss > latestClosedSignal.rangeHigh;
                    }
                  }
                }
                
                // Check if there's a new breakout after the closed signal
                const hasNewBreakoutAfterClose = latestStatus && 
                  latestStatus.breakoutTime instanceof Date && 
                  latestClosedSignal.closeTime instanceof Date &&
                  latestStatus.breakoutTime > latestClosedSignal.closeTime;
                
                if (hasNewBreakoutAfterClose) {
                  // LOGIC 4: Close status exists + new breakout after close
                  // Show: close status + new breakout time + distance from range
                  // Do not show: reentry, long/short from breakout
                  
                  // Check if the new breakout is from a previous day's 4H timeframe
                  const newBreakoutTimeObj = latestStatus.breakoutTime instanceof Date 
                    ? latestStatus.breakoutTime 
                    : new Date(latestStatus.breakoutTime);
                  
                  if (isBreakoutFromPreviousDay(newBreakoutTimeObj)) {
                    // New breakout is from previous day, clear it (only show close status)
                    breakoutTime = '-';
                    reentryTime = '-';
                    direction = '-';
                    distance = '-';
                  } else {
                    // Show the new breakout time and distance
                    breakoutTime = formatNYTime(newBreakoutTimeObj);
                    reentryTime = '-';
                    direction = '-';
                    
                    // Calculate distance from range for the new breakout
                    if (latestStatus.currentPrice) {
                      if (latestStatus.isAbove) {
                        const dist = ((latestStatus.currentPrice - latestStatus.rangeHigh) / latestStatus.rangeHigh) * 100;
                        distance = `+${dist.toFixed(2)}%`;
                      } else {
                        const dist = ((latestStatus.rangeLow - latestStatus.currentPrice) / latestStatus.rangeLow) * 100;
                        distance = `+${dist.toFixed(2)}%`;
                      }
                    }
                  }
                } else if (closedOutsideRange) {
                  // LOGIC 3b: Close status exists + closed outside the range
                  // Show: close status + close time as breakout time + distance from range
                  // Do not show: reentry, long/short
                  breakoutTime = closeTime; // Show close time as breakout time
                  reentryTime = '-';
                  direction = '-';
                  
                  // Calculate distance from range based on close price (TP or SL)
                  // Since closedOutsideRange is true, we know the position closed outside
                  const closePrice = isWin ? latestClosedSignal.takeProfit : latestClosedSignal.stopLoss;
                  if (closePrice && latestClosedSignal.rangeHigh && latestClosedSignal.rangeLow) {
                    if (latestClosedSignal.breakoutDirection === 'long') {
                      // LONG position: closedOutsideRange true means either:
                      // - WIN: TP > rangeHigh (closed above) 
                      // - LOSS: SL < rangeLow (closed below)
                      if (isWin) {
                        // Closed at TP above range
                        const dist = ((closePrice - latestClosedSignal.rangeHigh) / latestClosedSignal.rangeHigh) * 100;
                        distance = `+${dist.toFixed(2)}%`;
                      } else {
                        // Closed at SL below range
                        const dist = ((latestClosedSignal.rangeLow - closePrice) / latestClosedSignal.rangeLow) * 100;
                        distance = `-${dist.toFixed(2)}%`;
                      }
                    } else {
                      // SHORT position: closedOutsideRange true means either:
                      // - WIN: TP < rangeLow (closed below)
                      // - LOSS: SL > rangeHigh (closed above)
                      if (isWin) {
                        // Closed at TP below range
                        const dist = ((latestClosedSignal.rangeLow - closePrice) / latestClosedSignal.rangeLow) * 100;
                        distance = `-${dist.toFixed(2)}%`;
                      } else {
                        // Closed at SL above range
                        const dist = ((closePrice - latestClosedSignal.rangeHigh) / latestClosedSignal.rangeHigh) * 100;
                        distance = `+${dist.toFixed(2)}%`;
                      }
                    }
                  } else {
                    distance = '-';
                  }
                } else {
                  // LOGIC 3a: Close status exists, closed inside range, no new breakout after
                  // Show: close status only
                  // Do not show: breakout, reentry, long/short, distance
                  breakoutTime = '-';
                  reentryTime = '-';
                  direction = '-';
                  distance = '-';
                }
              }
              
              // If after 15:00 UTC+7 and close status is from previous day, clear close status
              // Only clear close status if it's from a previous day (not today's close)
              let finalCloseTime = closeTime;
              if (shouldReset && latestClosedSignal && latestClosedSignal.closeTime) {
                const closeTimeForCheck = latestClosedSignal.closeTime instanceof Date 
                  ? latestClosedSignal.closeTime 
                  : new Date(latestClosedSignal.closeTime);
                const isPreviousDayClose = isBreakoutFromPreviousDay(closeTimeForCheck);
                if (isPreviousDayClose) {
                  finalCloseTime = '-';
                }
              }
              
              const directionBadge = direction === 'LONG' 
                ? { text: 'LONG', color: '#6bcf7f', bgColor: 'rgba(107, 207, 127, 0.2)' }
                : direction === 'SHORT'
                ? { text: 'SHORT', color: '#ff6b6b', bgColor: 'rgba(255, 107, 107, 0.2)' }
                : null;
              
              return (
                <tr key={index}>
                  <td>
                    <strong>{symbol}</strong>
                  </td>
                  <td>
                    <span className="rsi-value" style={{ 
                      color: currSignal?.color || '#fff',
                      fontWeight: 'bold'
                    }}>
                      {currRSI !== null ? currRSI.toFixed(2) : 'N/A'}
                    </span>
                  </td>
                  <td>{breakoutTime}</td>
                  <td>{reentryTime}</td>
                  <td>
                    {directionBadge ? (
                      <span className="direction-badge" style={{ 
                        backgroundColor: directionBadge.bgColor,
                        color: directionBadge.color,
                        borderColor: directionBadge.color
                      }}>
                        {directionBadge.text}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>-</span>
                    )}
                  </td>
                  <td>
                    {finalCloseTime !== '-' ? (
                      <span style={{ 
                        color: '#6bcf7f',
                        fontWeight: 'bold'
                      }}>
                        {finalCloseTime}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>-</span>
                    )}
                  </td>
                  <td>
                    {distance !== '-' ? (
                      <span style={{ 
                        color: directionBadge?.color || '#fff',
                        fontWeight: 'bold'
                      }}>
                        {distance}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="rsi-table-footer">
        <p>Total cryptocurrencies analyzed: <strong>{filteredRsiData.length}</strong> {filteredRsiData.length !== rsiData.length && `(filtered from ${rsiData.length})`}</p>
      </div>
    </div>
  );
};

// Oversold History Table Component
const OversoldHistoryTable = ({ data, loading, error, onRefresh, selectedCryptos, onToggleCrypto, isExpanded, onToggleExpanded, lastUpdateTime }) => {
  // Filter data by selected cryptocurrencies (show/hide)
  const normalizedData = normalizeDates(data || []);
  const filteredData = normalizedData.filter(item => {
    const symbol = (item.symbol || '').replace('/USDT', '');
    return selectedCryptos.has(symbol);
  });
  const dataCount = filteredData.length;

  if (!isExpanded) {
    return (
      <div className="oversold-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Oversold History (RSI ≤ 30)"
          count={loading ? null : dataCount}
          lastUpdateTime={lastUpdateTime}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="oversold-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Oversold History (RSI ≤ 30)"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="loading-mini">
        <div className="spinner-mini"></div>
        <span>Fetching oversold history (this may take a while)...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="oversold-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Oversold History (RSI ≤ 30)"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="error-mini">
        <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="oversold-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Oversold History (RSI ≤ 30)"
          count={0}
          lastUpdateTime={lastUpdateTime}
        />
        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No oversold events found in the last 3 days. Click "Refresh" to fetch data.
        </p>
      </div>
    );
  }

  return (
    <div className="oversold-table-container">
      <SectionToggle 
        isExpanded={isExpanded} 
        onToggle={onToggleExpanded} 
        title="Oversold History (RSI ≤ 30)"
        count={dataCount}
        lastUpdateTime={lastUpdateTime}
      />
      <div className="oversold-table-header">
        <div>
          <p className="oversold-subtitle">Last 3 days | 1 Hour Timeframe | Timezone: UTC+7</p>
        </div>
        <button onClick={onRefresh} className="refresh-btn-small" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="oversold-info">
        <p className="oversold-count">
          <strong>[DATA]</strong> Found <strong>{filteredData.length}</strong> RSI ≤ 30 events in the last 3 days:
        </p>
      </div>
      
      {/* Summary: Count per cryptocurrency and unique time periods */}
      {(() => {
        // Use all data (not filtered) for summary display
        const allData = normalizedData;
        
        // Count per cryptocurrency
        const summary = allData.reduce((acc, item) => {
          const symbol = item.symbol.replace('/USDT', '');
          acc[symbol] = (acc[symbol] || 0) + 1;
          return acc;
        }, {});
        
        const summaryEntries = Object.entries(summary).sort((a, b) => b[1] - a[1]); // Sort by count descending
        
        // Count unique time periods with consecutive grouping logic
        // Consecutive hours (within same day) count as 1, non-consecutive count separately
        const timePeriodMap = new Map(); // date -> Set of hours
        const dayTimePeriodMap = new Map(); // date -> Set of hours (only 06:00-22:00)
        
        allData.forEach(item => {
          const date = formatDate(item.timestamp); // e.g., "2025-10-29"
          const time = formatTime(item.timestamp); // e.g., "14:00"
          const hour = parseInt(time.split(':')[0], 10); // Extract hour as number
          
          // Add to time periods
          if (!timePeriodMap.has(date)) {
            timePeriodMap.set(date, new Set());
          }
          timePeriodMap.get(date).add(hour);
          
          // Only add to dayTimePeriods if NOT between 22:00-06:00
          if (!isNightTime(item.timestamp)) {
            if (!dayTimePeriodMap.has(date)) {
              dayTimePeriodMap.set(date, new Set());
            }
            dayTimePeriodMap.get(date).add(hour);
          }
        });
        
        // Count consecutive groups for each date
        const countConsecutiveGroups = (hoursSet) => {
          if (hoursSet.size === 0) return 0;
          const sortedHours = Array.from(hoursSet).sort((a, b) => a - b);
          let groups = 1; // Start with 1 group
          
          for (let i = 1; i < sortedHours.length; i++) {
            // If not consecutive (difference > 1 hour), it's a new group
            if (sortedHours[i] - sortedHours[i - 1] > 1) {
              groups++;
            }
          }
          return groups;
        };
        
        // Count total unique time periods (sum of consecutive groups across all dates)
        let uniqueTimeCount = 0;
        let uniqueDayTimeCount = 0;
        
        timePeriodMap.forEach((hoursSet) => {
          uniqueTimeCount += countConsecutiveGroups(hoursSet);
        });
        
        dayTimePeriodMap.forEach((hoursSet) => {
          uniqueDayTimeCount += countConsecutiveGroups(hoursSet);
        });
        
        return (
          <div className="oversold-summary">
            <div className="summary-header">
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600' }}>Summary by Cryptocurrency:</h4>
              <div className="unique-time-count">
                <div className="unique-time-item">
                  <span className="unique-time-label">Unique Time Periods:</span>
                  <span className="unique-time-value"><strong>{uniqueTimeCount}</strong> {uniqueTimeCount === 1 ? 'time period' : 'time periods'}</span>
                </div>
                <div className="unique-time-item day-time-only">
                  <span className="unique-time-label">Normal Hours (06:00-22:00):</span>
                  <span className="unique-time-value"><strong>{uniqueDayTimeCount}</strong> {uniqueDayTimeCount === 1 ? 'time period' : 'time periods'}</span>
                </div>
              </div>
            </div>
            <div className="oversold-summary-grid">
              {summaryEntries.map(([symbol, count]) => {
                const isSelected = selectedCryptos.has(symbol);
                
                return (
                  <div 
                    key={symbol} 
                    className="oversold-summary-item"
                    onClick={() => onToggleCrypto(symbol)}
                    style={{ 
                      backgroundColor: isSelected ? 'rgba(107, 207, 127, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: isSelected ? '2px solid #6bcf7f' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: isSelected ? 1 : 0.6
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }
                    }}
                  >
                  <span className="summary-symbol"><strong>{symbol}</strong></span>
                  <span className="summary-count">{count} {count === 1 ? 'time' : 'times'}</span>
                </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      
      <div className="oversold-table-wrapper">
        <table className="oversold-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Date</th>
              <th>Time</th>
              <th>RSI</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => {
              const isTodayRow = isToday(item.timestamp);
              const isNightRow = isNightTime(item.timestamp);
              // Night time rows have higher priority than today rows
              const rowClass = `oversold-row ${isNightRow ? 'night-row' : ''} ${isTodayRow && !isNightRow ? 'today-row' : ''}`;
              
              return (
                <tr key={index} className={rowClass.trim()}>
                  <td><strong>{item.symbol}</strong></td>
                  <td>{formatDate(item.timestamp)}</td>
                  <td>{formatTime(item.timestamp)}</td>
                  <td>
                    <span className="rsi-value-oversold" style={{ color: '#4dabf7', fontWeight: 'bold' }}>
                      {item.rsi.toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="oversold-table-footer">
        <p>Total events: <strong>{filteredData.length}</strong></p>
      </div>
    </div>
  );
};

// Breakouts Without Re-entry Table Component
const BreakoutsWithoutReentryTable = ({ data, loading, error, onRefresh, selectedCryptos, isExpanded, onToggleExpanded, lastUpdateTime }) => {
  // Filter data by selected cryptocurrencies (show/hide)
  const normalizedData = normalizeDates(data || []);
  const filteredData = normalizedData.filter(item => {
    const symbol = (item.symbol || '').replace('/USDT', '');
    return selectedCryptos.has(symbol);
  });
  const dataCount = filteredData.length;

  if (!isExpanded) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Breakouts Without Re-entry"
          count={loading ? null : dataCount}
          lastUpdateTime={lastUpdateTime}
        />
      </div>
    );
  }

  // Only show loading if we don't have data yet
  if (loading && (!data || !Array.isArray(data) || data.length === 0)) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Breakouts Without Re-entry"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="loading-mini">
        <div className="spinner-mini"></div>
          <span>Fetching breakouts without re-entry (this may take a while)...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Breakouts Without Re-entry"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="error-mini">
        <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Breakouts Without Re-entry"
          count={0}
          lastUpdateTime={lastUpdateTime}
        />
        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No breakouts without re-entry found. Click "Refresh" to fetch data.
        </p>
      </div>
    );
  }

  return (
    <div className="breakout-table-container">
      <SectionToggle 
        isExpanded={isExpanded} 
        onToggle={onToggleExpanded} 
        title="Breakouts Without Re-entry"
        count={dataCount}
        lastUpdateTime={lastUpdateTime}
      />
        <div className="breakout-table-header">
        <div>
          <p className="breakout-subtitle">Last 24 hours | 4H Range (High/Low) | Breakout detected but no re-entry yet | Display: UTC+7</p>
        </div>
        <button onClick={onRefresh} className="refresh-btn-small" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="breakout-info">
        <p className="breakout-count">
          <strong>[DATA]</strong> Found <strong>{filteredData.length}</strong> breakouts without re-entry:
        </p>
      </div>
      
      <div className="breakout-table-wrapper">
        <table className="breakout-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Range (High/Low)</th>
              <th>Time Breakout</th>
              <th>Breakout Price</th>
              <th>Direction</th>
              <th>Current Price</th>
              <th>Distance from Range</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((breakout, index) => {
              const directionBadge = breakout.isAbove 
                ? { text: 'ABOVE', color: '#ff6b6b', bgColor: 'rgba(255, 107, 107, 0.2)' }
                : { text: 'BELOW', color: '#6bcf7f', bgColor: 'rgba(107, 207, 127, 0.2)' };
              
              // Calculate distance from range
              const calculateDistance = () => {
                if (!breakout.currentPrice) return 'N/A';
                if (breakout.isAbove) {
                  const distance = ((breakout.currentPrice - breakout.rangeHigh) / breakout.rangeHigh) * 100;
                  return `+${distance.toFixed(2)}%`;
                } else {
                  const distance = ((breakout.rangeLow - breakout.currentPrice) / breakout.rangeLow) * 100;
                  return `+${distance.toFixed(2)}%`;
                }
              };
              
              const distancePercent = calculateDistance();
              
              return (
                <tr key={index} className="breakout-row pending-row">
                  <td><strong>{breakout.symbol}</strong></td>
                  <td>
                    <div className="range-info">
                      <span className="range-item">
                        <strong>High:</strong> ${formatPrice(breakout.rangeHigh)}
                      </span>
                      <span className="range-item">
                        <strong>Low:</strong> ${formatPrice(breakout.rangeLow)}
                      </span>
                    </div>
                  </td>
                  <td>{formatNYTime(breakout.breakoutTime)}</td>
                  <td>${formatPrice(breakout.breakoutPrice)}</td>
                  <td>
                    <span className="direction-badge" style={{ 
                      backgroundColor: directionBadge.bgColor,
                      color: directionBadge.color,
                      borderColor: directionBadge.color
                    }}>
                      {directionBadge.text}
                    </span>
                  </td>
                  <td>
                    {breakout.currentPrice ? (
                      <span>${formatPrice(breakout.currentPrice)}</span>
                    ) : (
                      <span style={{ opacity: 0.6 }}>N/A</span>
                    )}
                  </td>
                  <td>
                    <span style={{ 
                      color: directionBadge.color,
                      fontWeight: 'bold'
                    }}>
                      {distancePercent}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="breakout-table-footer">
        <p>Total breakouts without re-entry: <strong>{filteredData.length}</strong></p>
      </div>
    </div>
  );
};

// Breakout Trading Signals Table Component
const BreakoutSignalsTable = ({ data, loading, error, onRefresh, selectedCryptos, onToggleCrypto, isExpanded, onToggleExpanded, lastUpdateTime }) => {
  // Filter data by selected cryptocurrencies (show/hide)
  const normalizedData = normalizeDates(data || []);
  
  // Calculate 24 hours ago from current time
  const now = new Date();
  const twentyFourHoursAgo = now.getTime() - (24 * 60 * 60 * 1000);
  
  // Filter by selected cryptos AND last 24 hours (based on exit time for closed, entry time for pending)
  const filteredDataRaw = normalizedData.filter(item => {
    const symbol = (item.symbol || '').replace('/USDT', '');
    if (!selectedCryptos.has(symbol)) {
      return false;
    }
    
    // Determine the time to check: use closeTime (exit time) if closed, otherwise use reentryTime (entry time)
    let timeToCheck = null;
    if (item.closeTime) {
      // Signal is closed - use exit time (closeTime)
      timeToCheck = item.closeTime instanceof Date ? item.closeTime : new Date(item.closeTime);
    } else if (item.reentryTime) {
      // Signal is pending/open - use entry time (reentryTime)
      timeToCheck = item.reentryTime instanceof Date ? item.reentryTime : new Date(item.reentryTime);
    } else {
      // No time available, exclude it
      return false;
    }
    
    // Only include if timeToCheck is within last 24 hours
    return timeToCheck.getTime() >= twentyFourHoursAgo;
  });
  
  // Sort by reentryTime (most recent first - descending order)
  const filteredData = filteredDataRaw.sort((a, b) => {
    const aTime = a.reentryTime instanceof Date ? a.reentryTime.getTime() : new Date(a.reentryTime).getTime();
    const bTime = b.reentryTime instanceof Date ? b.reentryTime.getTime() : new Date(b.reentryTime).getTime();
    return bTime - aTime; // Descending order (most recent first)
  });
  
  const dataCount = filteredData ? filteredData.length : 0;

  if (!isExpanded) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="4H UTC+7 Breakout Trading Signals"
          count={loading ? null : dataCount}
          lastUpdateTime={lastUpdateTime}
        />
      </div>
    );
  }

  // Only show loading if we don't have data yet
  if (loading && (!data || !Array.isArray(data) || data.length === 0)) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="4H UTC+7 Breakout Trading Signals"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
        <div className="loading-mini">
          <div className="spinner-mini"></div>
          <span>Fetching breakout signals (this may take a while)...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="4H UTC+7 Breakout Trading Signals"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
        <div className="error-mini">
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="breakout-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="4H UTC+7 Breakout Trading Signals"
          count={0}
          lastUpdateTime={lastUpdateTime}
        />
        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No breakout signals found. Click "Refresh" to fetch data.
        </p>
      </div>
    );
  }

  return (
    <div className="breakout-table-container">
      <SectionToggle 
        isExpanded={isExpanded} 
        onToggle={onToggleExpanded} 
        title="4H UTC+7 Breakout Trading Signals"
        count={dataCount}
        lastUpdateTime={lastUpdateTime}
      />
      <div className="breakout-table-header">
        <div>
          <p className="breakout-subtitle">Last 7 days | BTC Only | 4H Range (High/Low) | 5m Exit/Re-entry | Detection: UTC+7 Time 11:00-15:00 | Display: UTC+7 | Risk Ratio 1:2</p>
        </div>
        <button onClick={onRefresh} className="refresh-btn-small" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="breakout-info">
        <p className="breakout-count">
          <strong>[DATA]</strong> Found <strong>{filteredData.length}</strong> trading signals:
        </p>
      </div>
      
      {/* Summary by Cryptocurrency */}
      {(() => {
        // Group signals by symbol - use all data for summary (not filtered)
        const allData = normalizeDates(data || []);
        const summaryBySymbol = allData.reduce((acc, signal) => {
          const symbol = signal.symbol || 'Unknown';
          if (!acc[symbol]) {
            acc[symbol] = {
              symbol,
              total: 0,
              wins: 0,
              losses: 0,
              pending: 0
            };
          }
          acc[symbol].total++;
          if (signal.result === 'win') acc[symbol].wins++;
          else if (signal.result === 'loss') acc[symbol].losses++;
          else acc[symbol].pending++;
          return acc;
        }, {});
        
        const summaryEntries = Object.values(summaryBySymbol)
          .map(summary => {
            // Calculate win rate for sorting
            const completed = summary.wins + summary.losses;
            const winRate = completed > 0 ? (summary.wins / completed) * 100 : 0;
            return { ...summary, winRate, completed };
          })
          .sort((a, b) => {
            // Primary sort: by win rate descending (highest first)
            if (b.winRate !== a.winRate) {
              return b.winRate - a.winRate;
            }
            // Secondary sort: by total signals descending
            return b.total - a.total;
          });
        
        if (summaryEntries.length === 0) return null;
        
        return (
          <div className="oversold-summary" style={{ marginBottom: '1.5rem' }}>
            <div className="summary-header">
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600' }}>Summary by Cryptocurrency:</h4>
            </div>
            <div className="oversold-summary-grid">
              {summaryEntries.map((summary) => {
                const winRate = summary.winRate.toFixed(2);
                const winLossRatio = summary.losses > 0 ? (summary.wins / summary.losses).toFixed(2) : (summary.wins > 0 ? '∞' : '0.00');
                const isSelected = selectedCryptos.has(summary.symbol);
                
                return (
                  <div 
                    key={summary.symbol} 
                    className="oversold-summary-item" 
                    onClick={() => onToggleCrypto(summary.symbol)}
                    style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '0.25rem',
                    padding: '0.75rem',
                    borderRadius: '4px',
                      backgroundColor: isSelected ? 'rgba(107, 207, 127, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: isSelected ? '2px solid #6bcf7f' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: isSelected ? 1 : 0.6
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span className="summary-symbol"><strong>{summary.symbol}</strong></span>
                      <span className="summary-count" style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                        {summary.total} {summary.total === 1 ? 'signal' : 'signals'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#6bcf7f' }}>
                        <strong>Win:</strong> {summary.wins}
                      </span>
                      <span style={{ color: '#ff6b6b' }}>
                        <strong>Loss:</strong> {summary.losses}
                      </span>
                      {summary.pending > 0 && (
                        <span style={{ color: '#ffd93d' }}>
                          <strong>Pending:</strong> {summary.pending}
                        </span>
                      )}
                    </div>
                    {summary.completed > 0 && (
                      <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        <span style={{ 
                          color: parseFloat(winRate) >= 50 ? '#6bcf7f' : '#ff6b6b',
                          fontWeight: '600'
                        }}>
                          Win Rate: {winRate}%
                        </span>
                        <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>
                          ({winLossRatio}:1)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      
      <div className="breakout-table-wrapper">
        <table className="breakout-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Range (High/Low)</th>
              <th>Time E/R/C</th>
              <th>Long/Short</th>
              <th>TP/SL</th>
              <th>Gain %</th>
              <th>Simulation ($1000 @ 50x)</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((signal, index) => {
              const isWin = signal.result === 'win';
              const isLoss = signal.result === 'loss';
              const isPending = signal.result === 'pending';
              const rowClass = `breakout-row ${isWin ? 'win-row' : ''} ${isLoss ? 'loss-row' : ''} ${isPending ? 'pending-row' : ''}`;
              
              const directionBadge = signal.breakoutDirection === 'long' 
                ? { text: 'LONG', color: '#6bcf7f', bgColor: 'rgba(107, 207, 127, 0.2)' }
                : { text: 'SHORT', color: '#ff6b6b', bgColor: 'rgba(255, 107, 107, 0.2)' };
              
              // Calculate percentage gain from entry to take profit
              const calculateGainPercent = () => {
                if (!signal.entryPrice || !signal.takeProfit) return 'N/A';
                if (signal.breakoutDirection === 'long') {
                  // For LONG: (TP - Entry) / Entry * 100
                  const gain = ((signal.takeProfit - signal.entryPrice) / signal.entryPrice) * 100;
                  return gain.toFixed(2);
                } else {
                  // For SHORT: (Entry - TP) / Entry * 100
                  const gain = ((signal.entryPrice - signal.takeProfit) / signal.entryPrice) * 100;
                  return gain.toFixed(2);
                }
              };
              
              const gainPercent = calculateGainPercent();
              
              // Calculate simulation P&L for $1000 at 50x leverage
              const calculateSimulation = () => {
                if (!signal.entryPrice || !signal.takeProfit || !signal.stopLoss) return { profit: null, loss: null };
                
                const principal = 1000;
                const leverage = 50;
                
                if (signal.breakoutDirection === 'long') {
                  // For LONG: Profit at TP, Loss at SL
                  const tpPriceChange = ((signal.takeProfit - signal.entryPrice) / signal.entryPrice);
                  const slPriceChange = ((signal.entryPrice - signal.stopLoss) / signal.entryPrice);
                  const profit = principal * leverage * tpPriceChange;
                  const loss = principal * leverage * slPriceChange;
                  return { profit, loss };
                } else {
                  // For SHORT: Profit at TP, Loss at SL
                  const tpPriceChange = ((signal.entryPrice - signal.takeProfit) / signal.entryPrice);
                  const slPriceChange = ((signal.stopLoss - signal.entryPrice) / signal.entryPrice);
                  const profit = principal * leverage * tpPriceChange;
                  const loss = principal * leverage * slPriceChange;
                  return { profit, loss };
                }
              };
              
              const simulation = calculateSimulation();
              
              return (
                <tr key={index} className={rowClass.trim()}>
                  <td><strong>{signal.symbol}</strong></td>
                  <td>
                    <div className="range-info">
                      <span className="range-item">
                        <strong>High:</strong> ${signal.rangeHigh ? formatPrice(signal.rangeHigh) : 'N/A'}
                      </span>
                      <span className="range-item">
                        <strong>Low:</strong> ${signal.rangeLow ? formatPrice(signal.rangeLow) : 'N/A'}
                      </span>
                      {signal.rangeCloseTime && (() => {
                        const dateAt1100 = getDateAt1100UTC7(signal.rangeCloseTime);
                        return dateAt1100 ? (
                          <span className="range-item" style={{ marginTop: '0.25rem', fontSize: '0.85rem', opacity: 0.8 }}>
                            {formatNYTime(dateAt1100)}
                          </span>
                        ) : (
                          <span className="range-item" style={{ marginTop: '0.25rem', fontSize: '0.85rem', opacity: 0.8 }}>
                            11:00
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.9rem' }}>
                      <span>{formatNYTime(signal.breakoutTime)}</span>
                      <span>{formatNYTime(signal.reentryTime)}</span>
                      {signal.closeTime && (
                        <span style={{ marginTop: '0.2rem' }}>
                          {formatNYTime(signal.closeTime)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="direction-badge" style={{ 
                      backgroundColor: directionBadge.bgColor,
                      color: directionBadge.color,
                      borderColor: directionBadge.color
                    }}>
                      {directionBadge.text}
                    </span>
                    <span style={{ marginLeft: '0.5rem' }}>${formatPrice(signal.entryPrice)}</span>
                  </td>
                  <td>
                    <div className="tp-sl-info">
                      <span className="tp-sl-item">
                        <strong>TP:</strong> ${formatPrice(signal.takeProfit)}
                      </span>
                      <span className="tp-sl-item">
                        <strong>SL:</strong> ${formatPrice(signal.stopLoss)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ 
                      color: isWin ? '#6bcf7f' : isLoss ? '#ff6b6b' : (signal.breakoutDirection === 'long' ? '#6bcf7f' : '#ff6b6b'),
                      fontWeight: 'bold',
                      fontSize: '1rem'
                    }}>
                      {gainPercent !== 'N/A' ? (isLoss ? `-${gainPercent}%` : `+${gainPercent}%`) : gainPercent}
                    </span>
                  </td>
                  <td>
                    {simulation.profit !== null && simulation.loss !== null ? (
                      <div className="simulation-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>TP Hit:</span>
                          <span style={{ 
                            color: '#6bcf7f', 
                            fontWeight: 'bold',
                            fontSize: '0.95rem'
                          }}>
                            +${simulation.profit.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>SL Hit:</span>
                          <span style={{ 
                            color: '#ff6b6b', 
                            fontWeight: 'bold',
                            fontSize: '0.95rem'
                          }}>
                            -${simulation.loss.toFixed(2)}
                          </span>
                        </div>
                        <div style={{ 
                          fontSize: '0.75rem', 
                          opacity: 0.6, 
                          marginTop: '0.25rem',
                          fontStyle: 'italic'
                        }}>
                          {isWin && `Final: +$${(simulation.profit).toFixed(2)}`}
                          {isLoss && `Final: -$${(simulation.loss).toFixed(2)}`}
                          {isPending && `Net: +$${(simulation.profit - simulation.loss).toFixed(2)} if win`}
                        </div>
                      </div>
                    ) : (
                      <span style={{ opacity: 0.6 }}>N/A</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="breakout-table-footer">
        {(() => {
          const wins = filteredData.filter(s => s.result === 'win').length;
          const losses = filteredData.filter(s => s.result === 'loss').length;
          const pending = filteredData.filter(s => s.result === 'pending').length;
          const completed = wins + losses;
          const winRate = completed > 0 ? ((wins / completed) * 100).toFixed(2) : 0;
          const lossRate = completed > 0 ? ((losses / completed) * 100).toFixed(2) : 0;
          
          // Wallet Simulation: $10,000 wallet, $1000 per trade @ 50x leverage
          const walletBalance = 10000;
          const perTradeAllocation = 1000;
          const leverage = 50;
          
          const calculateWalletSimulation = () => {
            let totalProfitIfAllTP = 0;
            let totalLossIfAllSL = 0;
            let actualProfit = 0;
            let actualLoss = 0;
            let pendingProfit = 0;
            let pendingLoss = 0;
            
            filteredData.forEach(signal => {
              if (!signal.entryPrice || !signal.takeProfit || !signal.stopLoss) return;
              
              let tpPriceChange, slPriceChange;
              if (signal.breakoutDirection === 'long') {
                tpPriceChange = ((signal.takeProfit - signal.entryPrice) / signal.entryPrice);
                slPriceChange = ((signal.entryPrice - signal.stopLoss) / signal.entryPrice);
              } else {
                tpPriceChange = ((signal.entryPrice - signal.takeProfit) / signal.entryPrice);
                slPriceChange = ((signal.stopLoss - signal.entryPrice) / signal.entryPrice);
              }
              
              const profit = perTradeAllocation * leverage * tpPriceChange;
              const loss = perTradeAllocation * leverage * slPriceChange;
              
              totalProfitIfAllTP += profit;
              totalLossIfAllSL += loss;
              
              if (signal.result === 'win') {
                actualProfit += profit;
              } else if (signal.result === 'loss') {
                actualLoss += loss;
              } else if (signal.result === 'pending') {
                pendingProfit += profit;
                pendingLoss += loss;
              }
            });
            
            const actualNet = actualProfit - actualLoss;
            const finalWallet = walletBalance + actualNet;
            const potentialNet = totalProfitIfAllTP - totalLossIfAllSL;
            const optimisticFinal = walletBalance + totalProfitIfAllTP;
            const pessimisticFinal = walletBalance - totalLossIfAllSL;
            
            return {
              totalProfitIfAllTP,
              totalLossIfAllSL,
              actualProfit,
              actualLoss,
              actualNet,
              finalWallet,
              potentialNet,
              optimisticFinal,
              pessimisticFinal,
              pendingProfit,
              pendingLoss,
              totalTrades: filteredData.length
            };
          };
          
          const simulation = calculateWalletSimulation();
          const tradesToFund = Math.ceil(simulation.totalTrades * perTradeAllocation / walletBalance);
          const canTradeAll = simulation.totalTrades * perTradeAllocation <= walletBalance;
          
          return (
            <>
              <p>Total signals: <strong>{filteredData.length}</strong></p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', opacity: 0.8 }}>
                Win: <strong style={{ color: '#6bcf7f' }}>{wins}</strong> | 
                Loss: <strong style={{ color: '#ff6b6b' }}>{losses}</strong> | 
                Pending: <strong style={{ color: '#ffd93d' }}>{pending}</strong>
              </p>
              {completed > 0 && (
                <>
                  <p style={{ marginTop: '0.5rem', fontSize: '1rem', fontWeight: '600' }}>
                    Win Rate: <strong style={{ color: winRate >= 50 ? '#6bcf7f' : '#ff6b6b', fontSize: '1.1rem' }}>
                      {winRate}%
                    </strong> ({wins}W / {losses}L)
                  </p>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.95rem', opacity: 0.85 }}>
                    Loss Rate: <strong style={{ color: '#ff6b6b' }}>
                      {lossRate}%
                    </strong> | Win/Loss Ratio: <strong style={{ color: wins >= losses ? '#6bcf7f' : '#ff6b6b' }}>
                      {(wins / losses || 0).toFixed(2)}:1
                    </strong>
                  </p>
                </>
              )}
              
              {/* Wallet Simulation Summary */}
              <div style={{ 
                marginTop: '1.5rem', 
                padding: '1rem', 
                backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <h4 style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '600', 
                  marginBottom: '0.75rem',
                  color: '#ffd93d'
                }}>
                  💰 Wallet Simulation: ${walletBalance.toLocaleString()} @ $1,000/trade (50x leverage)
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                    <strong>Allocation:</strong> {canTradeAll ? (
                      <span style={{ color: '#6bcf7f' }}>
                        Can fund all {simulation.totalTrades} trades (${(simulation.totalTrades * perTradeAllocation).toLocaleString()})
                      </span>
                    ) : (
                      <span style={{ color: '#ffd93d' }}>
                        Need ${(simulation.totalTrades * perTradeAllocation).toLocaleString()} ({tradesToFund}x wallet size) for all trades
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <div style={{ padding: '0.75rem', backgroundColor: 'rgba(107, 207, 127, 0.1)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.25rem' }}>If All TP Hit:</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#6bcf7f' }}>
                        +${simulation.totalProfitIfAllTP.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.25rem' }}>
                        Final: ${simulation.optimisticFinal.toFixed(2)}
                      </div>
                    </div>
                    
                    <div style={{ padding: '0.75rem', backgroundColor: 'rgba(255, 107, 107, 0.1)', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '0.25rem' }}>If All SL Hit:</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ff6b6b' }}>
                        -${simulation.totalLossIfAllSL.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.25rem' }}>
                        Final: ${simulation.pessimisticFinal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>Actual Results (Based on Win/Loss):</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Wins ({wins}):</span>
                      <span style={{ color: '#6bcf7f', fontWeight: 'bold' }}>+${simulation.actualProfit.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Losses ({losses}):</span>
                      <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>-${simulation.actualLoss.toFixed(2)}</span>
                    </div>
                    {pending > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', opacity: 0.7 }}>
                          <span style={{ fontSize: '0.85rem' }}>Pending ({pending}) TP:</span>
                          <span style={{ color: '#6bcf7f', fontSize: '0.85rem' }}>+${simulation.pendingProfit.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', opacity: 0.7 }}>
                          <span style={{ fontSize: '0.85rem' }}>Pending ({pending}) SL:</span>
                          <span style={{ color: '#ff6b6b', fontSize: '0.85rem' }}>-${simulation.pendingLoss.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '0.5rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}>
                      <span>Net P&L:</span>
                      <span style={{ 
                        color: simulation.actualNet >= 0 ? '#6bcf7f' : '#ff6b6b',
                        fontSize: '1.2rem'
                      }}>
                        {simulation.actualNet >= 0 ? '+' : ''}${simulation.actualNet.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginTop: '0.5rem',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      color: simulation.finalWallet >= walletBalance ? '#6bcf7f' : '#ff6b6b'
                    }}>
                      <span>Final Wallet Balance:</span>
                      <span>${simulation.finalWallet.toFixed(2)}</span>
                    </div>
                    <div style={{ 
                      fontSize: '0.85rem', 
                      opacity: 0.7, 
                      marginTop: '0.5rem',
                      textAlign: 'center'
                    }}>
                      Return: {((simulation.actualNet / walletBalance) * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
};

function App() {
  const [rsiData, setRsiData] = useState({ data: null, loading: false, error: null, lastUpdateTime: null });
  const [oversoldHistory, setOversoldHistory] = useState({ data: null, loading: false, error: null, lastUpdateTime: null });
  const [breakoutSignals, setBreakoutSignals] = useState({ data: null, loading: false, error: null, lastUpdateTime: null });
  const [breakoutsWithoutReentry, setBreakoutsWithoutReentry] = useState({ data: null, loading: false, error: null, lastUpdateTime: null });
  
  // Cryptocurrency filter state for Oversold History (stored in localStorage)
  const [oversoldSelectedCryptos, setOversoldSelectedCryptos] = useState(() => {
    try {
      const saved = localStorage.getItem('oversold_filter_selection');
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedSet = new Set(parsed);
        // Ensure all current DEFAULT_SYMBOLS are included (merge with saved selection)
        const allCryptos = DEFAULT_SYMBOLS.map(s => s.replace('/USDT', ''));
        allCryptos.forEach(crypto => savedSet.add(crypto));
        return savedSet;
      }
    } catch (e) {
      console.warn('Failed to load oversold filter from localStorage:', e);
    }
    // Default: all cryptocurrencies selected
    return new Set(DEFAULT_SYMBOLS.map(s => s.replace('/USDT', '')));
  });

  // Cryptocurrency filter state for Breakout Signals (stored in localStorage)
  const [breakoutSignalsSelectedCryptos, setBreakoutSignalsSelectedCryptos] = useState(() => {
    try {
      const saved = localStorage.getItem('breakout_signals_filter_selection');
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedSet = new Set(parsed);
        // Ensure all current DEFAULT_SYMBOLS are included (merge with saved selection)
        const allCryptos = DEFAULT_SYMBOLS.map(s => s.replace('/USDT', ''));
        allCryptos.forEach(crypto => savedSet.add(crypto));
        return savedSet;
      }
    } catch (e) {
      console.warn('Failed to load breakout signals filter from localStorage:', e);
    }
    // Default: all cryptocurrencies selected
    return new Set(DEFAULT_SYMBOLS.map(s => s.replace('/USDT', '')));
  });

  // Section expanded state (stored in localStorage)
  const [expandedSections, setExpandedSections] = useState(() => {
    try {
      const saved = localStorage.getItem('section_expanded_state');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load section expanded state from localStorage:', e);
    }
    // Default: all sections expanded
    return {
      mergedRSIBreakout: true,
      oversold: true,
      breakoutSignals: true
    };
  });

  // Notification state
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('notifications_enabled');
      return saved === 'true';
    } catch (e) {
      console.warn('Failed to load notifications enabled state:', e);
      return false;
    }
  });

  const [notificationPermission, setNotificationPermission] = useState('default');
  const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState(null);
  
  // Track notified breakouts to avoid duplicates (store in localStorage)
  const notifiedBreakoutsRef = useRef(new Set());
  
  // Load notified breakouts from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('notified_breakouts');
      if (saved) {
        const breakouts = JSON.parse(saved);
        notifiedBreakoutsRef.current = new Set(breakouts);
      }
    } catch (e) {
      console.warn('Failed to load notified breakouts:', e);
    }
  }, []);

  // Save notified breakouts to localStorage
  const saveNotifiedBreakouts = () => {
    try {
      const breakouts = Array.from(notifiedBreakoutsRef.current);
      localStorage.setItem('notified_breakouts', JSON.stringify(breakouts));
    } catch (e) {
      console.warn('Failed to save notified breakouts:', e);
    }
  };

  // Save filter selections to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('oversold_filter_selection', JSON.stringify(Array.from(oversoldSelectedCryptos)));
    } catch (e) {
      console.warn('Failed to save oversold filter to localStorage:', e);
    }
  }, [oversoldSelectedCryptos]);

  useEffect(() => {
    try {
      localStorage.setItem('breakout_signals_filter_selection', JSON.stringify(Array.from(breakoutSignalsSelectedCryptos)));
    } catch (e) {
      console.warn('Failed to save breakout signals filter to localStorage:', e);
    }
  }, [breakoutSignalsSelectedCryptos]);

  // Save section expanded state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('section_expanded_state', JSON.stringify(expandedSections));
    } catch (e) {
      console.warn('Failed to save section expanded state to localStorage:', e);
    }
  }, [expandedSections]);

  // Toggle section expanded state
  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  // Filter handlers for Oversold History
  const toggleOversoldCrypto = (crypto) => {
    setOversoldSelectedCryptos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(crypto)) {
        newSet.delete(crypto);
      } else {
        newSet.add(crypto);
      }
      return newSet;
    });
  };

  // Filter handlers for Breakout Signals
  const toggleBreakoutSignalsCrypto = (crypto) => {
    setBreakoutSignalsSelectedCryptos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(crypto)) {
        newSet.delete(crypto);
      } else {
        newSet.add(crypto);
      }
      return newSet;
    });
  };

  // Fetch RSI directly from Binance API
  const fetchRSIData = async (forceRefresh = false) => {
    setRsiData(prev => ({ ...prev, loading: true, error: null }));

    try {
      const results = await fetchMultipleRSI(DEFAULT_SYMBOLS, 14, 14, forceRefresh);
      const updateTime = new Date();
      console.log(`[RSI] Data updated at ${updateTime.toISOString()}`);
      setRsiData({ data: results, loading: false, error: null, lastUpdateTime: updateTime });
    } catch (err) {
      setRsiData(prev => ({ 
        data: null, 
        loading: false, 
        error: err.message || 'Failed to fetch RSI from Binance',
        lastUpdateTime: prev?.lastUpdateTime || null
      }));
    }
  };

  // Fetch oversold history (RSI <= 30) for last 3 days
  const fetchOversoldData = async (forceRefresh = false) => {
    setOversoldHistory(prev => ({ ...prev, loading: true, error: null }));

    try {
      const results = await fetchOversoldHistory(DEFAULT_SYMBOLS, 3, 30, forceRefresh);
      const updateTime = new Date();
      console.log(`[Oversold] Data updated at ${updateTime.toISOString()}`);
      setOversoldHistory({ data: results, loading: false, error: null, lastUpdateTime: updateTime });
    } catch (err) {
      setOversoldHistory(prev => ({ 
        data: null, 
        loading: false, 
        error: err.message || 'Failed to fetch oversold history from Binance',
        lastUpdateTime: prev?.lastUpdateTime || null
      }));
    }
  };

  // Helper function to calculate distance from range
  const calculateDistanceFromRange = (breakout) => {
    if (!breakout.currentPrice || !breakout.rangeHigh || !breakout.rangeLow) {
      return null;
    }

    if (breakout.isAbove) {
      // Above range: distance = ((currentPrice - rangeHigh) / rangeHigh) * 100
      return ((breakout.currentPrice - breakout.rangeHigh) / breakout.rangeHigh) * 100;
    } else {
      // Below range: distance = ((rangeLow - currentPrice) / rangeLow) * 100
      return ((breakout.rangeLow - breakout.currentPrice) / breakout.rangeLow) * 100;
    }
  };

  // Helper function to check for new breakouts and send notifications
  const checkAndNotifyNewBreakouts = (newSignals, oldSignals = [], newBreakoutsWithoutReentry = [], oldBreakoutsWithoutReentry = []) => {
    if (!notificationsEnabled || notificationPermission !== 'granted') {
      return;
    }

    // 1. Check for new breakouts with re-entry (BREAKOUT notification)
    if (newSignals && Array.isArray(newSignals)) {
      // Create a map of old signals for quick lookup
      const oldSignalsMap = new Map();
      if (oldSignals && Array.isArray(oldSignals)) {
        oldSignals.forEach(signal => {
          if (signal.reentryTime) {
            const key = `signal_${signal.symbol}_${signal.reentryTime instanceof Date ? signal.reentryTime.getTime() : new Date(signal.reentryTime).getTime()}`;
            oldSignalsMap.set(key, signal);
          }
        });
      }

      // Find new signals (signals with re-entry that weren't in old data)
      newSignals.forEach(signal => {
        if (!signal.reentryTime) return; // Only notify for signals with re-entry
        if (signal.result === 'win' || signal.result === 'loss') return; // Don't notify for closed positions
        
        const reentryTime = signal.reentryTime instanceof Date 
          ? signal.reentryTime 
          : new Date(signal.reentryTime);
        const key = `signal_${signal.symbol}_${reentryTime.getTime()}`;
        
        // Check if this is a new signal (not in old data and not already notified)
        const isNewSignal = !oldSignalsMap.has(key);
        const alreadyNotified = notifiedBreakoutsRef.current.has(key);
        
        if (isNewSignal && !alreadyNotified) {
          // This is a new breakout with re-entry - send notification
          const notification = formatBreakoutNotification(
            signal.symbol || 'UNKNOWN',
            signal.breakoutTime,
            signal.reentryTime,
            signal.breakoutDirection,
            formatNYTime // Pass formatNYTime function
          );
          
          sendNotification(notification.title, {
            body: notification.body,
            icon: notification.icon,
            tag: notification.tag,
            data: notification.data
          }).then(sent => {
            if (sent) {
              // Mark as notified
              notifiedBreakoutsRef.current.add(key);
              saveNotifiedBreakouts();
              console.log(`[Notifications] Sent BREAKOUT notification for ${signal.symbol}`);
            }
          });
        }
      });
    }

    // 2. Check for distance from range < 1% (DISTANCE notification)
    if (newBreakoutsWithoutReentry && Array.isArray(newBreakoutsWithoutReentry)) {
      // Create a map of old breakouts for quick lookup
      const oldBreakoutsMap = new Map();
      if (oldBreakoutsWithoutReentry && Array.isArray(oldBreakoutsWithoutReentry)) {
        oldBreakoutsWithoutReentry.forEach(breakout => {
          if (breakout.breakoutTime) {
            const key = `distance_${breakout.symbol}_${breakout.breakoutTime instanceof Date ? breakout.breakoutTime.getTime() : new Date(breakout.breakoutTime).getTime()}`;
            oldBreakoutsMap.set(key, breakout);
          }
        });
      }

      // Check each breakout for distance < 1%
      newBreakoutsWithoutReentry.forEach(breakout => {
        if (!breakout.breakoutTime) return;
        
        const breakoutTime = breakout.breakoutTime instanceof Date 
          ? breakout.breakoutTime 
          : new Date(breakout.breakoutTime);
        const key = `distance_${breakout.symbol}_${breakoutTime.getTime()}`;
        
        // Calculate distance from range
        const distancePercent = calculateDistanceFromRange(breakout);
        
        if (distancePercent !== null && Math.abs(distancePercent) < 1) {
          // Distance is less than 1% - check if we should notify
          const alreadyNotified = notifiedBreakoutsRef.current.has(key);
          
          if (!alreadyNotified) {
            // Send notification for distance < 1%
            const symbolName = breakout.symbol || 'UNKNOWN';
            const direction = breakout.isAbove ? 'LONG' : 'SHORT';
            const distanceText = distancePercent >= 0 
              ? `+${distancePercent.toFixed(2)}%` 
              : `${distancePercent.toFixed(2)}%`;
            
            sendNotification(`📊 ${symbolName} Close to Range`, {
              body: `${direction} breakout is ${distanceText} from range\nBreakout: ${formatNYTime(breakoutTime)}`,
              icon: '/icon-192x192.png',
              tag: `distance-${symbolName}-${breakoutTime.getTime()}`,
              data: { symbol: breakout.symbol, type: 'distance-alert', distance: distancePercent }
            }).then(sent => {
              if (sent) {
                // Mark as notified
                notifiedBreakoutsRef.current.add(key);
                saveNotifiedBreakouts();
                console.log(`[Notifications] Sent DISTANCE notification for ${symbolName} (${distanceText} from range)`);
              }
            });
          }
        }
      });
    }
  };

  // Fetch breakout trading signals (single API call returns both signals and breakoutsWithoutReentry)
  // This data is used by both:
  // - RSI Analysis & Breakout Status (uses breakoutsWithoutReentry for current status)
  // - 4H UTC+7 Breakout Trading Signals (uses signals for history)
  const fetchBreakoutSignals = async (forceRefresh = false) => {
    // Only show loading if we don't have data yet
    setBreakoutSignals(prev => {
      const hasData = prev.data && Array.isArray(prev.data) && prev.data.length > 0;
      return { ...prev, loading: !hasData, error: null };
    });
    
    setBreakoutsWithoutReentry(prev => {
      const hasData = prev.data && Array.isArray(prev.data) && prev.data.length > 0;
      return { ...prev, loading: !hasData, error: null };
    });

    try {
      // Single API call returns both { signals, breakoutsWithoutReentry }
      // Uses caching with incremental fetching (sinceDate parameter) to only get new data
      const results = await fetchMultipleBreakoutSignals(DEFAULT_SYMBOLS, 3, forceRefresh);
      const updateTime = new Date();
      console.log(`[BreakoutSignals] Data updated at ${updateTime.toISOString()} - ${results.signals?.length || 0} signals, ${results.breakoutsWithoutReentry?.length || 0} breakouts`);
      
      // Check for new breakouts and send notifications
      // Need to access previous state to compare
      setBreakoutSignals(prev => {
        const prevSignals = prev.data || [];
        
        // Also get previous breakoutsWithoutReentry for distance checking
        const prevBreakoutsWithoutReentry = breakoutsWithoutReentry.data || [];
        
        // Check for new breakouts after state update
        if (notificationsEnabled && notificationPermission === 'granted') {
          // Use setTimeout to ensure state update happens first
          setTimeout(() => {
            checkAndNotifyNewBreakouts(
              results.signals || [], 
              prevSignals,
              results.breakoutsWithoutReentry || [],
              prevBreakoutsWithoutReentry
            );
          }, 100);
        }
        
        return { 
          data: results.signals || [], 
          loading: false, 
          error: null, 
          lastUpdateTime: updateTime 
        };
      });
      
      setBreakoutsWithoutReentry(prev => {
        const prevBreakouts = prev.data || [];
        
        return { 
          data: results.breakoutsWithoutReentry || [], 
          loading: false, 
          error: null, 
          lastUpdateTime: updateTime 
        };
      });
    } catch (err) {
      setBreakoutSignals(prev => ({ 
        data: prev.data || null, // Keep existing data on error
        loading: false, 
        error: err.message || 'Failed to fetch breakout signals from Binance',
        lastUpdateTime: prev?.lastUpdateTime || null
      }));
      
      setBreakoutsWithoutReentry(prev => ({ 
        data: prev.data || null, // Keep existing data on error
        loading: false, 
        error: err.message || 'Failed to fetch breakout signals from Binance',
        lastUpdateTime: prev?.lastUpdateTime || null
      }));
    }
  };

  // Alias for backward compatibility (components may still reference this)
  // Now just calls fetchBreakoutSignals which handles both
  const fetchBreakoutsWithoutReentryData = fetchBreakoutSignals;

  // Register service worker and check notification permission on mount
  useEffect(() => {
    const initNotifications = async () => {
      // Check notification support
      if (!isNotificationSupported()) {
        console.warn('[Notifications] Notifications not supported in this browser');
        return;
      }

      // Check current permission
      const permission = getNotificationPermission();
      setNotificationPermission(permission);

      // Register service worker
      const registration = await registerServiceWorker();
      if (registration) {
        setServiceWorkerRegistration(registration);
        console.log('[Notifications] Service worker registered successfully');
      }

      // If notifications are enabled but permission is not granted, request it
      if (notificationsEnabled && permission !== 'granted') {
        const newPermission = await requestNotificationPermission();
        setNotificationPermission(newPermission);
        
        if (newPermission !== 'granted') {
          setNotificationsEnabled(false);
          console.warn('[Notifications] Permission denied, disabling notifications');
        }
      }
    };

    initNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save notifications enabled state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('notifications_enabled', notificationsEnabled.toString());
    } catch (e) {
      console.warn('Failed to save notifications enabled state:', e);
    }
  }, [notificationsEnabled]);

  // Auto-fetch all data on component mount
  useEffect(() => {
    // Fetch all data automatically when page loads
    // RSI will use cache if available, breakout features use cache with incremental fetching
    fetchRSIData(); // Uses cache by default (forceRefresh=false)
    fetchOversoldData(); // Uses cache by default (forceRefresh=false)
    fetchBreakoutSignals(); // Uses cache with incremental fetching (forceRefresh=false) - returns both signals and breakoutsWithoutReentry
    // Note: fetchBreakoutsWithoutReentryData is now an alias to fetchBreakoutSignals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh RSI features on hour change (xx:00:00)
  // This only refreshes RSI Analysis and Oversold History, not breakout features
  const lastTriggeredHourRef = useRef(-1);

  useEffect(() => {
    const checkAndUpdateRSI = () => {
      const now = new Date();
      const minutes = now.getMinutes();
      const currentHour = now.getHours();
      
      // Check if we're at the start of a new hour (minutes === 0)
      // Also check if we haven't triggered for this hour yet
      // Allow for seconds 0-2 to catch the exact moment (since we check every 500ms)
      if (minutes === 0 && currentHour !== lastTriggeredHourRef.current) {
        lastTriggeredHourRef.current = currentHour;
        const timestamp = now.toISOString();
        console.log(`[RSI Auto-Update] Triggering RSI refresh at ${timestamp} (Hour: ${currentHour}:00:00)`);
        
        // Only refresh RSI features (these will check cache and fetch new candles if available)
        // Using forceRefresh=false to leverage cache - it will auto-detect new hourly candles
        fetchRSIData(false);
        fetchOversoldData(false);
        
        // Note: Breakout features are NOT refreshed automatically - left untouched
      }
    };

    // Check every 500ms to catch the moment when we enter a new hour (minutes becomes 0)
    const intervalId = setInterval(checkAndUpdateRSI, 500);

    // Cleanup on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - fetch functions are stable, refs persist across renders

  // Auto-refresh breakout features every 1 minute (since cache is disabled, fetch fresh data frequently)
  // This refreshes both RSI Analysis & Breakout Status and 4H UTC+7 Breakout Trading Signals
  // Since cache is disabled, always fetches fresh data
  const lastTriggeredMinRef = useRef(-1);
  
  useEffect(() => {
    const checkAndUpdateBreakout = () => {
      const now = new Date();
      const seconds = now.getSeconds();
      const minutes = now.getMinutes();
      
      // Check if we're at the start of a new minute (xx:00, xx:01, xx:02, etc.)
      // Only trigger when seconds < 2 to catch the exact moment, and we haven't triggered for this minute yet
      const shouldTrigger = seconds < 2 && minutes !== lastTriggeredMinRef.current;
      
      if (shouldTrigger) {
        lastTriggeredMinRef.current = minutes;
        const timestamp = now.toISOString();
        const hour = now.getHours();
        console.log(`[Breakout Auto-Update] Triggering breakout refresh at ${timestamp} (${hour}:${String(minutes).padStart(2, '0')}:00)`);
        
        // Refresh breakout features (cache is disabled, so always fetches fresh data)
        // This single call updates both RSI Analysis & Breakout Status and 4H UTC+7 Breakout Trading Signals
        fetchBreakoutSignals(false);
      }
    };

    // Check every 500ms to catch the moment when we enter a new minute
    const intervalId = setInterval(checkAndUpdateBreakout, 500);

    // Cleanup on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - fetch functions are stable, refs persist across renders

  // DISABLED: Auto-refresh functionality (old version - kept for reference)
  // const lastTriggeredMinuteRef = useRef(-1);

  // // Auto-update at the start of every minute (xx:00:00)
  // useEffect(() => {
  //   const checkAndUpdate = () => {
  //     const now = new Date();
  //     const seconds = now.getSeconds();
  //     const currentMinute = now.getMinutes();
  //     
  //     // Check if we're at the start of a new minute (seconds is 0 or just became 0)
  //     // Also check if we haven't triggered for this minute yet
  //     if (seconds === 0 && currentMinute !== lastTriggeredMinuteRef.current) {
  //       lastTriggeredMinuteRef.current = currentMinute;
  //       const timestamp = now.toISOString();
  //       console.log(`[Auto-Update] Triggering updates at ${timestamp} (Minute: ${currentMinute})`);
  //       
  //       // Trigger all updates (they will update lastUpdateTime when complete)
  //       // Using forceRefresh=false to use incremental updates from cache
  //       fetchRSIData(false);
  //       fetchOversoldData(false);
  //       fetchBreakoutSignals(false);
  //       fetchBreakoutsWithoutReentryData(false);
  //     }
  //   };

  //   // Check every 500ms to catch the moment when seconds becomes 0 more reliably
  //   const intervalId = setInterval(checkAndUpdate, 500);

  //   // Cleanup on unmount
  //   return () => {
  //     if (intervalId) {
  //       clearInterval(intervalId);
  //     }
  //   };
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []); // Empty deps - fetch functions are stable, refs persist across renders

  // Handle notification toggle
  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) {
      // Enable notifications - request permission
      if (notificationPermission !== 'granted') {
        const permission = await requestNotificationPermission();
        setNotificationPermission(permission);
        
        if (permission === 'granted') {
          setNotificationsEnabled(true);
        } else {
          alert('Notification permission is required to receive breakout alerts. Please enable notifications in your browser settings.');
        }
      } else {
        setNotificationsEnabled(true);
      }
    } else {
      // Disable notifications
      setNotificationsEnabled(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '1200px' }}>
          <div>
        <h1>Crypto Signal Checker</h1>
        <p>Real-time Analysis Dashboard</p>
        </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {isNotificationSupported() && (
          <button 
                onClick={handleToggleNotifications}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: notificationsEnabled && notificationPermission === 'granted' 
                    ? 'rgba(107, 207, 127, 0.2)' 
                    : 'rgba(255, 255, 255, 0.1)',
                  border: `2px solid ${notificationsEnabled && notificationPermission === 'granted' ? '#6bcf7f' : 'rgba(255, 255, 255, 0.3)'}`,
                  borderRadius: '6px',
                  color: notificationsEnabled && notificationPermission === 'granted' ? '#6bcf7f' : '#fff',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
                title={notificationsEnabled && notificationPermission === 'granted' 
                  ? 'Notifications enabled - You will receive alerts for new breakouts' 
                  : notificationPermission === 'denied' 
                    ? 'Notifications blocked - Enable in browser settings'
                    : 'Click to enable notifications for breakout alerts'}
              >
                {notificationsEnabled && notificationPermission === 'granted' ? '🔔' : '🔕'}
                <span>{notificationsEnabled && notificationPermission === 'granted' ? 'Notifications ON' : 'Notifications OFF'}</span>
          </button>
            )}
        </div>
        </div>
        {/* <p style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>
          Auto-updates at xx:00:00 every minute
        </p> */}
      </header>

      <main className="App-main">
        {/* Merged RSI & Breakout Status Section */}
        <div className="rsi-main-section">
          <MergedRSIBreakoutTable
            rsiData={rsiData.data}
            rsiLoading={rsiData.loading}
            rsiError={rsiData.error}
            onRefreshRSI={fetchRSIData}
            breakoutData={breakoutsWithoutReentry.data}
            breakoutLoading={breakoutsWithoutReentry.loading}
            breakoutError={breakoutsWithoutReentry.error}
            onRefreshBreakout={fetchBreakoutsWithoutReentryData}
            breakoutSignalsData={breakoutSignals.data}
            selectedCryptos={oversoldSelectedCryptos}
            isExpanded={expandedSections.mergedRSIBreakout}
            onToggleExpanded={() => toggleSection('mergedRSIBreakout')}
            lastUpdateTime={rsiData.lastUpdateTime || breakoutsWithoutReentry.lastUpdateTime}
          />
        </div>

        {/* Breakout Trading Signals Section */}
        <div className="rsi-main-section">
          <BreakoutSignalsTable
            data={breakoutSignals.data}
            loading={breakoutSignals.loading}
            error={breakoutSignals.error}
            onRefresh={fetchBreakoutSignals}
            selectedCryptos={breakoutSignalsSelectedCryptos}
            onToggleCrypto={toggleBreakoutSignalsCrypto}
            isExpanded={expandedSections.breakoutSignals}
            onToggleExpanded={() => toggleSection('breakoutSignals')}
            lastUpdateTime={breakoutSignals.lastUpdateTime}
          />
        </div>

        {/* Oversold History Section */}
        <div className="rsi-main-section">
          <OversoldHistoryTable
            data={oversoldHistory.data}
            loading={oversoldHistory.loading}
            error={oversoldHistory.error}
            onRefresh={fetchOversoldData}
            selectedCryptos={oversoldSelectedCryptos}
            onToggleCrypto={toggleOversoldCrypto}
            isExpanded={expandedSections.oversold}
            onToggleExpanded={() => toggleSection('oversold')}
            lastUpdateTime={oversoldHistory.lastUpdateTime}
          />
        </div>
      </main>
    </div>
  );
}

export default App;


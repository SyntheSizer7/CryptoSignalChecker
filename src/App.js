import React, { useState, useEffect, useRef } from 'react';
import { fetchMultipleRSI, fetchOversoldHistory, fetchMultipleBreakoutSignals, fetchBreakoutsWithoutReentry, formatNYTime } from './binance';
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
// Order: BTC BNB ETH XRP SOL SUI DOGE ADA ASTER PEPE ENA
const DEFAULT_SYMBOLS = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'ENA/USDT'];

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

// Helper function to calculate distance from range for breakouts
const calculateDistanceFromRange = (breakout) => {
  if (!breakout.currentPrice) return null;
  if (breakout.isAbove) {
    const distance = ((breakout.currentPrice - breakout.rangeHigh) / breakout.rangeHigh) * 100;
    return distance;
  } else {
    const distance = ((breakout.rangeLow - breakout.currentPrice) / breakout.rangeLow) * 100;
    return distance;
  }
};

// Dashboard Component - Shows actionable items requiring attention
const Dashboard = ({ 
  rsiData, 
  breakoutsWithoutReentryData, 
  selectedCryptos, 
  isExpanded, 
  onToggleExpanded,
  onExpandRSI,
  onExpandBreakouts 
}) => {
  // Filter RSI data: only RSI < 35
  const filteredRSI = filterDataByCryptos(rsiData?.data || [], selectedCryptos).filter(item => {
    const currRSI = item.rsi ?? null;
    return currRSI !== null && currRSI < 35;
  });

  // Filter Breakouts Without Re-entry: only distance from range < 1%
  const filteredBreakouts = filterDataByCryptos(breakoutsWithoutReentryData || [], selectedCryptos).filter(breakout => {
    const distance = calculateDistanceFromRange(breakout);
    return distance !== null && Math.abs(distance) < 1;
  });

  const totalCount = filteredRSI.length + filteredBreakouts.length;

  if (!isExpanded) {
    return (
      <div className="dashboard-container" style={{ 
        marginBottom: '1.5rem',
        border: '2px solid #4dabf7',
        borderRadius: '8px',
        backgroundColor: 'rgba(77, 171, 247, 0.1)'
      }}>
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="▶ Dashboard - Requires Action"
          count={totalCount}
        />
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ 
      marginBottom: '1.5rem',
      border: '2px solid #4dabf7',
      borderRadius: '8px',
      backgroundColor: 'rgba(77, 171, 247, 0.1)',
      padding: '1rem'
    }}>
      <SectionToggle 
        isExpanded={isExpanded} 
        onToggle={onToggleExpanded} 
        title="▶ Dashboard - Requires Action"
        count={totalCount}
      />
      <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
        Auto-refreshes every 30 seconds | Shows RSI &lt; 35 and Breakouts with distance &lt; 1%
      </p>

      {/* Current RSI Analysis Section (RSI < 35) */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ 
          color: '#4dabf7', 
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ cursor: 'pointer' }} onClick={onExpandRSI}>▶</span>
          Current RSI Analysis (RSI &lt; 35) - {filteredRSI.length} items
        </h4>
        {filteredRSI.length === 0 ? (
          <p style={{ opacity: 0.7, paddingLeft: '1.5rem' }}>No RSI values below 35</p>
        ) : (
          <div className="rsi-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table className="rsi-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Current Time</th>
                  <th>RSI</th>
                  <th>Price</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {filteredRSI.map((item, index) => {
                  const symbol = item.symbol?.replace('/USDT', '') || 'N/A';
                  const currRSI = item.rsi ?? null;
                  const price = item.price ?? null;
                  const currSignal = currRSI !== null ? getRSISignal(currRSI) : null;
                  
                  return (
                    <tr key={index} className="rsi-row-oversold">
                      <td><strong>{symbol}</strong></td>
                      <td>{formatTimestamp(item.timestamp)}</td>
                      <td>
                        <span className="rsi-value" style={{ 
                          color: currSignal?.color || '#fff',
                          fontWeight: 'bold'
                        }}>
                          {currRSI !== null ? currRSI.toFixed(2) : 'N/A'}
                        </span>
                      </td>
                      <td>${price !== null ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</td>
                      <td>
                        {currSignal && (
                          <span className="signal-badge" style={{ 
                            backgroundColor: currSignal.bgColor,
                            color: currSignal.color,
                            borderColor: currSignal.color
                          }}>
                            {currSignal.text}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Breakouts Without Re-entry Section (Distance < 1%) */}
      <div>
        <h4 style={{ 
          color: '#4dabf7', 
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ cursor: 'pointer' }} onClick={onExpandBreakouts}>▶</span>
          Breakouts Without Re-entry (Distance &lt; 1%) - {filteredBreakouts.length} items
        </h4>
        {filteredBreakouts.length === 0 ? (
          <p style={{ opacity: 0.7, paddingLeft: '1.5rem' }}>No breakouts with distance from range less than 1%</p>
        ) : (
          <div className="breakout-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
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
                {filteredBreakouts.map((breakout, index) => {
                  const directionBadge = breakout.isAbove 
                    ? { text: 'ABOVE', color: '#ff6b6b', bgColor: 'rgba(255, 107, 107, 0.2)' }
                    : { text: 'BELOW', color: '#6bcf7f', bgColor: 'rgba(107, 207, 127, 0.2)' };
                  
                  const distance = calculateDistanceFromRange(breakout);
                  const distancePercent = distance !== null ? (distance > 0 ? `+${distance.toFixed(2)}%` : `${distance.toFixed(2)}%`) : 'N/A';
                  
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
        )}
      </div>
    </div>
  );
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

// RSI Table Component
const RSITable = ({ data, loading, error, onRefresh, selectedCryptos, isExpanded, onToggleExpanded, lastUpdateTime }) => {
  // Filter data by selected cryptocurrencies
  const filteredData = filterDataByCryptos(data, selectedCryptos);
  const dataCount = filteredData ? filteredData.length : 0;

  if (!isExpanded) {
    return (
      <div className="rsi-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Current RSI Analysis"
          count={loading ? null : dataCount}
          lastUpdateTime={lastUpdateTime}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rsi-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Current RSI Analysis"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="loading-mini">
        <div className="spinner-mini"></div>
        <span>Fetching RSI data...</span>
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
          title="Current RSI Analysis"
          count={null}
          lastUpdateTime={lastUpdateTime}
        />
      <div className="error-mini">
        <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  // Ensure data is an array
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="rsi-table-container">
        <SectionToggle 
          isExpanded={isExpanded} 
          onToggle={onToggleExpanded} 
          title="Current RSI Analysis"
          count={0}
          lastUpdateTime={lastUpdateTime}
        />
        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No data available. Click "Refresh" to fetch RSI data.
        </p>
      </div>
    );
  }

  return (
    <div className="rsi-table-container">
      <SectionToggle 
        isExpanded={isExpanded} 
        onToggle={onToggleExpanded} 
        title="Current RSI Analysis"
        count={dataCount}
        lastUpdateTime={lastUpdateTime}
      />
      <div className="rsi-table-header">
        <div>
          <p className="rsi-subtitle">1 Hour Timeframe | RSI Period: 14 | Type: Wilder's Smoothing | Timezone: UTC+7</p>
        </div>
        <button onClick={onRefresh} className="refresh-btn-small" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="rsi-table-wrapper">
        <table className="rsi-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Previous Time</th>
              <th>Current Time</th>
              <th>Prev RSI</th>
              <th>Prev MA</th>
              <th>Curr RSI</th>
              <th>Curr MA</th>
              <th>Price</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => {
              const symbol = item.symbol?.replace('/USDT', '') || 'N/A';
              const prevRSI = item.previous_rsi ?? null;
              const currRSI = item.rsi ?? null;
              const prevMA = item.previous_rsi_ma ?? null;
              const currMA = item.rsi_ma ?? null;
              const price = item.price ?? null;
              
              const prevSignal = prevRSI !== null ? getRSISignal(prevRSI) : null;
              const currSignal = currRSI !== null ? getRSISignal(currRSI) : null;
              
              const isOversold = (prevRSI !== null && prevRSI < 35) || (currRSI !== null && currRSI < 35);
              
              return (
                <tr key={index} className={isOversold ? 'rsi-row-oversold' : ''}>
                  <td>
                    {isOversold && <span className="warning-icon">⚠️</span>}
                    <strong>{symbol}</strong>
                  </td>
                  <td>{formatTimestamp(item.previous_timestamp)}</td>
                  <td>{formatTimestamp(item.timestamp)}</td>
                  <td>{prevRSI !== null ? prevRSI.toFixed(2) : 'N/A'}</td>
                  <td>{prevMA !== null ? prevMA.toFixed(2) : 'N/A'}</td>
                  <td>
                    <span className="rsi-value" style={{ 
                      color: currSignal?.color || '#fff',
                      fontWeight: 'bold'
                    }}>
                      {currRSI !== null ? currRSI.toFixed(2) : 'N/A'}
                    </span>
                  </td>
                  <td>{currMA !== null ? currMA.toFixed(2) : 'N/A'}</td>
                  <td>${price !== null ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</td>
                  <td>
                    {currSignal && (
                      <span className="signal-badge" style={{ 
                        backgroundColor: currSignal.bgColor,
                        color: currSignal.color,
                        borderColor: currSignal.color
                      }}>
                        {currSignal.text}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="rsi-table-footer">
        <p>Total cryptocurrencies analyzed: <strong>{filteredData.length}</strong> {filteredData.length !== data.length && `(filtered from ${data.length})`}</p>
      </div>
    </div>
  );
};

// Oversold History Table Component
const OversoldHistoryTable = ({ data, loading, error, onRefresh, selectedCryptos, isExpanded, onToggleExpanded, lastUpdateTime }) => {
  // Filter data by selected cryptocurrencies
  const filteredData = filterDataByCryptos(data, selectedCryptos);
  const dataCount = filteredData ? filteredData.length : 0;

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
          <strong>[DATA]</strong> Found <strong>{filteredData.length}</strong> RSI ≤ 30 events in the last 3 days {filteredData.length !== data.length && `(filtered from ${data.length})`}:
        </p>
      </div>
      
      {/* Summary: Count per cryptocurrency and unique time periods */}
      {(() => {
        // Count per cryptocurrency
        const summary = filteredData.reduce((acc, item) => {
          const symbol = item.symbol.replace('/USDT', '');
          acc[symbol] = (acc[symbol] || 0) + 1;
          return acc;
        }, {});
        
        const summaryEntries = Object.entries(summary).sort((a, b) => b[1] - a[1]); // Sort by count descending
        
        // Count unique time periods with consecutive grouping logic
        // Consecutive hours (within same day) count as 1, non-consecutive count separately
        const timePeriodMap = new Map(); // date -> Set of hours
        const dayTimePeriodMap = new Map(); // date -> Set of hours (only 06:00-22:00)
        
        filteredData.forEach(item => {
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
              {summaryEntries.map(([symbol, count]) => (
                <div key={symbol} className="oversold-summary-item">
                  <span className="summary-symbol"><strong>{symbol}</strong></span>
                  <span className="summary-count">{count} {count === 1 ? 'time' : 'times'}</span>
                </div>
              ))}
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
        <p>Total events: <strong>{filteredData.length}</strong> {filteredData.length !== data.length && `(filtered from ${data.length})`}</p>
      </div>
    </div>
  );
};

// Breakouts Without Re-entry Table Component
const BreakoutsWithoutReentryTable = ({ data, loading, error, onRefresh, selectedCryptos, isExpanded, onToggleExpanded, lastUpdateTime }) => {
  // Filter data by selected cryptocurrencies
  const filteredData = filterDataByCryptos(data, selectedCryptos);
  const dataCount = filteredData ? filteredData.length : 0;

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
          <strong>[DATA]</strong> Found <strong>{filteredData.length}</strong> breakouts without re-entry {filteredData.length !== data.length && `(filtered from ${data.length})`}:
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
        <p>Total breakouts without re-entry: <strong>{filteredData.length}</strong> {filteredData.length !== data.length && `(filtered from ${data.length})`}</p>
      </div>
    </div>
  );
};

// Breakout Trading Signals Table Component
const BreakoutSignalsTable = ({ data, loading, error, onRefresh, selectedCryptos, isExpanded, onToggleExpanded, lastUpdateTime }) => {
  // Filter data by selected cryptocurrencies
  const filteredDataRaw = filterDataByCryptos(data, selectedCryptos);
  
  // Ensure dates are normalized and sort by reentryTime (most recent first - descending order)
  const filteredData = normalizeDates(filteredDataRaw || []).sort((a, b) => {
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
          <strong>[DATA]</strong> Found <strong>{filteredData.length}</strong> trading signals {filteredData.length !== data.length && `(filtered from ${data.length})`}:
        </p>
      </div>
      
      {/* Summary by Cryptocurrency */}
      {(() => {
        // Group signals by symbol
        const summaryBySymbol = filteredData.reduce((acc, signal) => {
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
          .sort((a, b) => b.total - a.total); // Sort by total signals descending
        
        if (summaryEntries.length === 0) return null;
        
        return (
          <div className="oversold-summary" style={{ marginBottom: '1.5rem' }}>
            <div className="summary-header">
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600' }}>Summary by Cryptocurrency:</h4>
            </div>
            <div className="oversold-summary-grid">
              {summaryEntries.map((summary) => {
                const completed = summary.wins + summary.losses;
                const winRate = completed > 0 ? ((summary.wins / completed) * 100).toFixed(2) : '0.00';
                const winLossRatio = summary.losses > 0 ? (summary.wins / summary.losses).toFixed(2) : (summary.wins > 0 ? '∞' : '0.00');
                
                return (
                  <div key={summary.symbol} className="oversold-summary-item" style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '0.25rem',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)'
                  }}>
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
                    {completed > 0 && (
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
              <th>Time Exit</th>
              <th>Time Reentry</th>
              <th>Long/Short @ Price</th>
              <th>TP/SL (1:2)</th>
              <th>Gain %</th>
              <th>Win/Loss</th>
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
                    </div>
                  </td>
                  <td>{formatNYTime(signal.breakoutTime)}</td>
                  <td>{formatNYTime(signal.reentryTime)}</td>
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
                    {isWin && (
                      <span className="result-badge win-badge">WIN</span>
                    )}
                    {isLoss && (
                      <span className="result-badge loss-badge">LOSS</span>
                    )}
                    {isPending && (
                      <span className="result-badge pending-badge">PENDING</span>
                    )}
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
              <p>Total signals: <strong>{filteredData.length}</strong> {filteredData.length !== data.length && `(filtered from ${data.length})`}</p>
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
  
  // Cryptocurrency filter state (stored in localStorage)
  const [selectedCryptos, setSelectedCryptos] = useState(() => {
    try {
      const saved = localStorage.getItem('crypto_filter_selection');
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Set(parsed);
      }
    } catch (e) {
      console.warn('Failed to load crypto filter from localStorage:', e);
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
      dashboard: true,
      rsi: true,
      oversold: true,
      breakoutSignals: true,
      breakoutsWithoutReentry: true
    };
  });

  // Save filter selection to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('crypto_filter_selection', JSON.stringify(Array.from(selectedCryptos)));
    } catch (e) {
      console.warn('Failed to save crypto filter to localStorage:', e);
    }
  }, [selectedCryptos]);

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

  // Expand RSI section from dashboard
  const expandRSISection = () => {
    setExpandedSections(prev => ({
      ...prev,
      rsi: true,
      dashboard: false // Optionally collapse dashboard when expanding a section
    }));
    // Scroll to RSI section (second .rsi-main-section after dashboard)
    setTimeout(() => {
      const sections = document.querySelectorAll('.rsi-main-section');
      if (sections.length > 1) {
        sections[1].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Expand Breakouts Without Re-entry section from dashboard
  const expandBreakoutsSection = () => {
    setExpandedSections(prev => ({
      ...prev,
      breakoutsWithoutReentry: true,
      dashboard: false // Optionally collapse dashboard when expanding a section
    }));
    // Scroll to Breakouts section (last .rsi-main-section)
    setTimeout(() => {
      const sections = document.querySelectorAll('.rsi-main-section');
      if (sections.length > 4) {
        sections[4].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Filter handlers
  const toggleCrypto = (crypto) => {
    setSelectedCryptos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(crypto)) {
        newSet.delete(crypto);
      } else {
        newSet.add(crypto);
      }
      return newSet;
    });
  };

  const selectAllCryptos = () => {
    setSelectedCryptos(new Set(DEFAULT_SYMBOLS.map(s => s.replace('/USDT', ''))));
  };

  const deselectAllCryptos = () => {
    setSelectedCryptos(new Set());
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

  // Fetch breakout trading signals
  const fetchBreakoutSignals = async (forceRefresh = false) => {
    // Only show loading if we don't have data yet
    setBreakoutSignals(prev => {
      const hasData = prev.data && Array.isArray(prev.data) && prev.data.length > 0;
      return { ...prev, loading: !hasData, error: null };
    });

    try {
      // Check multiple cryptocurrencies for the last 3 days (11:00-15:00 UTC+7 range each day)
      // This will check breakouts/re-entries from each day's 11:00 UTC+7 to next day 15:00 UTC+7
      const results = await fetchMultipleBreakoutSignals(DEFAULT_SYMBOLS, 3, forceRefresh);
      const updateTime = new Date();
      console.log(`[BreakoutSignals] Data updated at ${updateTime.toISOString()}`);
      // Use all results (all 3 days of signals for all symbols)
      setBreakoutSignals({ data: results, loading: false, error: null, lastUpdateTime: updateTime });
    } catch (err) {
      setBreakoutSignals(prev => ({ 
        data: prev.data || null, // Keep existing data on error
        loading: false, 
        error: err.message || 'Failed to fetch breakout signals from Binance',
        lastUpdateTime: prev?.lastUpdateTime || null
      }));
    }
  };

  // Fetch breakouts without re-entry
  const fetchBreakoutsWithoutReentryData = async (forceRefresh = false) => {
    // Only show loading if we don't have data yet
    setBreakoutsWithoutReentry(prev => {
      const hasData = prev.data && Array.isArray(prev.data) && prev.data.length > 0;
      return { ...prev, loading: !hasData, error: null };
    });

    try {
      const results = await fetchBreakoutsWithoutReentry(DEFAULT_SYMBOLS, 3, forceRefresh);
      const updateTime = new Date();
      console.log(`[BreakoutsWithoutReentry] Data updated at ${updateTime.toISOString()}`);
      setBreakoutsWithoutReentry({ data: results, loading: false, error: null, lastUpdateTime: updateTime });
    } catch (err) {
      setBreakoutsWithoutReentry(prev => ({ 
        data: prev.data || null, // Keep existing data on error
        loading: false, 
        error: err.message || 'Failed to fetch breakouts without re-entry from Binance',
        lastUpdateTime: prev?.lastUpdateTime || null
      }));
    }
  };

  // Auto-fetch all data on component mount
  useEffect(() => {
    // Fetch all data automatically when page loads
    fetchRSIData();
    fetchOversoldData();
    fetchBreakoutSignals();
    fetchBreakoutsWithoutReentryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref to track last triggered minute to avoid duplicate triggers
  const lastTriggeredMinuteRef = useRef(-1);
  // Ref to track last dashboard update to avoid duplicate triggers
  const lastDashboardUpdateRef = useRef(0);

  // Auto-update at the start of every minute (xx:00:00)
  useEffect(() => {
    const checkAndUpdate = () => {
      const now = new Date();
      const seconds = now.getSeconds();
      const currentMinute = now.getMinutes();
      
      // Check if we're at the start of a new minute (seconds is 0 or just became 0)
      // Also check if we haven't triggered for this minute yet
      if (seconds === 0 && currentMinute !== lastTriggeredMinuteRef.current) {
        lastTriggeredMinuteRef.current = currentMinute;
        const timestamp = now.toISOString();
        console.log(`[Auto-Update] Triggering updates at ${timestamp} (Minute: ${currentMinute})`);
        
        // Trigger all updates (they will update lastUpdateTime when complete)
        // Using forceRefresh=false to use incremental updates from cache
        fetchRSIData(false);
        fetchOversoldData(false);
        fetchBreakoutSignals(false);
        fetchBreakoutsWithoutReentryData(false);
      }
    };

    // Check every 500ms to catch the moment when seconds becomes 0 more reliably
    const intervalId = setInterval(checkAndUpdate, 500);

    // Cleanup on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - fetch functions are stable, refs persist across renders

  // Dashboard-specific auto-update: Refresh RSI and Breakouts Without Re-entry more frequently (every 30 seconds)
  // This ensures the Dashboard shows the latest actionable items more often
  useEffect(() => {
    const dashboardUpdateInterval = setInterval(() => {
      const now = Date.now();
      // Update every 30 seconds (but not more than once every 30 seconds)
      if (now - lastDashboardUpdateRef.current >= 30000) {
        lastDashboardUpdateRef.current = now;
        console.log(`[Dashboard] Auto-updating RSI and Breakouts Without Re-entry at ${new Date().toISOString()}`);
        
        // Refresh only the data that Dashboard needs
        fetchRSIData(false);
        fetchBreakoutsWithoutReentryData(false);
      }
    }, 30000); // Check every 30 seconds

    // Cleanup on unmount
    return () => {
      if (dashboardUpdateInterval) {
        clearInterval(dashboardUpdateInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - fetch functions are stable, refs persist across renders

  return (
    <div className="App">
      <header className="App-header">
        <h1>Crypto Signal Checker</h1>
        <p>Real-time Analysis Dashboard</p>
        <p style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>
          Auto-updates at xx:00:00 every minute
        </p>
      </header>

      <main className="App-main">
        {/* Cryptocurrency Filter */}
        <div className="controls-section" style={{ marginBottom: '1.5rem' }}>
          <CryptoFilter
            selectedCryptos={selectedCryptos}
            onToggleCrypto={toggleCrypto}
            onSelectAll={selectAllCryptos}
            onDeselectAll={deselectAllCryptos}
          />
        </div>

        {/* Dashboard Section - Shows actionable items */}
        <div className="rsi-main-section">
          <Dashboard
            rsiData={rsiData}
            breakoutsWithoutReentryData={breakoutsWithoutReentry.data}
            selectedCryptos={selectedCryptos}
            isExpanded={expandedSections.dashboard}
            onToggleExpanded={() => toggleSection('dashboard')}
            onExpandRSI={expandRSISection}
            onExpandBreakouts={expandBreakoutsSection}
          />
        </div>

        <div className="controls-section">
          <button 
            onClick={() => fetchRSIData(true)}
            className="fetch-all-button"
            disabled={rsiData.loading}
          >
            {rsiData.loading ? 'Fetching...' : 'Refresh RSI Data'}
          </button>
          <p className="data-source-info">
            Fetching RSI data directly from Binance API | All times displayed in UTC+7 (Bangkok/Indochina Time)
          </p>
        </div>

        {/* RSI Table Section */}
        <div className="rsi-main-section">
          <RSITable
            data={rsiData.data}
            loading={rsiData.loading}
            error={rsiData.error}
            onRefresh={fetchRSIData}
            selectedCryptos={selectedCryptos}
            isExpanded={expandedSections.rsi}
            onToggleExpanded={() => toggleSection('rsi')}
            lastUpdateTime={rsiData.lastUpdateTime}
          />
        </div>

        {/* Oversold History Section */}
        <div className="rsi-main-section">
          <OversoldHistoryTable
            data={oversoldHistory.data}
            loading={oversoldHistory.loading}
            error={oversoldHistory.error}
            onRefresh={fetchOversoldData}
            selectedCryptos={selectedCryptos}
            isExpanded={expandedSections.oversold}
            onToggleExpanded={() => toggleSection('oversold')}
            lastUpdateTime={oversoldHistory.lastUpdateTime}
          />
        </div>

        {/* Breakout Trading Signals Section */}
        <div className="rsi-main-section">
          <BreakoutSignalsTable
            data={breakoutSignals.data}
            loading={breakoutSignals.loading}
            error={breakoutSignals.error}
            onRefresh={fetchBreakoutSignals}
            selectedCryptos={selectedCryptos}
            isExpanded={expandedSections.breakoutSignals}
            onToggleExpanded={() => toggleSection('breakoutSignals')}
            lastUpdateTime={breakoutSignals.lastUpdateTime}
          />
        </div>

        {/* Breakouts Without Re-entry Section */}
        <div className="rsi-main-section">
          <BreakoutsWithoutReentryTable
            data={breakoutsWithoutReentry.data}
            loading={breakoutsWithoutReentry.loading}
            error={breakoutsWithoutReentry.error}
            onRefresh={fetchBreakoutsWithoutReentryData}
            selectedCryptos={selectedCryptos}
            isExpanded={expandedSections.breakoutsWithoutReentry}
            onToggleExpanded={() => toggleSection('breakoutsWithoutReentry')}
            lastUpdateTime={breakoutsWithoutReentry.lastUpdateTime}
          />
        </div>
      </main>
    </div>
  );
}

export default App;


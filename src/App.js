import React, { useState, useEffect } from 'react';
import { fetchMultipleRSI, fetchOversoldHistory } from './binance';
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

// RSI Table Component
const RSITable = ({ data, loading, error, onRefresh }) => {
  if (loading) {
    return (
      <div className="loading-mini">
        <div className="spinner-mini"></div>
        <span>Fetching RSI data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-mini">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  // Ensure data is an array
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="rsi-table-container">
        <div className="rsi-table-header">
          <h3>Current RSI Analysis</h3>
          <button onClick={onRefresh} className="refresh-btn-small">Refresh</button>
        </div>
        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No data available. Click "Refresh" to fetch RSI data.
        </p>
      </div>
    );
  }

  return (
    <div className="rsi-table-container">
      <div className="rsi-table-header">
        <div>
          <h3>Current RSI Analysis</h3>
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
            {data.map((item, index) => {
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
        <p>Total cryptocurrencies analyzed: <strong>{data.length}</strong></p>
      </div>
    </div>
  );
};

// Oversold History Table Component
const OversoldHistoryTable = ({ data, loading, error, onRefresh }) => {
  if (loading) {
    return (
      <div className="loading-mini">
        <div className="spinner-mini"></div>
        <span>Fetching oversold history (this may take a while)...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-mini">
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="oversold-table-container">
        <div className="oversold-table-header">
          <h3>Oversold History (RSI ≤ 30)</h3>
          <button onClick={onRefresh} className="refresh-btn-small">Refresh</button>
        </div>
        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
          No oversold events found in the last 7 days. Click "Refresh" to fetch data.
        </p>
      </div>
    );
  }

  return (
    <div className="oversold-table-container">
      <div className="oversold-table-header">
        <div>
          <h3>Oversold History (RSI ≤ 30)</h3>
                <p className="oversold-subtitle">Last 7 days | 1 Hour Timeframe | Timezone: UTC+7</p>
        </div>
        <button onClick={onRefresh} className="refresh-btn-small" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="oversold-info">
        <p className="oversold-count">
          <strong>[DATA]</strong> Found <strong>{data.length}</strong> RSI ≤ 30 events in the last 7 days:
        </p>
      </div>
      
      {/* Summary: Count per cryptocurrency and unique time periods */}
      {(() => {
        // Count per cryptocurrency
        const summary = data.reduce((acc, item) => {
          const symbol = item.symbol.replace('/USDT', '');
          acc[symbol] = (acc[symbol] || 0) + 1;
          return acc;
        }, {});
        
        const summaryEntries = Object.entries(summary).sort((a, b) => b[1] - a[1]); // Sort by count descending
        
        // Count unique time periods with consecutive grouping logic
        // Consecutive hours (within same day) count as 1, non-consecutive count separately
        const timePeriodMap = new Map(); // date -> Set of hours
        const dayTimePeriodMap = new Map(); // date -> Set of hours (only 06:00-22:00)
        
        data.forEach(item => {
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
            {data.map((item, index) => {
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
        <p>Total events: <strong>{data.length}</strong></p>
      </div>
    </div>
  );
};

function App() {
  const [rsiData, setRsiData] = useState({ data: null, loading: false, error: null });
  const [oversoldHistory, setOversoldHistory] = useState({ data: null, loading: false, error: null });

  // Fetch RSI directly from Binance API
  const fetchRSIData = async () => {
    setRsiData(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Default symbols from your Python script
      const symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'HYPE/USDT', 'TAO/USDT', 'PUMP/USDT', 'ENA/USDT'];
      const results = await fetchMultipleRSI(symbols, 14, 14);
      
      setRsiData({ data: results, loading: false, error: null });
    } catch (err) {
      setRsiData({ 
        data: null, 
        loading: false, 
        error: err.message || 'Failed to fetch RSI from Binance' 
      });
    }
  };

  // Fetch oversold history (RSI <= 30) for last 7 days
  const fetchOversoldData = async () => {
    setOversoldHistory(prev => ({ ...prev, loading: true, error: null }));

    try {
      const symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'HYPE/USDT', 'TAO/USDT', 'PUMP/USDT', 'ENA/USDT'];
      const results = await fetchOversoldHistory(symbols, 7, 30);
      
      setOversoldHistory({ data: results, loading: false, error: null });
    } catch (err) {
      setOversoldHistory({ 
        data: null, 
        loading: false, 
        error: err.message || 'Failed to fetch oversold history from Binance' 
      });
    }
  };

  // Auto-fetch RSI data on component mount
  useEffect(() => {
    fetchRSIData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Crypto Signal Checker</h1>
        <p>Real-time Analysis Dashboard</p>
      </header>

      <main className="App-main">
        <div className="controls-section">
          <button 
            onClick={fetchRSIData}
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
          />
        </div>

        {/* Oversold History Section */}
        <div className="rsi-main-section">
          <OversoldHistoryTable
            data={oversoldHistory.data}
            loading={oversoldHistory.loading}
            error={oversoldHistory.error}
            onRefresh={fetchOversoldData}
          />
        </div>
      </main>
    </div>
  );
}

export default App;


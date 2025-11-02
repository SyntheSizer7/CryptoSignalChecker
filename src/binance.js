// Binance API Integration
const BINANCE_BASE_URL = 'https://api.binance.com';

// Timezone helpers (UTC+7 - Bangkok/Indochina Time)
const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000; // 7 hours in milliseconds

// Cache Configuration
const CACHE_PREFIX = 'crypto_signal_cache_';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour default expiry

// Helper to get the latest candle timestamp that should be available
// For 1h candles: returns timestamp of the most recent closed hour (e.g., if now is 14:30, returns 14:00)
// For 5m candles: returns timestamp of the most recent closed 5-minute period
const getLatestExpectedCandleTime = (interval = '1h') => {
  const now = new Date();
  const intervalMs = interval === '1h' ? 60 * 60 * 1000 : 5 * 60 * 1000; // 1 hour or 5 minutes
  const latestClosedCandleTime = Math.floor(now.getTime() / intervalMs) * intervalMs;
  return new Date(latestClosedCandleTime);
};

// Helper to check if a new candle should be available since last cache
const hasNewCandleAvailable = (lastCandleTime, interval = '1h') => {
  const latestExpected = getLatestExpectedCandleTime(interval);
  // Check if expected latest candle is newer than what we have
  return latestExpected.getTime() > (lastCandleTime ? new Date(lastCandleTime).getTime() : 0);
};

// Rate Limiting Configuration
// Binance limits: 1,200 weight per minute per IP
// We'll be conservative and limit to ~1000 requests/minute to stay safe
const RATE_LIMIT_DELAY_MS = 250; // Base delay between requests (250ms = ~240 requests/min)
const RATE_LIMIT_SAFETY_MARGIN = 0.8; // Use only 80% of limit to be safe

/**
 * Cache utility functions
 */
const CacheUtils = {
  /**
   * Get cached data for a key
   * @param {string} key - Cache key
   * @returns {Object|null} Cached data with timestamp, or null if not found/expired
   */
  get: (key) => {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;
      
      const { data, timestamp, expiry } = JSON.parse(cached);
      const now = Date.now();
      
      // Check if cache is expired
      if (expiry && now > timestamp + expiry) {
        CacheUtils.remove(key);
        return null;
      }
      
      return { data, timestamp };
    } catch (error) {
      console.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  },
  
  /**
   * Set cached data for a key
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @param {number} expiry - Expiry time in milliseconds (optional)
   */
  set: (key, data, expiry = CACHE_EXPIRY_MS) => {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expiry
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheEntry));
    } catch (error) {
      console.warn(`Cache set error for key ${key}:`, error);
      // If quota exceeded, try to clear old cache
      if (error.name === 'QuotaExceededError') {
        CacheUtils.clearOld();
      }
    }
  },
  
  /**
   * Remove cached data for a key
   * @param {string} key - Cache key
   */
  remove: (key) => {
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      console.warn(`Cache remove error for key ${key}:`, error);
    }
  },
  
  /**
   * Clear all cache entries
   */
  clear: () => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  },
  
  /**
   * Clear old cache entries (older than 24 hours)
   */
  clearOld: () => {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          try {
            const cached = localStorage.getItem(key);
            if (cached) {
              const { timestamp } = JSON.parse(cached);
              if (now - timestamp > maxAge) {
                localStorage.removeItem(key);
              }
            }
          } catch (e) {
            // Invalid cache entry, remove it
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      console.warn('Cache clearOld error:', error);
    }
  }
};

/**
 * Convert UTC+7 time to UTC time (for Binance API queries)
 * @param {Date|number} utcPlus7Time - Date object or timestamp in UTC+7
 * @returns {number} Timestamp in UTC (milliseconds)
 */
export const utcPlus7ToUTC = (utcPlus7Time) => {
  const timestamp = typeof utcPlus7Time === 'number' ? utcPlus7Time : utcPlus7Time.getTime();
  return timestamp - UTC_PLUS_7_OFFSET_MS;
};

/**
 * Convert UTC time to UTC+7 time (for display)
 * @param {Date|number} utcTime - Date object or timestamp in UTC
 * @returns {number} Timestamp in UTC+7 (milliseconds)
 */
export const utcToUTCPlus7 = (utcTime) => {
  const timestamp = typeof utcTime === 'number' ? utcTime : utcTime.getTime();
  return timestamp + UTC_PLUS_7_OFFSET_MS;
};

/**
 * Get current time in UTC+7 as Date object
 * @returns {Date} Current time in UTC+7
 */
export const getCurrentUTCPlus7 = () => {
  const now = new Date();
  return new Date(now.getTime() + UTC_PLUS_7_OFFSET_MS);
};

/**
 * Fetch klines (candlestick data) from Binance
 * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
 * @param {string} interval - Time interval (1h, 4h, 1d, etc.)
 * @param {number} limit - Number of klines to fetch
 * @param {number} endTime - Optional end time in milliseconds
 * @returns {Promise<Array>} Array of kline data
 */
export const getBinanceKlines = async (symbol, interval = '1h', limit = 168, endTime = null) => {
  try {
    const url = `${BINANCE_BASE_URL}/api/v3/klines`;
    const params = new URLSearchParams({
      symbol: symbol.replace('/', ''), // Convert BTC/USDT to BTCUSDT
      interval,
      limit: limit.toString(),
    });

    // Don't specify endTime - let Binance return the most recent candles
    // If endTime is provided, use it (for historical queries)
    if (endTime) {
      params.append('endTime', endTime.toString());
    }

    const response = await fetch(`${url}?${params.toString()}`);
    
    if (!response.ok) {
      // Handle rate limit errors
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 60 seconds
        console.warn(`[Rate Limit] Binance API rate limit exceeded. Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Retry once after waiting
        return getBinanceKlines(symbol, interval, limit, endTime);
      } else if (response.status === 418) {
        throw new Error(`Binance API: IP banned (418). Please wait before retrying.`);
      }
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Binance returns: [newest candle, ..., oldest candle] (reverse chronological)
    // First candle [0] is the most recent
    // Last candle [limit-1] is the oldest
    
    if (data && data.length > 0) {
      // Log for debugging: show most recent candle's timestamp
      const mostRecentCandle = data[0];
      const mostRecentCloseTime = new Date(mostRecentCandle[6]); // kline[6] is closeTime
      console.log(`[${symbol}] Most recent candle closeTime: ${mostRecentCloseTime.toISOString()}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching Binance klines:', error);
    throw error;
  }
};

/**
 * Get current price for a symbol
 * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
 * @returns {Promise<Object>} Price data
 */
export const getBinancePrice = async (symbol) => {
  try {
    const symbolFormatted = symbol.replace('/', '');
    const url = `${BINANCE_BASE_URL}/api/v3/ticker/price?symbol=${symbolFormatted}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      // Handle rate limit errors
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default 60 seconds
        console.warn(`[Rate Limit] Binance API rate limit exceeded. Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Retry once after waiting
        return getBinancePrice(symbol);
      } else if (response.status === 418) {
        throw new Error(`Binance API: IP banned (418). Please wait before retrying.`);
      }
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Binance price:', error);
    throw error;
  }
};

/**
 * Get 24hr ticker price change statistics
 * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
 * @returns {Promise<Object>} 24hr ticker stats
 */
export const getBinance24hrTicker = async (symbol) => {
  try {
    const symbolFormatted = symbol.replace('/', '');
    const url = `${BINANCE_BASE_URL}/api/v3/ticker/24hr?symbol=${symbolFormatted}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Binance 24hr ticker:', error);
    throw error;
  }
};

/**
 * Get all symbols for a quote asset (e.g., all USDT pairs)
 * @param {string} quoteAsset - Quote asset (default: 'USDT')
 * @returns {Promise<Array>} Array of trading pairs
 */
export const getBinanceExchangeInfo = async (quoteAsset = 'USDT') => {
  try {
    const url = `${BINANCE_BASE_URL}/api/v3/exchangeInfo`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // Filter by quote asset if specified
    if (quoteAsset) {
      return data.symbols.filter(s => s.quoteAsset === quoteAsset && s.status === 'TRADING');
    }
    return data.symbols;
  } catch (error) {
    console.error('Error fetching Binance exchange info:', error);
    throw error;
  }
};

/**
 * Format klines data to a more usable format
 * @param {Array} klines - Raw klines data from Binance
 * @returns {Array} Formatted klines
 */
export const formatKlinesData = (klines) => {
  return klines.map(kline => ({
    timestamp: new Date(kline[0]), // Opening time of the candle
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
    closeTime: new Date(kline[6]), // Closing time of the candle
    quoteVolume: parseFloat(kline[7]),
    trades: parseInt(kline[8]),
    takerBuyBaseVolume: parseFloat(kline[9]),
    takerBuyQuoteVolume: parseFloat(kline[10])
  }));
};

/**
 * Calculate RSI using Wilder's smoothing method (TradingView standard)
 * This matches TradingView's RSI(14) calculation exactly
 * @param {Array<number>} prices - Array of closing prices
 * @param {number} period - RSI period (default: 14)
 * @returns {Array<number>} Array of RSI values (index matches price index)
 */
export const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) {
    throw new Error(`Need at least ${period + 1} prices to calculate RSI`);
  }

  // Initialize RSI array with nulls (same length as prices)
  const rsiValues = new Array(prices.length).fill(null);

  // Calculate price changes
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // Separate gains and losses
  const gains = changes.map(change => change > 0 ? change : 0);
  const losses = changes.map(change => change < 0 ? -change : 0);

  // Calculate initial average gain and loss (using SMA for first period)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Calculate RSI for the first valid period
  let rs = avgLoss !== 0 ? avgGain / avgLoss : 0;
  rsiValues[period] = 100 - (100 / (1 + rs));

  // Apply Wilder's smoothing (RMA) for subsequent values
  // Formula: RMA = (Previous RMA * (period - 1) + Current Value) / period
  for (let i = period + 1; i < prices.length; i++) {
    const changeIndex = i - 1; // changes array is one index behind prices array
    
    // Update average gain and loss using Wilder's smoothing
    avgGain = (avgGain * (period - 1) + gains[changeIndex]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[changeIndex]) / period;

    // Calculate RS and RSI
    rs = avgLoss !== 0 ? avgGain / avgLoss : 0;
    rsiValues[i] = 100 - (100 / (1 + rs));
  }

  return rsiValues;
};

/**
 * Fetch RSI data directly from Binance (same logic as Python script)
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @param {number} period - RSI period (default: 14)
 * @param {number} maPeriod - Moving average period (default: 14)
 * @returns {Promise<Object>} RSI data similar to Python script output
 */
export const fetchRSIFromBinance = async (symbol, period = 14, maPeriod = 14) => {
  try {
    // Fetch klines data - Binance returns most recent candles first (reverse chronological)
    // Request latest 168 candles (7 days) to ensure we have enough for RSI calculation
    const klines = await getBinanceKlines(symbol, '1h', 168);
    
    if (!klines || klines.length === 0) {
      throw new Error(`No klines data returned for ${symbol}`);
    }
    
    // Binance returns: [newest, ..., oldest] (reverse chronological)
    // Format first, then sort by closeTime to ensure chronological order
    // This is more reliable than just reversing
    const formattedData = formatKlinesData(klines);
    
    // Sort by closeTime to ensure chronological order (oldest to newest)
    // This guarantees correct RSI calculation order
    formattedData.sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());

    // Extract closing prices
    const prices = formattedData.map(d => d.close);

    // Calculate RSI
    const rsiValues = calculateRSI(prices, period);
    const latestRSI = rsiValues[rsiValues.length - 1];
    const previousRSI = rsiValues[rsiValues.length - 2] || null;

    // Calculate RSI MA
    const rsiMA = [];
    for (let i = 0; i < maPeriod; i++) {
      rsiMA.push(null);
    }
    
    for (let i = maPeriod; i < rsiValues.length; i++) {
      const sum = rsiValues.slice(i - maPeriod + 1, i + 1)
        .filter(v => v !== null)
        .reduce((a, b) => a + b, 0);
      const count = rsiValues.slice(i - maPeriod + 1, i + 1)
        .filter(v => v !== null).length;
      rsiMA.push(count > 0 ? sum / count : null);
    }

    const latestRSIMA = rsiMA[rsiMA.length - 1];
    const previousRSIMA = rsiMA[rsiMA.length - 2] || null;

    // After reverse, data is chronological: [oldest, ..., newest]
    // formattedData[0] = oldest candle
    // formattedData[length-1] = newest candle (most recently closed)
    // formattedData[length-2] = previous candle (one hour before newest)
    const latestIndex = formattedData.length - 1;
    const previousIndex = formattedData.length - 2;
    
    // Use closeTime for timestamps - RSI is calculated based on closing price
    const latestPrice = formattedData[latestIndex].close;
    const latestTimestamp = formattedData[latestIndex].closeTime;
    const previousPrice = previousIndex >= 0 ? formattedData[previousIndex].close : null;
    const previousTimestamp = previousIndex >= 0 ? formattedData[previousIndex].closeTime : null;
    
    // Verify timestamp order: latest must be newer than previous
    if (previousTimestamp && latestTimestamp) {
      const prevTime = previousTimestamp.getTime();
      const latestTime = latestTimestamp.getTime();
      
      // If order is wrong (latest is older than previous), swap them
      if (prevTime > latestTime) {
        console.warn(`⚠️ ${symbol}: Timestamp order issue detected. Previous (${new Date(prevTime).toISOString()}) > Latest (${new Date(latestTime).toISOString()}). Swapping...`);
        // Swap: use previous as latest since it's actually newer
        const swappedLatestRSI = previousRSI !== null ? previousRSI : latestRSI;
        const swappedLatestRSIMA = previousRSIMA !== null ? previousRSIMA : latestRSIMA;
        const swappedPrevRSI = latestRSI;
        const swappedPrevRSIMA = latestRSIMA;
        
        return {
          symbol,
          timestamp: previousTimestamp, // Actually newer (becomes latest)
          price: previousPrice,
          rsi: swappedLatestRSI,
          rsi_ma: swappedLatestRSIMA,
          previous_timestamp: latestTimestamp, // Actually older (becomes previous)
          previous_price: latestPrice,
          previous_rsi: swappedPrevRSI,
          previous_rsi_ma: swappedPrevRSIMA,
          change: swappedPrevRSI !== null && swappedLatestRSI !== null ? swappedLatestRSI - swappedPrevRSI : null,
          change_ma: swappedPrevRSIMA !== null && swappedLatestRSIMA !== null ? swappedLatestRSIMA - swappedPrevRSIMA : null,
          price_change: previousPrice !== null && latestPrice !== null ? previousPrice - latestPrice : null,
          data_points: formattedData.length
        };
      }
    }
    
    // Debug: Log timestamps in Bangkok time
    if (latestTimestamp) {
      const bkkFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const latestBKK = bkkFormatter.format(latestTimestamp);
      const prevBKK = previousTimestamp ? bkkFormatter.format(previousTimestamp) : 'N/A';
      console.log(`[${symbol}] Latest: ${latestBKK}, Previous: ${prevBKK}`);
    }
    
    // Verify we have recent data (within last 2 hours)
    const now = Date.now();
    const latestTime = latestTimestamp.getTime();
    const hoursAgo = (now - latestTime) / (1000 * 60 * 60);
    
    if (hoursAgo > 2) {
      console.warn(`⚠️ ${symbol}: Latest candle is ${hoursAgo.toFixed(1)} hours old. Latest closeTime: ${latestTimestamp.toISOString()}, Now: ${new Date(now).toISOString()}`);
    }

    return {
      symbol,
      timestamp: latestTimestamp,
      price: latestPrice,
      rsi: latestRSI,
      rsi_ma: latestRSIMA,
      previous_timestamp: previousTimestamp,
      previous_price: previousPrice,
      previous_rsi: previousRSI,
      previous_rsi_ma: previousRSIMA,
      change: previousRSI !== null ? latestRSI - previousRSI : null,
      change_ma: previousRSIMA !== null ? latestRSIMA - previousRSIMA : null,
      price_change: previousPrice !== null ? latestPrice - previousPrice : null,
      data_points: formattedData.length
    };
  } catch (error) {
    console.error('Error fetching RSI from Binance:', error);
    throw error;
  }
};

/**
 * Fetch RSI for multiple symbols (with caching)
 * @param {Array<string>} symbols - Array of trading pairs
 * @param {number} period - RSI period
 * @param {number} maPeriod - Moving average period
 * @param {boolean} forceRefresh - Force refresh from API (skip cache)
 * @returns {Promise<Array>} Array of RSI data objects
 */
export const fetchMultipleRSI = async (symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'ENA/USDT'], period = 14, maPeriod = 14, forceRefresh = false) => {
  try {
    const cacheKey = `rsi_multiple_${symbols.join('_')}_${period}_${maPeriod}`;
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = CacheUtils.get(cacheKey);
      if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
        // Find the latest timestamp from cached data
        const latestCachedTimestamp = cached.data
          .map(item => item.timestamp ? new Date(item.timestamp).getTime() : 0)
          .reduce((max, ts) => Math.max(max, ts), 0);
        
        if (latestCachedTimestamp > 0) {
          const latestCachedTime = new Date(latestCachedTimestamp);
          // Check if a new hourly candle should be available
          const needsUpdate = hasNewCandleAvailable(latestCachedTime, '1h');
          
          if (!needsUpdate) {
            const cacheAge = Date.now() - cached.timestamp;
            console.log(`[Cache] Using cached RSI data - latest candle: ${latestCachedTime.toISOString()}, cache age: ${Math.round(cacheAge / 1000)}s, new candle not yet available`);
            return cached.data;
          } else {
            console.log(`[Cache] New hourly candle available - latest cached: ${latestCachedTime.toISOString()}, fetching fresh data...`);
          }
        } else {
          // If we can't determine latest timestamp, use time-based cache (5 minutes)
          const cacheAge = Date.now() - cached.timestamp;
          if (cacheAge < 5 * 60 * 1000) {
            console.log(`[Cache] Using cached RSI data (age: ${Math.round(cacheAge / 1000)}s)`);
            return cached.data;
          }
        }
      }
    }
    
    // Fetch fresh data with rate limiting
    console.log(`[Cache] Fetching fresh RSI data from API...`);
    const results = [];
    
    // Process symbols sequentially with delay to respect rate limits
    for (const symbol of symbols) {
      try {
        const result = await fetchRSIFromBinance(symbol, period, maPeriod);
        results.push(result);
        
        // Add delay between requests to avoid rate limiting
        // Only delay if not the last symbol
        if (symbol !== symbols[symbols.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
      } catch (error) {
        console.error(`Error fetching RSI for ${symbol}:`, error);
        results.push(null);
        
        // Add delay even on error to maintain rate limit
        if (symbol !== symbols[symbols.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
      }
    }
    
    // Filter out null results (failed requests)
    const filteredResults = results.filter(result => result !== null);
    
    // Cache the results with 2 hour expiry (ensures we have valid cache for next hour even if no new candle)
    CacheUtils.set(cacheKey, filteredResults, 2 * 60 * 60 * 1000);
    
    return filteredResults;
  } catch (error) {
    console.error('Error fetching multiple RSI:', error);
    throw error;
  }
};

/**
 * Fetch historical RSI data for the last N days
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @param {number} days - Number of days to look back (default: 7)
 * @param {number} period - RSI period (default: 14)
 * @param {number} sinceTimestamp - Only fetch data after this timestamp (for incremental updates)
 * @returns {Promise<Array>} Array of RSI data points with timestamps
 */
export const fetchHistoricalRSI = async (symbol, days = 7, period = 14, sinceTimestamp = null) => {
  try {
    const now = Date.now();
    const cutoffTime = now - (days * 24 * 60 * 60 * 1000);
    
    // If sinceTimestamp is provided, we only need to fetch data after it
    // But we still need enough data for RSI calculation, so fetch a bit more
    const hours = days * 24; // Total hours to fetch (168 for 7 days)
    const fetchLimit = hours + period + 50;
    
    // Fetch klines - EXACTLY same method as fetchRSIFromBinance
    const klines = await getBinanceKlines(symbol, '1h', Math.min(fetchLimit, 1000));
    
    if (!klines || klines.length === 0) {
      return [];
    }
    
    // Format klines data - EXACTLY same as fetchRSIFromBinance
    const formattedData = formatKlinesData(klines);
    
    // Sort by closeTime to ensure chronological order (oldest to newest)
    // This matches fetchRSIFromBinance and guarantees correct RSI calculation
    formattedData.sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
    
    // Extract closing prices - EXACTLY same as fetchRSIFromBinance
    const prices = formattedData.map(d => d.close);
    
    // Calculate RSI - EXACTLY same function and method as fetchRSIFromBinance
    // This uses Wilder's smoothing, same as Current RSI Analysis
    const rsiValues = calculateRSI(prices, period);
    
    // Build historical RSI array
    // IMPORTANT: rsiValues[i] corresponds to formattedData[i].closeTime (when candle closed)
    // Start from index 'period' since that's when first valid RSI appears
    const historicalRSI = [];
    for (let i = period; i < formattedData.length; i++) {
      // Use closeTime - RSI is based on closing price, so it should be associated with close time
      const candleCloseTime = formattedData[i].closeTime.getTime();
      const rsi = rsiValues[i];
      
      // Include only: (1) within last 7 days, (2) has valid RSI, (3) after sinceTimestamp if provided
      if (candleCloseTime >= cutoffTime && rsi !== null && rsi !== undefined && !isNaN(rsi) && rsi >= 0 && rsi <= 100) {
        // If sinceTimestamp is provided, only include data after it
        if (!sinceTimestamp || candleCloseTime > sinceTimestamp) {
          historicalRSI.push({
            timestamp: formattedData[i].closeTime, // Use closeTime for accuracy
            price: formattedData[i].close,
            rsi: Number(rsi.toFixed(2)), // Round to 2 decimals for consistency
            symbol: symbol
          });
        }
      }
    }
    
    return historicalRSI;
  } catch (error) {
    console.error(`Error fetching historical RSI for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Fetch oversold history (RSI <= 30) for multiple symbols in the last N days (with caching)
 * @param {Array<string>} symbols - Array of trading pairs
 * @param {number} days - Number of days to look back (default: 7)
 * @param {number} rsiThreshold - RSI threshold (default: 30)
 * @param {boolean} forceRefresh - Force refresh from API (skip cache)
 * @returns {Promise<Array>} Array of oversold events
 */
export const fetchOversoldHistory = async (symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'ENA/USDT'], days = 7, rsiThreshold = 30, forceRefresh = false) => {
  try {
    const cacheKey = `oversold_${symbols.join('_')}_${days}_${rsiThreshold}`;
    
    // Always check cache to find last timestamp (even on force refresh)
    // This allows incremental fetching even when user clicks refresh
    let cachedData = null;
    let lastTimestamp = null;
    
    const cached = CacheUtils.get(cacheKey);
    if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
      cachedData = cached.data;
      // Find the latest timestamp in cached data
      const maxTimestamp = Math.max(...cachedData.map(item => new Date(item.timestamp).getTime()));
      const latestCachedTime = new Date(maxTimestamp);
      
      // Check if a new hourly candle should be available (since oversold uses 1h candles)
      const needsUpdate = hasNewCandleAvailable(latestCachedTime, '1h');
      
      if (!forceRefresh && !needsUpdate) {
        // No new candle available, return cached data
        console.log(`[Cache] Using cached oversold history - latest candle: ${latestCachedTime.toISOString()}, new candle not yet available`);
        return cachedData;
      }
      
      // Subtract 1 minute to ensure we get complete data
      lastTimestamp = maxTimestamp - (60 * 1000);
      if (forceRefresh) {
        console.log(`[Cache] Force refresh: Found ${cachedData.length} cached oversold events, fetching new data since ${new Date(lastTimestamp).toISOString()}`);
      } else {
        console.log(`[Cache] New hourly candle available - latest cached: ${latestCachedTime.toISOString()}, fetching new oversold events since ${new Date(lastTimestamp).toISOString()}`);
      }
    }
    
    const allEvents = [];
    
    // Fetch historical RSI for each symbol (only new data since last cache if cached exists)
    for (const symbol of symbols) {
      try {
        const historicalRSI = await fetchHistoricalRSI(symbol, days, 14, lastTimestamp);
        
        // Filter for RSI <= threshold
        const oversoldEvents = historicalRSI
          .filter(item => item.rsi <= rsiThreshold)
          .map(item => ({
            symbol: symbol.replace('/USDT', ''),
            timestamp: item.timestamp,
            rsi: item.rsi,
            price: item.price
          }));
        
        allEvents.push(...oversoldEvents);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error fetching oversold history for ${symbol}:`, error);
        // Continue with other symbols even if one fails
      }
    }
    
    // Merge cached data with new events (only if not force refresh or if we have new events)
    let mergedEvents;
    if (cachedData && !forceRefresh) {
      mergedEvents = [...cachedData, ...allEvents];
    } else if (cachedData && forceRefresh && allEvents.length > 0) {
      // On force refresh, only merge if we have new events
      mergedEvents = [...cachedData, ...allEvents];
    } else {
      mergedEvents = allEvents;
    }
    
    // Sort by timestamp (most recent first) and remove duplicates
    mergedEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Remove duplicates (same symbol, same timestamp)
    const uniqueEvents = [];
    const seen = new Set();
    for (const event of mergedEvents) {
      const key = `${event.symbol}_${new Date(event.timestamp).getTime()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(event);
      }
    }
    
    // Cache the merged results (1 hour expiry)
    CacheUtils.set(cacheKey, uniqueEvents, 60 * 60 * 1000);
    
    if (cachedData && allEvents.length > 0) {
      console.log(`[Cache] Merged ${allEvents.length} new events with ${cachedData.length} cached events = ${uniqueEvents.length} total`);
    } else if (cachedData) {
      console.log(`[Cache] No new events found, using ${cachedData.length} cached events`);
      return cachedData; // Return cached if no new data
    } else {
      console.log(`[Cache] Cached ${uniqueEvents.length} oversold events`);
    }
    
    return uniqueEvents;
  } catch (error) {
    console.error('Error fetching oversold history:', error);
    throw error;
  }
};

/**
 * Fetch 15-minute klines data for trend analysis
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @param {number} limit - Number of candles to fetch (default: 96 = 24 hours)
 * @returns {Promise<Array>} Array of formatted kline data
 */
export const fetch15MinKlines = async (symbol, limit = 96) => {
  try {
    // Fetch 15-minute candles (96 candles = 24 hours)
    const klines = await getBinanceKlines(symbol, '15m', limit);
    
    if (!klines || klines.length === 0) {
      return [];
    }
    
    // Format and sort by closeTime (oldest to newest)
    const formattedData = formatKlinesData(klines);
    formattedData.sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
    
    return formattedData;
  } catch (error) {
    console.error(`Error fetching 15-minute klines for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Detect trend using linear regression (least squares method)
 * @param {Array} data - Array of price data points with timestamps
 * @returns {Object} Trend information: { hasTrend: boolean, slope: number, trendType: 'up'|'down'|'none', r2: number }
 */
export const detectTrend = (data) => {
  if (!data || data.length < 2) {
    return { hasTrend: false, slope: 0, trendType: 'none', r2: 0 };
  }
  
  // Extract prices and convert timestamps to numeric values (milliseconds)
  const points = data.map((item, index) => ({
    x: item.closeTime ? item.closeTime.getTime() : index,
    y: item.close || item.price || 0
  }));
  
  const n = points.length;
  
  // Calculate sums for linear regression
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  }
  
  const meanX = sumX / n;
  const meanY = sumY / n;
  
  // Calculate slope (m) and intercept (b) using least squares
  const denominator = sumX2 - (sumX * sumX / n);
  
  if (Math.abs(denominator) < 1e-10) {
    // No variation in X, cannot determine trend
    return { hasTrend: false, slope: 0, trendType: 'none', r2: 0 };
  }
  
  const slope = (sumXY - (sumX * sumY / n)) / denominator;
  const intercept = meanY - (slope * meanX);
  
  // Calculate R-squared (coefficient of determination) to measure trend strength
  let ssRes = 0; // Sum of squares of residuals
  let ssTot = 0; // Total sum of squares
  
  for (const point of points) {
    const predicted = slope * point.x + intercept;
    const residual = point.y - predicted;
    ssRes += residual * residual;
    
    const deviation = point.y - meanY;
    ssTot += deviation * deviation;
  }
  
  const r2 = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
  
  // Determine trend direction and strength
  // Consider a trend valid if:
  // 1. Slope is significant (at least 0.1% of average price per time unit)
  // 2. R-squared is above 0.3 (indicating a reasonably linear relationship)
  const avgPrice = meanY;
  const timeSpan = points[n - 1].x - points[0].x;
  const priceChange = slope * timeSpan;
  const percentChange = Math.abs(priceChange / avgPrice) * 100;
  
  // Threshold: at least 0.5% price change and R² > 0.3
  const hasTrend = Math.abs(percentChange) >= 0.5 && r2 > 0.3;
  
  let trendType = 'none';
  if (hasTrend) {
    trendType = slope > 0 ? 'up' : 'down';
  }
  
  return {
    hasTrend,
    slope,
    intercept,
    trendType,
    r2: Number(r2.toFixed(4)),
    percentChange: Number(percentChange.toFixed(2))
  };
};

/**
 * Calculate trend line points for visualization
 * @param {Array} data - Array of price data points
 * @param {number} slope - Trend line slope
 * @param {number} intercept - Trend line intercept
 * @returns {Array} Array of trend line points { x: timestamp, y: price }
 */
export const calculateTrendLinePoints = (data, slope, intercept) => {
  if (!data || data.length === 0) {
    return [];
  }
  
  // Get first and last timestamps
  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];
  
  const startTime = firstPoint.closeTime ? firstPoint.closeTime.getTime() : 0;
  const endTime = lastPoint.closeTime ? lastPoint.closeTime.getTime() : 0;
  
  // Calculate trend line at start and end
  const startY = slope * startTime + intercept;
  const endY = slope * endTime + intercept;
  
  return [
    { x: startTime, y: startY },
    { x: endTime, y: endY }
  ];
};

/**
 * Fetch 4-hour klines data from Binance
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @param {number} limit - Number of candles to fetch (default: 168 = 28 days)
 * @returns {Promise<Array>} Array of formatted kline data
 */
export const fetch4HourKlines = async (symbol, limit = 168) => {
  try {
    const klines = await getBinanceKlines(symbol, '4h', limit);
    
    if (!klines || klines.length === 0) {
      return [];
    }
    
    const formattedData = formatKlinesData(klines);
    formattedData.sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
    
    return formattedData;
  } catch (error) {
    console.error(`Error fetching 4-hour klines for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Fetch 5-minute klines data from Binance
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @param {number} limit - Number of candles to fetch (default: 288 = 24 hours)
 * @param {number} startTime - Optional start time in milliseconds (fetch candles after this time)
 * @returns {Promise<Array>} Array of formatted kline data
 */
export const fetch5MinKlines = async (symbol, limit = 288, startTime = null) => {
  try {
    let allKlines = [];
    let endTime = null; // Start from most recent, then go backwards
    const maxCandles = limit;
    
    // Fetch in batches going backwards in time
    // Binance returns candles going backwards when endTime is specified
    while (allKlines.length < maxCandles) {
      const batchLimit = Math.min(1000, maxCandles - allKlines.length + 100); // Fetch extra to account for filtering
      const klines = await getBinanceKlines(symbol, '5m', batchLimit, endTime);
      
      if (!klines || klines.length === 0) {
        break; // No more data available
      }
      
      const formattedData = formatKlinesData(klines);
      
      // Filter by startTime if provided (only candles after startTime)
      let filteredData = formattedData;
      if (startTime) {
        filteredData = formattedData.filter(c => c.closeTime.getTime() >= startTime);
        
        // If all candles in this batch are before startTime, we've gone too far back
        if (filteredData.length === 0 && formattedData.length > 0) {
          // Check if we already have some candles
          if (allKlines.length > 0) {
            break; // We have enough, stop fetching
          }
          // If we don't have any yet, continue fetching older data
        }
      }
      
      // Add filtered candles
      allKlines.push(...filteredData);
      
      // If we got fewer candles than requested, we've reached the end
      if (klines.length < batchLimit) {
        break;
      }
      
      // Set endTime for next batch (oldest candle's open time - 1ms to get earlier candles)
      const oldestCandle = formattedData[formattedData.length - 1];
      endTime = oldestCandle.timestamp.getTime() - 1;
      
      // If we've collected enough candles, stop
      if (allKlines.length >= maxCandles) {
        break;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Sort by closeTime (oldest to newest)
    allKlines.sort((a, b) => a.closeTime.getTime() - b.closeTime.getTime());
    
    // Filter again by startTime to ensure all candles are after it
    let finalData = allKlines;
    if (startTime) {
      finalData = allKlines.filter(c => c.closeTime.getTime() >= startTime);
    }
    
    // Limit to requested amount (take the first 'limit' candles after startTime)
    return finalData.slice(0, maxCandles);
  } catch (error) {
    console.error(`Error fetching 5-minute klines for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Get UTC+7 (Bangkok time) hour from a timestamp
 * @param {Date} timestamp - Timestamp to check (in UTC)
 * @returns {number} Hour in UTC+7 (0-23)
 */
const getUTCPlus7Hour = (timestamp) => {
  if (!timestamp) return -1;
  try {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      hour12: false
    });
    const hourStr = formatter.format(date);
    return parseInt(hourStr, 10);
  } catch (e) {
    return -1;
  }
};

/**
 * Get UTC+7 (Bangkok time) minute from a timestamp
 * @param {Date} timestamp - Timestamp to check (in UTC)
 * @returns {number} Minute in UTC+7 (0-59)
 */
const getUTCPlus7Minute = (timestamp) => {
  if (!timestamp) return -1;
  try {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      minute: '2-digit',
      hour12: false
    });
    const minuteStr = formatter.format(date);
    return parseInt(minuteStr, 10);
  } catch (e) {
    return -1;
  }
};

/**
 * Format timestamp to UTC+7 time string - for internal use only
 * @param {Date} timestamp - Timestamp to format (in UTC)
 * @returns {string} Formatted time string (MM/DD HH:00) in UTC+7
 */
export const formatNYTimeInternal = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const timeStr = formatter.format(date);
    // Format as MM/DD, HH:MM (show minutes for accuracy)
    const parts = timeStr.split(', ');
    if (parts.length === 2) {
      const [monthDay, time] = parts;
      const [hour, minute] = time.split(':');
      return `${monthDay}, ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    // Fallback
    const [month, day, ...timeParts] = timeStr.split(/[/ ]/);
    const time = timeParts.find(p => p.includes(':'));
    if (time) {
      const [hour, minute] = time.split(':');
      return `${month}/${day}, ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    return timeStr;
  } catch (e) {
    return 'Invalid Date';
  }
};

/**
 * Format date in UTC+7 (Bangkok time) - for internal use (detection logic)
 * @param {Date} timestamp - Timestamp to format (in UTC)
 * @returns {string} Date string (YYYY-MM-DD) in UTC+7
 */
const formatDateUTCPlus7 = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
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

/**
 * Format timestamp to display time string (UTC+7)
 * Shows date and time in format "DD MMM, HH:MM" with -4 minutes adjustment for 4H breakout signals
 * @param {Date} timestamp - Timestamp to format (in UTC)
 * @returns {string} Formatted time string (DD MMM, HH:MM) in UTC+7, adjusted -4 minutes
 */
export const formatNYTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    // Display in UTC+7 (Bangkok time) for UI
    // Subtract 4 minutes from the timestamp (for 4H breakout trading signals)
    const adjustedTime = new Date(timestamp.getTime() - (4 * 60 * 1000)); // Subtract 4 minutes
    
    // Month abbreviations
    const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Get components in UTC+7 timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    // Format as DD MMM, HH:MM (e.g., "01 Nov, 20:35")
    const parts = formatter.formatToParts(adjustedTime);
    let day = '';
    let monthNum = '';
    let hour = '';
    let minute = '';
    
    parts.forEach(part => {
      if (part.type === 'day') day = part.value;
      if (part.type === 'month') monthNum = part.value;
      if (part.type === 'hour') hour = part.value;
      if (part.type === 'minute') minute = part.value;
    });
    
    // Format as DD MMM, HH:MM
    const month = monthAbbr[parseInt(monthNum, 10) - 1] || monthNum;
    const formattedDay = day.padStart(2, '0');
    const formattedHour = hour.padStart(2, '0');
    const formattedMinute = minute.padStart(2, '0');
    
    return `${formattedDay} ${month}, ${formattedHour}:${formattedMinute}`;
  } catch (e) {
    return 'Invalid Date';
  }
};

/**
 * Detect breakout and re-entry trading signals for a symbol
 * @param {string} symbol - Trading pair (e.g., 'BTC/USDT')
 * @param {number} days - Number of days to analyze (default: 3)
 * @param {Date} sinceDate - Only detect signals after this date (for incremental updates)
 * @returns {Promise<Object>} Object with { signals, breakoutsWithoutReentry }
 */
export const detectBreakoutSignals = async (symbol, days = 3, sinceDate = null) => {
  try {
    // Calculate the date range: last N days from today 11:00 UTC+7 to (N-1) days ago 11:00 UTC+7
    // Get today's date in UTC+7 (Bangkok timezone) 
    const now = new Date();
    const bangkokFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    // Get today's date string in Bangkok timezone (YYYY-MM-DD)
    const todayDateStr = bangkokFormatter.format(now);
    const [year, month, day] = todayDateStr.split('-').map(Number);
    
    // Create today at 11:00 UTC+7 (local time string, will be interpreted as UTC+7 when using Date)
    // But JavaScript Date interprets as local time, so we need to convert
    // Create date string for Bangkok timezone: YYYY-MM-DDTHH:mm:ss
    // Then convert to UTC by subtracting 7 hours
    const today11BangkokStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T11:00:00+07:00`;
    const today11Bangkok = new Date(today11BangkokStr);
    
    // Calculate (days-1) days ago at 11:00 UTC+7 (start time)
    // We include today, so we go back (days-1) days
    // Example: If days=3, we check: 3 days ago, 2 days ago, 1 day ago, today
    const startDate11Bangkok = new Date(today11Bangkok);
    startDate11Bangkok.setDate(startDate11Bangkok.getDate() - (days - 1));
    
    // If sinceDate is provided, use it as the start time (for incremental updates)
    // Otherwise, use the calculated start time
    let startTime;
    if (sinceDate) {
      startTime = sinceDate.getTime();
      console.log(`[${symbol}] Using sinceDate for incremental fetch: ${sinceDate.toISOString()}`);
    } else {
      startTime = startDate11Bangkok.getTime(); // (days-1) days ago 11:00 UTC+7 in UTC milliseconds
    }
    
    // Convert to UTC timestamps for comparison with Binance data (which is in UTC)
    // Binance timestamps are UTC, so we compare directly
    const endTime = today11Bangkok.getTime(); // Today 11:00 UTC+7 in UTC milliseconds
    
    // For filtering: we want ranges that close between startTime and endTime
    // The 4H range closes at 15:00 UTC+7, so we check if closeTime is within our date range
    console.log(`[${symbol}] Checking last ${days} days: From ${startDate11Bangkok.toISOString()} (UTC+7 11:00) to ${today11Bangkok.toISOString()} (UTC+7 11:00)`);
    console.log(`[${symbol}] Time range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()} (UTC)`);
    
    // Fetch 4-hour klines (enough for the period + buffer)
    // 7 days = 7 * 24 / 4 = 42 candles, add buffer = 52 candles
    const limit = Math.ceil((days * 24) / 4) + 10; // Add buffer
    const klines = await fetch4HourKlines(symbol, Math.min(limit, 500));
    
    if (!klines || klines.length === 0) {
      return { signals: [], breakoutsWithoutReentry: [] };
    }
    
    const signals = [];
    const breakoutsWithoutReentry = []; // Track breakouts that haven't had re-entry yet
    
    // Group candles by UTC+7 date and find the 11:00-15:00 candle for each day
    const dailyRanges = new Map(); // date -> { high, low, openTime, closeTime, candle }
    
    // Debug: Log first few candles to understand the data
    console.log(`[${symbol}] Total 4h candles: ${klines.length}`);
    if (klines.length > 0) {
      const firstCandle = klines[0];
      const lastCandle = klines[klines.length - 1];
      console.log(`[${symbol}] First candle: UTC open=${firstCandle.timestamp.toISOString()}, close=${firstCandle.closeTime.toISOString()}`);
      console.log(`[${symbol}] Last candle: UTC open=${lastCandle.timestamp.toISOString()}, close=${lastCandle.closeTime.toISOString()}`);
    }
    
    for (const candle of klines) {
      // Check if this candle covers the UTC+7 time 11:00-15:00 period (4-hour range)
      // Binance 4-hour candles align with UTC: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
      // UTC+7 time 11:00-15:00 = UTC 04:00-08:00
      // So we need the candle that opens at UTC 04:00 (UTC+7 11:00) and closes at UTC 08:00 (UTC+7 15:00)
      const openHourUTC7 = getUTCPlus7Hour(candle.timestamp);
      const closeHourUTC7 = getUTCPlus7Hour(candle.closeTime);
      
      // The candle should open at or around 11:00 UTC+7 and close at or around 15:00 UTC+7
      const openMinuteUTC7 = getUTCPlus7Minute(candle.timestamp);
      const closeMinuteUTC7 = getUTCPlus7Minute(candle.closeTime);
      
      // Check if candle opens around 11:00 UTC+7 and closes at or near 15:00 UTC+7
      // For a 4-hour candle covering UTC+7 time 11:00-15:00:
      // - Opens at UTC+7 11:00 (hour 11)
      // - Closes at UTC+7 15:00 (hour 15) or very close (14:59)
      // Binance candles close at 07:59:59.999Z which is UTC+7 14:59:59, so we accept hour 14 or 15
      const opensInRange = openHourUTC7 === 11; // Opens at UTC+7 11:00 (hour 11)
      const closesAtOrNear15 = closeHourUTC7 === 14 || closeHourUTC7 === 15; // Closes at UTC+7 14:59 or 15:00
      
      // Debug: Log some sample candles to see what we're checking
      if (klines.indexOf(candle) < 5 || (opensInRange || closeHourUTC7 === 14 || closeHourUTC7 === 15)) {
        console.log(`[${symbol}] Checking candle: UTC open=${candle.timestamp.toISOString()}, close=${candle.closeTime.toISOString()}, UTC+7 open=${openHourUTC7}:${String(openMinuteUTC7).padStart(2, '0')}, UTC+7 close=${closeHourUTC7}:${String(closeMinuteUTC7).padStart(2, '0')}, opensInRange=${opensInRange}, closesAtOrNear15=${closesAtOrNear15}`);
      }
      
      if (opensInRange && closesAtOrNear15) {
        // This candle covers the UTC+7 time 11:00-15:00 period
        const dateKey = formatDateUTCPlus7(candle.closeTime);
        
        // Filter: Only include ranges within the last 7 days
        // The range closes at 15:00 UTC+7 on its date
        // We want ranges that close after startTime (7 days ago 11:00) but could be up to today
        // However, we only include today's range if it has closed (completed)
        const rangeCloseTimeUTC = candle.closeTime.getTime();
        
        // Include ranges that close:
        // - After startTime (7 days ago 11:00 UTC+7)
        // - Before or equal to endTime (today 11:00 UTC+7) OR if today's range is complete (closes at 15:00 today)
        // Since endTime is today 11:00, we allow ranges up to today 15:00 if the range date is today
        const rangeDate = formatDateUTCPlus7(candle.closeTime);
        const todayDate = formatDateUTCPlus7(now);
        
        if (rangeCloseTimeUTC < startTime) {
          // This range is before our start date, skip it
          continue;
        }
        
        // If the range is from today, only include if current time is past 15:00 today
        // Otherwise, include ranges that close up to today 11:00
        if (rangeDate === todayDate) {
          // Today's range - only include if it has closed (we're past 15:00 today)
          const nowHour = getUTCPlus7Hour(now);
          if (nowHour < 15) {
            // Today's range hasn't closed yet, skip it
            continue;
          }
        } else if (rangeCloseTimeUTC > endTime) {
          // Range closes after today 11:00 and is not today's range, skip it
          continue;
        }
        
        // Process all days within the date range
        // The range is 11:00-15:00 UTC+7, closes at 15:00 UTC+7
        if (!dailyRanges.has(dateKey)) {
          dailyRanges.set(dateKey, {
            high: candle.high,
            low: candle.low,
            openTime: candle.timestamp,
            closeTime: candle.closeTime,
            candle: candle
          });
        } else {
          // Update if this candle has a wider range
          const existing = dailyRanges.get(dateKey);
          const existingRange = existing.high - existing.low;
          const currentRange = candle.high - candle.low;
          if (currentRange > existingRange) {
            dailyRanges.set(dateKey, {
              high: candle.high,
              low: candle.low,
              openTime: candle.timestamp,
              closeTime: candle.closeTime,
              candle: candle
            });
          }
        }
      }
    }
    
    console.log(`[${symbol}] Found ${dailyRanges.size} daily ranges (UTC+7 time 11:00-15:00 candles)`);
    
    // For each daily range, detect breakout and re-entry
    // IMPORTANT: Each day is processed independently - breakouts and re-entries must occur within the same UTC+7 day as the range
    const dailyRangeArray = Array.from(dailyRanges.entries())
      .sort((a, b) => a[1].closeTime.getTime() - b[1].closeTime.getTime());
    
    let breakoutsDetected = 0;
    let reentriesDetected = 0;
    let validSignals = 0;
    
    // Loop through each day independently
    for (let i = 0; i < dailyRangeArray.length; i++) {
      const [dateKey, range] = dailyRangeArray[i];
      const rangeHigh = range.high;
      const rangeLow = range.low;
      const rangeCloseTime = range.closeTime;
      
      // Fetch 5-minute candles after the range candle closes (for breakout and re-entry detection)
      // Fetch enough to cover the rest of the same UTC+7 day (range closes at 15:00, day ends at 23:59)
      // That's about 9 hours = 108 candles (9 hours * 12 candles/hour)
      // Fetch extra buffer to be safe (300 candles)
      const fiveMinCandles = await fetch5MinKlines(
        symbol, 
        300, // ~1.25 days of 5-minute candles (enough to cover same UTC+7 day + buffer)
        rangeCloseTime.getTime() // Start from when range closes
      );
      
      if (!fiveMinCandles || fiveMinCandles.length === 0) {
        continue; // No 5-minute data available
      }
      
      // Filter candles that are after the range closes AND within the date range
      // Check breakouts and re-entries from 15:00 (current day) to 15:00 (next day) UTC+7
      // The range closes at 15:00 UTC+7 on the range date, so we check from 15:00 same day to 15:00 next day
      const rangeDateStr = dateKey; // e.g., '2025-11-01'
      const nextDay = new Date(rangeCloseTime);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDayStr = formatDateUTCPlus7(nextDay); // e.g., '2025-11-02'
      
      // Calculate next day at 15:00 UTC+7 (end of detection window)
      const nextDay15UTC7 = new Date(rangeCloseTime);
      nextDay15UTC7.setUTCDate(nextDay15UTC7.getUTCDate() + 1);
      // Range closes at 15:00 UTC+7, so next day 15:00 is exactly 24 hours later
      const nextDay15UTC7Time = nextDay15UTC7.getTime();
      
      const candlesAfterRange = fiveMinCandles.filter(c => {
        const candleUTC7Date = formatDateUTCPlus7(c.closeTime);
        const candleCloseTime = c.closeTime.getTime();
        
        // Must be after range closes (15:00 UTC+7 on range date)
        if (candleCloseTime <= rangeCloseTime.getTime()) {
          return false;
        }
        
        // Must be before next day 15:00 UTC+7 (end of detection window)
        if (candleCloseTime >= nextDay15UTC7Time) {
          return false;
        }
        
        // Check if candle is within same day (after 15:00) or next day (before 15:00)
        // Same day range: after 15:00 UTC+7
        // Next day range: before 15:00 UTC+7 (exclusive, since 15:00 next day is when next range starts)
        if (candleUTC7Date === rangeDateStr) {
          // After 15:00 on same day
          return true;
        } else if (candleUTC7Date === nextDayStr) {
          // Check if before 15:00 on next day (exclusive)
          const candleHour = getUTCPlus7Hour(c.closeTime);
          // Include candles before 15:00 UTC+7 (hour < 15)
          return candleHour < 15;
        }
        
        return false;
      });
      
      if (candlesAfterRange.length === 0) {
        console.log(`[${symbol}] No 5m candles found in date range (${rangeDateStr} 15:00 to ${nextDayStr} 15:00 UTC+7)`);
        continue;
      }
      
      // Debug: Log the range for this day
      console.log(`[${symbol}] Range for ${dateKey}: High=${rangeHigh.toFixed(2)}, Low=${rangeLow.toFixed(2)}, CloseTime=${rangeCloseTime.toISOString()}`);
      console.log(`[${symbol}] Total 5m candles in date range (${rangeDateStr} 15:00 to ${nextDayStr} 15:00 UTC+7): ${candlesAfterRange.length}`);
      if (candlesAfterRange.length > 0) {
        console.log(`[${symbol}] First 5m candle after range: close=${candlesAfterRange[0].close.toFixed(2)}, time=${candlesAfterRange[0].closeTime.toISOString()}, UTC+7=${formatNYTimeInternal(candlesAfterRange[0].closeTime)}`);
        console.log(`[${symbol}] Last 5m candle after range: close=${candlesAfterRange[candlesAfterRange.length - 1].close.toFixed(2)}, time=${candlesAfterRange[candlesAfterRange.length - 1].closeTime.toISOString()}, UTC+7=${formatNYTimeInternal(candlesAfterRange[candlesAfterRange.length - 1].closeTime)}`);
      }
      
      // Detect breakout (price exits the range) using 5-minute candles
      let breakoutTime = null;
      let breakoutPrice = null;
      let breakoutDirection = null; // 'long' or 'short'
      let reentryTime = null;
      let reentryPrice = null;
      let entryPrice = null;
      let stopLoss = null;
      let takeProfit = null;
      let result = null; // 'win', 'loss', or null
      
      // Check for breakout above (long) or below (short) using 5-minute candles
      // Use CLOSE price for breakout detection
      // IMPORTANT: Track both breakouts and find which one has re-entry
      // Strategy: Find all potential breakouts, then check which one has re-entry
      
      // Track potential breakouts
      const potentialBreakouts = [];
      
      for (let j = 0; j < candlesAfterRange.length; j++) {
        const candle = candlesAfterRange[j];
        const candleNYTime = formatNYTimeInternal(candle.closeTime);
        
        // Track breakout above (long)
        if (candle.close > rangeHigh) {
          console.log(`[${symbol}] 🔺 Breakout ABOVE detected at ${candleNYTime}: close=${candle.close.toFixed(4)} > rangeHigh=${rangeHigh.toFixed(4)}`);
          potentialBreakouts.push({
            time: candle.closeTime,
            price: candle.close,
            direction: 'long',
            candleIndex: j,
            type: 'above',
            low: candle.low,  // Store low for SL calculation
            high: candle.high // Store high for reference
          });
        }
        
        // Track breakout below (short)
        if (candle.close < rangeLow) {
          console.log(`[${symbol}] 🔻 Breakout BELOW detected at ${candleNYTime}: close=${candle.close.toFixed(4)} < rangeLow=${rangeLow.toFixed(4)}`);
          potentialBreakouts.push({
            time: candle.closeTime,
            price: candle.close,
            direction: 'short',
            candleIndex: j,
            type: 'below',
            low: candle.low,  // Store low for reference
            high: candle.high // Store high for SL calculation
          });
        }
      }
      
      // Sort breakouts by time (chronological order)
      potentialBreakouts.sort((a, b) => a.time.getTime() - b.time.getTime());
      
      console.log(`[${symbol}] Found ${potentialBreakouts.length} potential breakouts for ${dateKey}`);
      
      // Track all valid signals (breakout + re-entry pairs)
      const validBreakoutReentryPairs = [];
      
      // Track the first breakout index (waiting for re-entry)
      let firstBreakoutIndex = null;
      let firstBreakoutCandle = null;
      let firstBreakoutTime = null;
      let firstBreakoutPrice = null;
      let firstBreakoutDirection = null;
      
      // Track if we have an open position (pending signal)
      let hasOpenPosition = false;
      
      // Iterate through all candles after range to find first breakout, then wait for re-entry
      for (let i = 0; i < candlesAfterRange.length; i++) {
        const candle = candlesAfterRange[i];
        const candleNYTime = formatNYTimeInternal(candle.closeTime);
        
        // Check if this candle is a breakout (outside the range)
        const isBreakoutAbove = candle.close > rangeHigh;
        const isBreakoutBelow = candle.close < rangeLow;
        
        // If we have an open position, check if this candle closes it (TP or SL hit)
        if (hasOpenPosition) {
          const lastSignal = validBreakoutReentryPairs[validBreakoutReentryPairs.length - 1];
          if (lastSignal && lastSignal.result === 'pending') {
            // Check if this candle hits TP or SL for the open position
            const direction = lastSignal.breakoutDirection;
            const stopLoss = lastSignal.stopLoss;
            const takeProfit = lastSignal.takeProfit;
            
            let positionClosed = false;
            
            // Check if stop loss was hit first
            if (direction === 'long' && candle.low <= stopLoss) {
              positionClosed = true;
              lastSignal.result = 'loss';
              console.log(`[${symbol}] Position CLOSED (LOSS) - SL hit at ${candleNYTime}: low=${candle.low.toFixed(4)} <= SL=${stopLoss.toFixed(4)}`);
            } else if (direction === 'short' && candle.high >= stopLoss) {
              positionClosed = true;
              lastSignal.result = 'loss';
              console.log(`[${symbol}] Position CLOSED (LOSS) - SL hit at ${candleNYTime}: high=${candle.high.toFixed(4)} >= SL=${stopLoss.toFixed(4)}`);
            }
            
            // Check if take profit was hit
            if (!positionClosed) {
              if (direction === 'long' && candle.high >= takeProfit) {
                positionClosed = true;
                lastSignal.result = 'win';
                console.log(`[${symbol}] Position CLOSED (WIN) - TP hit at ${candleNYTime}: high=${candle.high.toFixed(4)} >= TP=${takeProfit.toFixed(4)}`);
              } else if (direction === 'short' && candle.low <= takeProfit) {
                positionClosed = true;
                lastSignal.result = 'win';
                console.log(`[${symbol}] Position CLOSED (WIN) - TP hit at ${candleNYTime}: low=${candle.low.toFixed(4)} <= TP=${takeProfit.toFixed(4)}`);
              }
            }
            
            if (positionClosed) {
              // Position was closed, we can now look for new breakouts
              hasOpenPosition = false;
              console.log(`[${symbol}] Position closed (${lastSignal.result.toUpperCase()}), now looking for next breakout...`);
            } else {
              // Position still open, skip this candle
              continue;
            }
          } else {
            // Last signal is not pending (shouldn't happen if hasOpenPosition is true)
            hasOpenPosition = false;
          }
        }
        
        // If we're not waiting for a re-entry, check for first breakout
        if (firstBreakoutIndex === null) {
          if (isBreakoutAbove || isBreakoutBelow) {
            // Found first breakout - save it and wait for re-entry
            firstBreakoutIndex = i;
            firstBreakoutCandle = candle;
            firstBreakoutTime = candle.closeTime;
            firstBreakoutPrice = candle.close;
            firstBreakoutDirection = isBreakoutAbove ? 'short' : 'long';
            breakoutsDetected++;
            console.log(`[${symbol}] 🔵 First breakout detected at ${candleNYTime}: close=${candle.close.toFixed(4)}, direction=${firstBreakoutDirection.toUpperCase()}, waiting for re-entry...`);
          }
          // Continue to next candle if no breakout found
          continue;
        }
        
        // We have a first breakout waiting - check if subsequent candles are still breakout
        // If next candle is still a breakout, ignore it (don't update firstBreakout)
        if (isBreakoutAbove || isBreakoutBelow) {
          console.log(`[${symbol}] ⚪ Breakout continues at ${candleNYTime}: close=${candle.close.toFixed(4)}, ignoring (waiting for re-entry from first breakout)`);
          continue;
        }
        
        // Check if this candle is a re-entry (closes back inside the range)
        if (candle.close <= rangeHigh && candle.close >= rangeLow) {
          const reentryNYTime = formatNYTimeInternal(candle.closeTime);
          console.log(`[${symbol}] ✅ Re-entry detected at ${reentryNYTime}: close=${candle.close.toFixed(4)} (inside range ${rangeLow.toFixed(4)}-${rangeHigh.toFixed(4)})`);
          
          // Use the first breakout (stored earlier) with this re-entry
          const currentBreakoutTime = firstBreakoutTime;
          const currentBreakoutPrice = firstBreakoutPrice;
          const currentBreakoutDirection = firstBreakoutDirection;
          const currentReentryTime = candle.closeTime;
          const currentReentryPrice = candle.close;
          const currentEntryPrice = currentReentryPrice; // Enter at re-entry price
          reentriesDetected++;
          
          // IMPORTANT: Direction is determined by WHERE the re-entry comes from, not the breakout direction
          // Re-entry from below (price was below range, now enters) → LONG
          // Re-entry from above (price was above range, now enters) → SHORT
          // Check where the re-entry candle came from (its low/high relative to range)
          let reentryDirection = null;
          
          // Check if re-entry candle's low was below range (entering from below) → LONG
          if (candle.low < rangeLow) {
            reentryDirection = 'long';
          }
          // Check if re-entry candle's high was above range (entering from above) → SHORT
          else if (candle.high > rangeHigh) {
            reentryDirection = 'short';
          }
          // If re-entry candle doesn't show direction clearly, check previous candle
          else {
            const prevCandle = i > 0 ? candlesAfterRange[i - 1] : null;
            if (prevCandle) {
              // If previous candle was below range, re-entry is from below → LONG
              if (prevCandle.close < rangeLow || prevCandle.low < rangeLow) {
                reentryDirection = 'long';
              }
              // If previous candle was above range, re-entry is from above → SHORT
              else if (prevCandle.close > rangeHigh || prevCandle.high > rangeHigh) {
                reentryDirection = 'short';
              }
            }
            
            // Final fallback: use breakout price direction
            if (!reentryDirection) {
              if (currentBreakoutPrice > rangeHigh) {
                // Broke out above, likely re-entry from above → SHORT
                reentryDirection = 'short';
              } else if (currentBreakoutPrice < rangeLow) {
                // Broke out below, likely re-entry from below → LONG
                reentryDirection = 'long';
              } else {
                // Should not happen, but fallback
                reentryDirection = currentBreakoutDirection;
              }
            }
          }
          
          const currentDirection = reentryDirection; // Use re-entry direction, not breakout direction
          console.log(`[${symbol}] Re-entry detected (${reentryDirection.toUpperCase()} - from ${reentryDirection === 'long' ? 'below' : 'above'}): ${dateKey}, close=${candle.close.toFixed(4)}, entry=${currentEntryPrice.toFixed(4)}`);
          
          // Calculate stop loss: find lowest/highest price during breakout period (from first breakout to re-entry)
          // For long (re-entry from bottom): use lowest price during breakout period
          // For short (re-entry from top): use highest price during breakout period
          let currentRisk = 0;
          let currentStopLoss = 0;
          
          // Find all candles from first breakout to re-entry (inclusive)
          const candlesDuringBreakout = candlesAfterRange.slice(firstBreakoutIndex, i + 1);
          
          // Calculate maximum allowed risk (1% of entry price)
          const maxAllowedRisk = currentEntryPrice * 0.01; // 1% of entry price
          
          if (currentDirection === 'long') {
            // For LONG: Find the lowest price (low) during the breakout period
            let lowestPrice = candlesDuringBreakout[0].low;
            for (const breakoutCandle of candlesDuringBreakout) {
              if (breakoutCandle.low < lowestPrice) {
                lowestPrice = breakoutCandle.low;
              }
            }
            const calculatedRisk = currentEntryPrice - lowestPrice;
            
            // Cap risk at 1% if calculated risk exceeds it
            if (calculatedRisk > maxAllowedRisk) {
              currentRisk = maxAllowedRisk;
              currentStopLoss = currentEntryPrice - currentRisk; // SL = Entry - 1% of Entry
              console.log(`[${symbol}] LONG: Calculated risk ${(calculatedRisk / currentEntryPrice * 100).toFixed(2)}% exceeds 1%, capping at 1%. SL=${currentStopLoss.toFixed(4)}`);
            } else {
              currentRisk = calculatedRisk;
              currentStopLoss = lowestPrice;
              console.log(`[${symbol}] LONG: Lowest price during breakout period (from first breakout to re-entry): ${currentStopLoss.toFixed(4)}`);
            }
          } else {
            // For SHORT: Find the highest price (high) during the breakout period
            let highestPrice = candlesDuringBreakout[0].high;
            for (const breakoutCandle of candlesDuringBreakout) {
              if (breakoutCandle.high > highestPrice) {
                highestPrice = breakoutCandle.high;
              }
            }
            const calculatedRisk = highestPrice - currentEntryPrice;
            
            // Cap risk at 1% if calculated risk exceeds it
            if (calculatedRisk > maxAllowedRisk) {
              currentRisk = maxAllowedRisk;
              currentStopLoss = currentEntryPrice + currentRisk; // SL = Entry + 1% of Entry
              console.log(`[${symbol}] SHORT: Calculated risk ${(calculatedRisk / currentEntryPrice * 100).toFixed(2)}% exceeds 1%, capping at 1%. SL=${currentStopLoss.toFixed(4)}`);
            } else {
              currentRisk = calculatedRisk;
              currentStopLoss = highestPrice;
              console.log(`[${symbol}] SHORT: Highest price during breakout period (from first breakout to re-entry): ${currentStopLoss.toFixed(4)}`);
            }
          }
          
          // Calculate TP based on 1:2 risk ratio (TP = Entry ± 2% of Entry)
          // Since risk is capped at 1%, TP will be 2% (1% * 2)
          let currentTakeProfit = 0;
          if (currentDirection === 'long') {
            currentTakeProfit = currentEntryPrice + (currentRisk * 2); // TP = Entry + 2%
          } else {
            currentTakeProfit = currentEntryPrice - (currentRisk * 2); // TP = Entry - 2%
          }
          
          console.log(`[${symbol}] Entry: ${currentEntryPrice.toFixed(4)}, SL: ${currentStopLoss.toFixed(4)} (${(currentRisk / currentEntryPrice * 100).toFixed(2)}%), TP: ${currentTakeProfit.toFixed(4)} (${(currentRisk * 2 / currentEntryPrice * 100).toFixed(2)}%)`);
          
          // Store this valid pair (first breakout with re-entry)
          // Result will be determined as we iterate through subsequent candles
          const newSignal = {
            breakoutTime: currentBreakoutTime,
            breakoutPrice: currentBreakoutPrice,
            breakoutDirection: currentDirection,
            reentryTime: currentReentryTime,
            reentryPrice: currentReentryPrice,
            entryPrice: currentEntryPrice,
            stopLoss: currentStopLoss,
            takeProfit: currentTakeProfit,
            result: 'pending', // Will be updated when TP/SL is hit
            breakoutCandle: firstBreakoutCandle,
            reentryCandle: candle
          };
          
          validBreakoutReentryPairs.push(newSignal);
          console.log(`[${symbol}] ✅ Created signal for first breakout at ${formatNYTimeInternal(currentBreakoutTime)} → re-entry at ${reentryNYTime}, result: PENDING (waiting for TP/SL)`);
          
          // Mark position as open so we don't look for new breakouts until it closes
          hasOpenPosition = true;
          console.log(`[${symbol}] Position is OPEN (pending), will not detect new breakouts until it closes`);
          
          // Reset first breakout tracker - now we can look for the next first breakout
          // (but only if position is closed, which is checked at the start of the loop)
          firstBreakoutIndex = null;
          firstBreakoutCandle = null;
          firstBreakoutTime = null;
          firstBreakoutPrice = null;
          firstBreakoutDirection = null;
        }
      }
      
      // Log all valid pairs for debugging
      if (validBreakoutReentryPairs.length > 0) {
        console.log(`[${symbol}] Found ${validBreakoutReentryPairs.length} valid breakout/re-entry pairs:`);
        validBreakoutReentryPairs.forEach((pair, idx) => {
          console.log(`  [${idx + 1}] Breakout: ${formatNYTimeInternal(pair.breakoutTime)} (${pair.breakoutPrice.toFixed(4)}) → Re-entry: ${formatNYTimeInternal(pair.reentryTime)} (${pair.entryPrice.toFixed(4)}) [${pair.breakoutDirection.toUpperCase()}]`);
        });
      }
      
      // Track breakouts without re-entry: check if firstBreakout is still waiting after loop ends
      if (firstBreakoutIndex !== null && firstBreakoutTime !== null) {
        // Check if this breakout already has a re-entry in validBreakoutReentryPairs
        const hasReentry = validBreakoutReentryPairs.some(pair => 
          Math.abs(pair.breakoutTime.getTime() - firstBreakoutTime.getTime()) < 60000
        );
        
        if (!hasReentry) {
          // This breakout never got a re-entry, add it to breakoutsWithoutReentry
          const breakoutWithoutReentry = {
            symbol: symbol.replace('/USDT', ''),
            rangeDate: dateKey,
            rangeHigh,
            rangeLow,
            rangeCloseTime,
            breakoutTime: firstBreakoutTime,
            breakoutPrice: firstBreakoutPrice,
            breakoutDirection: firstBreakoutDirection === 'long' ? 'below' : 'above', // Direction of breakout (above/below)
            isAbove: firstBreakoutPrice > rangeHigh,
            isBelow: firstBreakoutPrice < rangeLow
          };
          
          // Get current price to show how far from range
          try {
            const currentPriceData = await getBinancePrice(symbol);
            if (currentPriceData && currentPriceData.price) {
              breakoutWithoutReentry.currentPrice = parseFloat(currentPriceData.price);
            }
          } catch (err) {
            // If price fetch fails, continue without current price
            console.warn(`[${symbol}] Could not fetch current price for breakout without re-entry`);
          }
          
          // Store in a separate array (will be returned separately)
          breakoutsWithoutReentry.push(breakoutWithoutReentry);
          console.log(`[${symbol}] 🔶 Breakout without re-entry detected: ${formatNYTimeInternal(firstBreakoutTime)} (${firstBreakoutPrice.toFixed(4)})`);
        }
      }
      
      // Add ALL valid signals, not just one per day
      // Sort by breakout time (chronological order)
      if (validBreakoutReentryPairs.length > 0) {
        validBreakoutReentryPairs.sort((a, b) => a.breakoutTime.getTime() - b.breakoutTime.getTime());
        
        console.log(`[${symbol}] Creating ${validBreakoutReentryPairs.length} signals for ${dateKey}:`);
        
        // Add each valid pair as a separate signal
        for (const pair of validBreakoutReentryPairs) {
        validSignals++;
          console.log(`[${symbol}] ✅ Creating signal ${validSignals}:`);
          console.log(`  - Breakout: ${formatNYTimeInternal(pair.breakoutTime)} (${pair.breakoutPrice.toFixed(4)})`);
          console.log(`  - Re-entry: ${formatNYTimeInternal(pair.reentryTime)} (${pair.entryPrice.toFixed(4)})`);
          console.log(`  - Direction: ${pair.breakoutDirection.toUpperCase()}`);
          
        signals.push({
          symbol: symbol.replace('/USDT', ''),
          rangeDate: dateKey,
          rangeHigh,
          rangeLow,
          rangeCloseTime,
            breakoutTime: pair.breakoutTime,
            breakoutPrice: pair.breakoutPrice,
            breakoutDirection: pair.breakoutDirection,
            reentryTime: pair.reentryTime,
            reentryPrice: pair.reentryPrice,
            entryPrice: pair.entryPrice,
            stopLoss: pair.stopLoss,
            takeProfit: pair.takeProfit,
            result: pair.result || 'pending' // 'win', 'loss', or 'pending'
          });
        }
      } else {
        // No valid pairs found for this day
        console.log(`[${symbol}] ❌ No valid signals created for ${dateKey}:`);
        console.log(`  - Found ${validBreakoutReentryPairs.length} valid pairs`);
        
        if (potentialBreakouts.length === 0) {
          console.log(`[${symbol}] No breakouts detected for ${dateKey}, rangeHigh=${rangeHigh.toFixed(4)}, rangeLow=${rangeLow.toFixed(4)}`);
        } else if (validBreakoutReentryPairs.length === 0) {
          console.log(`[${symbol}] ${potentialBreakouts.length} breakouts found but no re-entries for ${dateKey}`);
          
          // Also check if firstBreakout exists and hasn't been added yet
          if (firstBreakoutIndex !== null && firstBreakoutTime !== null) {
            const breakoutWithoutReentry = {
              symbol: symbol.replace('/USDT', ''),
              rangeDate: dateKey,
              rangeHigh,
              rangeLow,
              rangeCloseTime,
              breakoutTime: firstBreakoutTime,
              breakoutPrice: firstBreakoutPrice,
              breakoutDirection: firstBreakoutDirection === 'long' ? 'below' : 'above',
              isAbove: firstBreakoutPrice > rangeHigh,
              isBelow: firstBreakoutPrice < rangeLow
            };
            
            try {
              const currentPriceData = await getBinancePrice(symbol);
              if (currentPriceData && currentPriceData.price) {
                breakoutWithoutReentry.currentPrice = parseFloat(currentPriceData.price);
              }
            } catch (err) {
              console.warn(`[${symbol}] Could not fetch current price for breakout without re-entry`);
            }
            
            breakoutsWithoutReentry.push(breakoutWithoutReentry);
          }
        }
      }
    }
    
    console.log(`[${symbol}] Summary: ${breakoutsDetected} breakouts, ${reentriesDetected} re-entries, ${validSignals} valid signals`);
    
    // Check pending positions across subsequent days to see if they closed
    const pendingSignals = signals.filter(s => s.result === 'pending');
    if (pendingSignals.length > 0) {
      console.log(`[${symbol}] Found ${pendingSignals.length} pending positions, checking subsequent days...`);
      
      for (const pendingSignal of pendingSignals) {
        // Fetch additional 5-minute candles from re-entry time onwards to check for TP/SL
        // Fetch up to 7 more days of data (enough to cover subsequent days)
        const additionalCandles = await fetch5MinKlines(
          symbol,
          2000, // ~7 days of 5-minute candles (2000 candles = ~7 days * 12 candles/hour * 24 hours)
          pendingSignal.reentryTime.getTime() // Start from re-entry time
        );
        
        if (!additionalCandles || additionalCandles.length === 0) {
          continue;
        }
        
        // Find the re-entry candle index in the additional candles
        let reentryIndex = -1;
        for (let j = 0; j < additionalCandles.length; j++) {
          if (Math.abs(additionalCandles[j].closeTime.getTime() - pendingSignal.reentryTime.getTime()) < 60000) { // Within 1 minute
            reentryIndex = j;
            break;
          }
        }
        
        if (reentryIndex === -1) {
          // Couldn't find re-entry candle, skip
          continue;
        }
        
        // Check candles after re-entry for TP/SL
        const candlesAfterReentry = additionalCandles.slice(reentryIndex + 1);
        const direction = pendingSignal.breakoutDirection;
        const stopLoss = pendingSignal.stopLoss;
        const takeProfit = pendingSignal.takeProfit;
        
        for (const checkCandle of candlesAfterReentry) {
          // Check if stop loss was hit first
          if (direction === 'long' && checkCandle.low <= stopLoss) {
            pendingSignal.result = 'loss';
            console.log(`[${symbol}] ✅ Pending position CLOSED (LOSS) - SL hit: ${formatNYTimeInternal(checkCandle.closeTime)}, low=${checkCandle.low.toFixed(4)} <= SL=${stopLoss.toFixed(4)}`);
            break;
          } else if (direction === 'short' && checkCandle.high >= stopLoss) {
            pendingSignal.result = 'loss';
            console.log(`[${symbol}] ✅ Pending position CLOSED (LOSS) - SL hit: ${formatNYTimeInternal(checkCandle.closeTime)}, high=${checkCandle.high.toFixed(4)} >= SL=${stopLoss.toFixed(4)}`);
            break;
          }
          
          // Check if take profit was hit
          if (direction === 'long' && checkCandle.high >= takeProfit) {
            pendingSignal.result = 'win';
            console.log(`[${symbol}] ✅ Pending position CLOSED (WIN) - TP hit: ${formatNYTimeInternal(checkCandle.closeTime)}, high=${checkCandle.high.toFixed(4)} >= TP=${takeProfit.toFixed(4)}`);
            break;
          } else if (direction === 'short' && checkCandle.low <= takeProfit) {
            pendingSignal.result = 'win';
            console.log(`[${symbol}] ✅ Pending position CLOSED (WIN) - TP hit: ${formatNYTimeInternal(checkCandle.closeTime)}, low=${checkCandle.low.toFixed(4)} <= TP=${takeProfit.toFixed(4)}`);
            break;
          }
        }
      }
      
      // Count updated signals
      const updatedSignals = signals.filter(s => s.result !== 'pending').length;
      const stillPending = signals.filter(s => s.result === 'pending').length;
      console.log(`[${symbol}] After checking subsequent days: ${updatedSignals} positions closed, ${stillPending} still pending`);
    }
    
    // Return both signals and breakouts without re-entry
    return {
      signals: signals,
      breakoutsWithoutReentry: breakoutsWithoutReentry
    };
  } catch (error) {
    console.error(`Error detecting breakout signals for ${symbol}:`, error);
    throw error;
  }
};


/**
 * Fetch breakout signals for multiple symbols (with caching)
 * @param {Array<string>} symbols - Array of trading pairs
 * @param {number} days - Number of days to analyze (default: 7)
 * @param {boolean} forceRefresh - Force refresh from API (skip cache)
 * @returns {Promise<Array>} Array of trading signals (only signals with re-entry)
 */
export const fetchMultipleBreakoutSignals = async (
  symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'ENA/USDT'],
  days = 30,
  forceRefresh = false
) => {
  // Ensure symbols match the same order as other features
  // BTC BNB ETH XRP SOL SUI DOGE ADA ASTER PEPE ENA
  try {
    const cacheKey = `breakout_signals_${symbols.join('_')}_${days}`;
    
    // Always check cache to find last timestamp (even on force refresh)
    // This allows incremental fetching even when user clicks refresh
    let cachedData = null;
    let lastReentryTime = null;
    
    const cached = CacheUtils.get(cacheKey);
    if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
      cachedData = cached.data;
      // Find the latest re-entry time in cached data
      const maxTimestamp = Math.max(...cachedData.map(signal => {
        const reentryTime = signal.reentryTime instanceof Date ? signal.reentryTime : new Date(signal.reentryTime);
        return reentryTime.getTime();
      }));
      const latestCachedTime = new Date(maxTimestamp);
      
      // Check if a new 5-minute candle should be available (since breakouts use 5m candles)
      const needsUpdate = hasNewCandleAvailable(latestCachedTime, '5m');
      
      if (!forceRefresh && !needsUpdate) {
        // No new candle available, return cached data
        console.log(`[Cache] Using cached breakout signals - latest reentry: ${latestCachedTime.toISOString()}, new 5m candle not yet available`);
        return cachedData;
      }
      
      // Subtract 1 minute to ensure we get complete data
      lastReentryTime = maxTimestamp - (60 * 1000);
      if (forceRefresh) {
        console.log(`[Cache] Force refresh: Found ${cachedData.length} cached breakout signals, fetching new signals since ${new Date(lastReentryTime).toISOString()}`);
      } else {
        console.log(`[Cache] New 5m candle available - latest reentry: ${latestCachedTime.toISOString()}, fetching new signals since ${new Date(lastReentryTime).toISOString()}`);
      }
    }
    
    const allSignals = [];
    
    // Fetch signals for each symbol (only new ones since last cache if cached exists)
    for (const symbol of symbols) {
      try {
        const sinceDate = lastReentryTime ? new Date(lastReentryTime) : null;
        const result = await detectBreakoutSignals(symbol, days, sinceDate);
        // result is now an object with { signals, breakoutsWithoutReentry }
        const signals = Array.isArray(result) ? result : (result.signals || []);
        allSignals.push(...signals);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Error fetching breakout signals for ${symbol}:`, error);
        // Continue with other symbols even if one fails
      }
    }
    
    // Merge cached data with new signals (only if not force refresh or if we have new signals)
    let mergedSignals;
    if (cachedData && !forceRefresh) {
      mergedSignals = [...cachedData, ...allSignals];
    } else if (cachedData && forceRefresh && allSignals.length > 0) {
      // On force refresh, only merge if we have new signals
      mergedSignals = [...cachedData, ...allSignals];
    } else {
      mergedSignals = allSignals;
    }
    
    // Normalize Date objects first (convert strings to Date objects if needed)
    const normalizedSignalsForSort = mergedSignals.map(signal => ({
      ...signal,
      reentryTime: signal.reentryTime instanceof Date ? signal.reentryTime : new Date(signal.reentryTime),
      breakoutTime: signal.breakoutTime instanceof Date ? signal.breakoutTime : new Date(signal.breakoutTime)
    }));
    
    // Sort by re-entry time (most recent first - descending order)
    normalizedSignalsForSort.sort((a, b) => 
      b.reentryTime.getTime() - a.reentryTime.getTime()
    );
    
    // Use normalized signals for further processing
    mergedSignals = normalizedSignalsForSort;
    
    // Remove duplicates (same symbol, same re-entry time)
    const uniqueSignals = [];
    const seen = new Set();
    for (const signal of mergedSignals) {
      const key = `${signal.symbol}_${signal.reentryTime.getTime()}_${signal.breakoutTime?.getTime() || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueSignals.push(signal);
      }
    }
    
    // Cache the merged results (1 hour expiry)
    CacheUtils.set(cacheKey, uniqueSignals, 60 * 60 * 1000);
    
    if (cachedData && allSignals.length > 0) {
      console.log(`[Cache] Merged ${allSignals.length} new signals with ${cachedData.length} cached signals = ${uniqueSignals.length} total`);
    } else if (cachedData && allSignals.length === 0) {
      // No new signals found, but we already checked if new candle is available
      // This means we fetched but found no new signals, return cached data
      console.log(`[Cache] No new signals found after checking, using ${cachedData.length} cached signals`);
      return cachedData;
    } else if (!cachedData && allSignals.length === 0) {
      console.log(`[Cache] No cached data and no new signals found`);
    } else {
      console.log(`[Cache] Cached ${uniqueSignals.length} breakout signals`);
    }
    
    return uniqueSignals;
  } catch (error) {
    console.error('Error fetching multiple breakout signals:', error);
    throw error;
  }
};

/**
 * Fetch breakouts without re-entry for multiple symbols (with caching)
 * @param {Array<string>} symbols - Array of trading pairs
 * @param {number} days - Number of days to analyze (default: 3)
 * @param {boolean} forceRefresh - Force refresh from API (skip cache)
 * @returns {Promise<Array>} Array of breakouts without re-entry
 */
export const fetchBreakoutsWithoutReentry = async (
  symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'ENA/USDT'],
  days = 3,
  forceRefresh = false
) => {
  try {
    const cacheKey = `breakouts_without_reentry_${symbols.join('_')}_${days}`;
    
    // Always check cache to find last timestamp (even on force refresh)
    // This allows incremental fetching even when user clicks refresh
    let cachedData = null;
    let lastBreakoutTime = null;
    
    const cached = CacheUtils.get(cacheKey);
    if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
      cachedData = cached.data;
      // Find the latest breakout time in cached data
      const maxTimestamp = Math.max(...cachedData.map(breakout => {
        const breakoutTime = breakout.breakoutTime instanceof Date ? breakout.breakoutTime : new Date(breakout.breakoutTime);
        return breakoutTime.getTime();
      }));
      const latestCachedTime = new Date(maxTimestamp);
      
      // Check if a new 5-minute candle should be available (since breakouts use 5m candles)
      const needsUpdate = hasNewCandleAvailable(latestCachedTime, '5m');
      
      if (!forceRefresh && !needsUpdate) {
        // No new candle available, return cached data (after filtering for last 24 hours)
        // Still need to filter to last 24 hours even when using cache
        const now = new Date();
        const last24Hours = now.getTime() - (24 * 60 * 60 * 1000);
        const breakoutsLast24Hours = cachedData.filter(breakout => {
          const breakoutTime = breakout.breakoutTime instanceof Date ? breakout.breakoutTime : new Date(breakout.breakoutTime);
          return breakoutTime.getTime() >= last24Hours;
        });
        
        // Normalize dates and sort
        const normalizedBreakouts = breakoutsLast24Hours.map(breakout => ({
          ...breakout,
          breakoutTime: breakout.breakoutTime instanceof Date ? breakout.breakoutTime : new Date(breakout.breakoutTime)
        }));
        normalizedBreakouts.sort((a, b) => b.breakoutTime.getTime() - a.breakoutTime.getTime());
        
        console.log(`[Cache] Using cached breakouts without re-entry - latest breakout: ${latestCachedTime.toISOString()}, new 5m candle not yet available, showing ${normalizedBreakouts.length} from last 24h`);
        return normalizedBreakouts;
      }
      
      // Subtract 1 minute to ensure we get complete data
      lastBreakoutTime = maxTimestamp - (60 * 1000);
      if (forceRefresh) {
        console.log(`[Cache] Force refresh: Found ${cachedData.length} cached breakouts without re-entry, fetching new breakouts since ${new Date(lastBreakoutTime).toISOString()}`);
      } else {
        console.log(`[Cache] New 5m candle available - latest breakout: ${latestCachedTime.toISOString()}, fetching new breakouts since ${new Date(lastBreakoutTime).toISOString()}`);
      }
    }
    
    const allBreakouts = [];
    
    // Fetch breakouts for each symbol (only new ones since last cache if cached exists)
    for (const symbol of symbols) {
      try {
        const sinceDate = lastBreakoutTime ? new Date(lastBreakoutTime) : null;
        const result = await detectBreakoutSignals(symbol, days, sinceDate);
        // result is now an object with { signals, breakoutsWithoutReentry }
        const breakouts = Array.isArray(result) ? [] : (result.breakoutsWithoutReentry || []);
        allBreakouts.push(...breakouts);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Error fetching breakouts without re-entry for ${symbol}:`, error);
        // Continue with other symbols even if one fails
      }
    }
    
    // Merge cached data with new breakouts (only if not force refresh or if we have new breakouts)
    let mergedBreakouts;
    if (cachedData && !forceRefresh) {
      mergedBreakouts = [...cachedData, ...allBreakouts];
    } else if (cachedData && forceRefresh && allBreakouts.length > 0) {
      // On force refresh, only merge if we have new breakouts
      mergedBreakouts = [...cachedData, ...allBreakouts];
    } else {
      mergedBreakouts = allBreakouts;
    }
    
    // Normalize Date objects first (convert strings to Date objects if needed)
    const normalizedBreakouts = mergedBreakouts.map(breakout => ({
      ...breakout,
      breakoutTime: breakout.breakoutTime instanceof Date ? breakout.breakoutTime : new Date(breakout.breakoutTime)
    }));
    
    // Filter to last 24 hours only
    const now = new Date();
    const last24Hours = now.getTime() - (24 * 60 * 60 * 1000); // 24 hours ago
    const breakoutsLast24Hours = normalizedBreakouts.filter(breakout => 
      breakout.breakoutTime.getTime() >= last24Hours
    );
    
    // Sort by breakout time (most recent first - descending order)
    breakoutsLast24Hours.sort((a, b) => 
      b.breakoutTime.getTime() - a.breakoutTime.getTime()
    );
    
    // Remove duplicates (same symbol, same breakout time)
    const uniqueBreakouts = [];
    const seen = new Set();
    for (const breakout of breakoutsLast24Hours) {
      const key = `${breakout.symbol}_${breakout.breakoutTime.getTime()}_${breakout.rangeDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueBreakouts.push(breakout);
      }
    }
    
    // Cache the merged results (1 hour expiry)
    CacheUtils.set(cacheKey, uniqueBreakouts, 60 * 60 * 1000);
    
    if (cachedData && allBreakouts.length > 0) {
      console.log(`[Cache] Merged ${allBreakouts.length} new breakouts with ${cachedData.length} cached breakouts = ${uniqueBreakouts.length} total`);
    } else if (cachedData && allBreakouts.length === 0) {
      // No new breakouts found, but we already checked if new candle is available
      // Filter cached data for last 24 hours and return
      const now = new Date();
      const last24Hours = now.getTime() - (24 * 60 * 60 * 1000);
      const breakoutsLast24Hours = cachedData.filter(breakout => {
        const breakoutTime = breakout.breakoutTime instanceof Date ? breakout.breakoutTime : new Date(breakout.breakoutTime);
        return breakoutTime.getTime() >= last24Hours;
      });
      
      // Normalize dates and sort
      const normalizedBreakouts = breakoutsLast24Hours.map(breakout => ({
        ...breakout,
        breakoutTime: breakout.breakoutTime instanceof Date ? breakout.breakoutTime : new Date(breakout.breakoutTime)
      }));
      normalizedBreakouts.sort((a, b) => b.breakoutTime.getTime() - a.breakoutTime.getTime());
      
      console.log(`[Cache] No new breakouts found after checking, using ${normalizedBreakouts.length} cached breakouts from last 24h`);
      return normalizedBreakouts;
    } else if (!cachedData && allBreakouts.length === 0) {
      console.log(`[Cache] No cached data and no new breakouts found`);
    } else {
      console.log(`[Cache] Cached ${uniqueBreakouts.length} breakouts without re-entry`);
    }
    
    return uniqueBreakouts;
  } catch (error) {
    console.error('Error fetching breakouts without re-entry:', error);
    throw error;
  }
};

export default {
  getBinanceKlines,
  getBinancePrice,
  getBinance24hrTicker,
  getBinanceExchangeInfo,
  formatKlinesData,
  calculateRSI,
  fetchRSIFromBinance,
  fetchMultipleRSI,
  fetchHistoricalRSI,
  fetchOversoldHistory,
  fetch15MinKlines,
  detectTrend,
  calculateTrendLinePoints,
  fetch4HourKlines,
  formatNYTime,
  detectBreakoutSignals,
  fetchMultipleBreakoutSignals,
  fetchBreakoutsWithoutReentry
};

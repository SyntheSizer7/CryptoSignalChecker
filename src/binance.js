// Binance API Integration
const BINANCE_BASE_URL = 'https://api.binance.com';

// Timezone helpers (UTC+7 - Bangkok/Indochina Time)
const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000; // 7 hours in milliseconds

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
 * Fetch RSI for multiple symbols
 * @param {Array<string>} symbols - Array of trading pairs
 * @param {number} period - RSI period
 * @param {number} maPeriod - Moving average period
 * @returns {Promise<Array>} Array of RSI data objects
 */
export const fetchMultipleRSI = async (symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'HYPE/USDT', 'TAO/USDT', 'PUMP/USDT', 'ENA/USDT'], period = 14, maPeriod = 14) => {
  try {
    const results = await Promise.all(
      symbols.map(symbol => 
        fetchRSIFromBinance(symbol, period, maPeriod)
          .catch(error => {
            console.error(`Error fetching RSI for ${symbol}:`, error);
            return null;
          })
      )
    );
    
    // Filter out null results (failed requests)
    return results.filter(result => result !== null);
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
 * @returns {Promise<Array>} Array of RSI data points with timestamps
 */
export const fetchHistoricalRSI = async (symbol, days = 7, period = 14) => {
  try {
    const hours = days * 24; // Total hours to fetch (168 for 7 days)
    
    // Fetch enough data: 7 days + warmup period for RSI calculation
    // Need at least period candles before first valid RSI
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
    
    // Calculate timestamp threshold (7 days ago from now in UTC)
    const now = Date.now();
    const cutoffTime = now - (days * 24 * 60 * 60 * 1000);
    
    // Build historical RSI array
    // IMPORTANT: rsiValues[i] corresponds to formattedData[i].closeTime (when candle closed)
    // Start from index 'period' since that's when first valid RSI appears
    const historicalRSI = [];
    for (let i = period; i < formattedData.length; i++) {
      // Use closeTime - RSI is based on closing price, so it should be associated with close time
      const candleCloseTime = formattedData[i].closeTime.getTime();
      const rsi = rsiValues[i];
      
      // Include only: (1) within last 7 days, (2) has valid RSI
      if (candleCloseTime >= cutoffTime && rsi !== null && rsi !== undefined && !isNaN(rsi) && rsi >= 0 && rsi <= 100) {
        historicalRSI.push({
          timestamp: formattedData[i].closeTime, // Use closeTime for accuracy
          price: formattedData[i].close,
          rsi: Number(rsi.toFixed(2)), // Round to 2 decimals for consistency
          symbol: symbol
        });
      }
    }
    
    return historicalRSI;
  } catch (error) {
    console.error(`Error fetching historical RSI for ${symbol}:`, error);
    throw error;
  }
};

/**
 * Fetch oversold history (RSI <= 30) for multiple symbols in the last N days
 * @param {Array<string>} symbols - Array of trading pairs
 * @param {number} days - Number of days to look back (default: 7)
 * @param {number} rsiThreshold - RSI threshold (default: 30)
 * @returns {Promise<Array>} Array of oversold events
 */
export const fetchOversoldHistory = async (symbols = ['BTC/USDT', 'BNB/USDT', 'ETH/USDT', 'XRP/USDT', 'SOL/USDT', 'SUI/USDT', 'DOGE/USDT', 'ADA/USDT', 'ASTER/USDT', 'PEPE/USDT', 'HYPE/USDT', 'TAO/USDT', 'PUMP/USDT', 'ENA/USDT'], days = 7, rsiThreshold = 30) => {
  try {
    const allEvents = [];
    
    // Fetch historical RSI for each symbol
    for (const symbol of symbols) {
      try {
        const historicalRSI = await fetchHistoricalRSI(symbol, days, 14);
        
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
    
    // Sort by timestamp (most recent first)
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return allEvents;
  } catch (error) {
    console.error('Error fetching oversold history:', error);
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
  fetchOversoldHistory
};

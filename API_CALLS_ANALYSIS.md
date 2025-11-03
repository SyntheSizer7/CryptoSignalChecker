# API Calls Analysis

This document explains how many Binance API calls are made for each section.

## Section Overview

### 1. "4H UTC+7 Breakout Trading Signals" Section

**Function:** `fetchBreakoutSignals()` → `fetchMultipleBreakoutSignals()`

**API Calls Made:**
- For each symbol (11 symbols total):
  - 1 API call to `getBinanceKlines()` with interval='4h' (via `fetch4HourKlines()`)
  - 1+ API calls to `getBinanceKlines()` with interval='5m' (via `fetch5MinKlines()`, which may batch-fetch)
  
**Total API Calls:** ~22 calls
- 11 calls for 4H candles (one per symbol)
- ~11 calls for 5m candles (one per symbol, may be more if batch-fetching is needed)

**Details:**
- `fetchMultipleBreakoutSignals()` loops through all symbols and calls `detectBreakoutSignals()` for each
- Each `detectBreakoutSignals()` call:
  1. Fetches 4H candles to identify daily ranges (11:00-15:00 UTC+7)
  2. Fetches 5m candles to detect breakouts and re-entries after each range closes

### 2. "RSI Analysis & Breakout Status" Section

**Function:** `fetchRSIData()` → `fetchMultipleRSI()` + shared data from `fetchMultipleBreakoutSignals()`

**API Calls Made:**
- For RSI data:
  - For each symbol (11 symbols total):
    - 1 API call to `getBinanceKlines()` with interval='1h' (via `fetchHourlyKlines()`)
  
- For breakout data:
  - **Shared** with "4H UTC+7 Breakout Trading Signals" section
  - Uses `breakoutSignals.data` from the same `fetchMultipleBreakoutSignals()` call
  - **No additional API calls** (data is shared)

**Total API Calls:** 11 calls (for RSI only)
- 11 calls for 1h candles (one per symbol)
- 0 additional calls for breakout data (shared from section 1)

## Summary

| Section | API Calls | Breakdown |
|---------|-----------|-----------|
| **4H UTC+7 Breakout Trading Signals** | ~22 calls | 11 for 4H candles + ~11 for 5m candles |
| **RSI Analysis & Breakout Status** | 11 calls | 11 for 1h candles (RSI) + shared breakout data (0 additional) |
| **Total (both sections)** | ~33 calls | 11 RSI + 22 breakout = 33 Binance API calls |

## Notes

1. **Shared Data:** Both sections share the breakout signals data, so there are no duplicate API calls for breakout detection.

2. **Caching:** With caching enabled:
   - First load: Full API calls as described above
   - Subsequent loads: Uses cache with incremental fetching (`sinceDate` parameter) to only fetch new data
   - Cached data expires after 1 hour

3. **Auto-Refresh:**
   - RSI: Refreshes hourly at xx:00:00 UTC+7 (11 calls every hour)
   - Breakout: Refreshes every 5 minutes at xx:00, xx:05, etc. UTC+7 (~22 calls every 5 minutes, but uses incremental fetching to minimize calls)

4. **Rate Limiting:**
   - Binance allows 1200 requests per minute for weight-based endpoints
   - Current usage: ~33 calls per refresh is well within limits
   - The code includes 300ms delays between symbol fetches to avoid rate limits

## Optimization Opportunities

1. **Batch Requests:** Currently fetches each symbol individually. Could potentially batch requests if Binance supports it.
2. **Incremental Updates:** Already implemented - uses `sinceDate` to only fetch new candles after the last known time
3. **Cache Strategy:** Already implemented - caches results for 1 hour to reduce redundant API calls



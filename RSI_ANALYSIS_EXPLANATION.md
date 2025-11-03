# RSI Analysis & Breakout Status - How It Works

## Overview
The "RSI Analysis & Breakout Status" table combines two data sources:
1. **RSI Data** - Current RSI values for each cryptocurrency (1-hour timeframe)
2. **Breakout Signals** - Trading signals showing breakouts, re-entries, and closed positions

## Table Structure
The table displays 7 columns for each cryptocurrency:
- **Symbol** - Cryptocurrency name (e.g., BTC, BNB, ETH)
- **RSI** - Current RSI value (14-period, Wilder's smoothing)
- **Breakout** - Time when price broke out of the 4H range
- **Re-entry** - Time when price re-entered after breakout (if applicable)
- **Long/Short** - Trading direction (LONG or SHORT)
- **Close Status** - Time when position was closed (if applicable)
- **Distance from Range** - Percentage distance from the 4H range (if applicable)

---

## Data Sources

### 1. RSI Data (`rsiData`)
- **Source**: Fetched from Binance API (1-hour candles)
- **Update Frequency**: Auto-refreshes every hour (at xx:00:00 UTC+7)
- **Caching**: Uses cache to reduce API calls

### 2. Breakout Signals (`breakoutSignalsData`)
- **Source**: Single API call that returns both:
  - `signals` - Array of signals with re-entry (exit + re-entry + long/short)
  - `breakoutsWithoutReentry` - Array of breakouts without re-entry yet
- **Update Frequency**: Auto-refreshes every 5 minutes (at xx:00, xx:05, xx:10, etc. UTC+7)
- **Caching**: Uses incremental fetching (only gets new data since last fetch)

---

## Logic Flow (How Each Row is Determined)

For each cryptocurrency row, the system follows this decision tree:

### Step 1: Check Time Constraints
```
IF current time >= 15:00 UTC+7 (after 4H trading window)
  → Clear ALL breakout columns (Breakout, Re-entry, Long/Short, Close Status, Distance)
  → Show only "-"
  → RESET for next day
```

### Step 2: Get Latest Status
The system finds the **most recent active/pending signal** for the symbol:

**Data Priority:**
1. **Signals with Re-entry** (`breakoutSignalsData`) - These have:
   - `breakoutTime` (exit time)
   - `reentryTime` (re-entry time)
   - `breakoutDirection` (LONG or SHORT)
   - `result` (pending/win/loss)
   
2. **Breakouts without Re-entry** (`breakoutData`) - These have:
   - `breakoutTime` only
   - No re-entry yet

**Selection Rules:**
- Finds all signals with `reentryTime` for the symbol
- Prioritizes signals where `result === 'pending'`
- If no pending, uses most recent signal without `closeTime`
- Sorts by re-entry time (most recent first)

### Step 3: Check for Closed Signals
The system also checks for **closed signals** (win/loss):
- Finds signals where `result === 'win'` or `result === 'loss'`
- Gets the most recent closed signal

---

## Display Logic (What Shows in Each Column)

### Logic Priority Order:

#### **LOGIC 1: Active/Pending Breakout Exists**
**Condition**: `latestStatus` exists AND no `closeTime` AND (`result === 'pending'` OR `result` is undefined)

**Sub-case 1A: Breakout + Re-entry (Signal)**
- **Breakout**: ✓ Shows breakout time
- **Re-entry**: ✓ Shows re-entry time  
- **Long/Short**: ✓ Shows LONG or SHORT
- **Close Status**: ✗ Shows "-"
- **Distance**: ✗ Shows "-"

**Sub-case 1B: Breakout Only (No Re-entry Yet)**
- **Breakout**: ✓ Shows breakout time
- **Re-entry**: ✗ Shows "-"
- **Long/Short**: ✗ Shows "-"
- **Close Status**: ✗ Shows "-"
- **Distance**: ✓ Shows distance from range (% above/below)

**Filter Check**: If breakout time is from **previous day** (before today's 11:00 UTC+7), show "-" for all columns.

---

#### **LOGIC 2: Closed Signal Exists (No Active Breakout)**
**Condition**: `latestClosedSignal` exists AND `closeTime !== '-'` AND no active `latestStatus`

**Sub-case 2A: Closed Outside Range + No New Breakout**
- **Breakout**: ✓ Shows close time (as breakout indicator)
- **Re-entry**: ✗ Shows "-"
- **Long/Short**: ✗ Shows "-"
- **Close Status**: ✓ Shows close time (green)
- **Distance**: ✓ Shows distance from range based on TP/SL

**Sub-case 2B: Closed Inside Range**
- **Breakout**: ✗ Shows "-"
- **Re-entry**: ✗ Shows "-"
- **Long/Short**: ✗ Shows "-"
- **Close Status**: ✓ Shows close time (green)
- **Distance**: ✗ Shows "-"

**Sub-case 2C: Closed + New Breakout After Close**
- **Breakout**: ✓ Shows new breakout time
- **Re-entry**: ✗ Shows "-"
- **Long/Short**: ✗ Shows "-"
- **Close Status**: ✓ Shows close time (green)
- **Distance**: ✓ Shows distance for new breakout

---

#### **LOGIC 3: No Breakout/Closed Signal**
**Condition**: No `latestStatus` AND no `latestClosedSignal`

**All Columns**: Show "-" (no activity)

---

## Special Time Rules

### 1. Daily Reset (After 15:00 UTC+7)
- **When**: Current time >= 15:00 UTC+7
- **Action**: Clears all breakout-related columns
- **Reason**: 4H trading window (11:00-15:00 UTC+7) has ended
- **Next Day**: System resets at 11:00 UTC+7 for new trading window

### 2. Previous Day Filter
- **When**: Breakout time < Today's 11:00 UTC+7
- **Action**: Hides the breakout (shows "-")
- **Reason**: Only show breakouts from today's trading window

---

## Key Functions

### `getLatestBreakoutStatus(symbol)`
- Finds the most recent **active/pending** breakout or signal for a symbol
- Checks both signals with re-entry and breakouts without re-entry
- Returns the most recent one

### `getLatestClosedSignal(symbol)`
- Finds the most recent **closed** signal (win/loss) for a symbol
- Used only for displaying close status

### `isBreakoutFromPreviousDay(breakoutTime)`
- Checks if a breakout occurred before today's 11:00 UTC+7
- If yes, the breakout is considered "stale" and hidden

### `isAfter1500UTC7()`
- Checks if current time is after 15:00 UTC+7
- If yes, clears all breakout data for the day

---

## Example Scenarios

### Scenario 1: Active Signal with Re-entry
```
Symbol: BNB
RSI: 45.2
Breakout: 02 Nov, 23:00
Re-entry: 02 Nov, 23:25
Long/Short: LONG
Close Status: -
Distance: -
```
**Meaning**: BNB broke out at 23:00, re-entered at 23:25, currently in LONG position (pending)

### Scenario 2: Breakout Only (No Re-entry Yet)
```
Symbol: BTC
RSI: 52.1
Breakout: 03 Nov, 11:30
Re-entry: -
Long/Short: -
Close Status: -
Distance: +1.25%
```
**Meaning**: BTC broke out at 11:30, currently 1.25% above range, waiting for re-entry

### Scenario 3: Closed Position
```
Symbol: ETH
RSI: 48.5
Breakout: 02 Nov, 18:50 (close time shown as breakout)
Re-entry: -
Long/Short: -
Close Status: 02 Nov, 18:50 (green)
Distance: +0.39%
```
**Meaning**: ETH position closed at 18:50 with a win, closed 0.39% above range

### Scenario 4: After 15:00 UTC+7
```
Symbol: BTC
RSI: 50.1
Breakout: -
Re-entry: -
Long/Short: -
Close Status: -
Distance: -
```
**Meaning**: Trading window ended, all breakout data cleared for reset

---

## Data Updates

### Automatic Updates:
- **RSI**: Every hour at xx:00:00 UTC+7
- **Breakout Signals**: Every 5 minutes (xx:00, xx:05, xx:10, etc. UTC+7)

### Manual Refresh:
- **"Refresh RSI"** button: Fetches fresh RSI data (uses cache if available)
- **"Refresh Breakout"** button: Fetches fresh breakout data (uses incremental cache)

---

## Technical Details

### Timezone Handling
- All times displayed in **UTC+7** (Bangkok/Indochina Time)
- 4H trading window: **11:00-15:00 UTC+7** each day
- Daily reset: **After 15:00 UTC+7**

### Data Filtering
- Uses `selectedCryptos` Set to filter which cryptocurrencies to display
- Can be toggled per section (independent filtering)

### Distance Calculation
- **Above Range**: `((currentPrice - rangeHigh) / rangeHigh) * 100`
- **Below Range**: `((rangeLow - currentPrice) / rangeLow) * 100`
- Shows as percentage with +/- sign

---

## Summary

The "RSI Analysis & Breakout Status" table provides a **real-time view** of:
1. **Current RSI values** for each cryptocurrency
2. **Active breakout status** (if any breakouts are happening)
3. **Trading signals** (exit, re-entry, direction)
4. **Closed positions** (if any positions were recently closed)

The logic prioritizes showing **active/pending signals** over closed ones, and automatically clears data after the daily trading window ends at 15:00 UTC+7.



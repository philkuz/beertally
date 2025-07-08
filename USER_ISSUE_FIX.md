# User Categorization Bug Fix

## Issue
Users were appearing in both the "Participants" and "Observers" sections of the beer tally application, when they should only appear in one category based on their `user_type`.

## Root Cause
The issue was in the `getLeaderboard()` function in `server.mjs`. The SQL WHERE clause construction was incorrect:

### Before (Broken Logic)
```javascript
if (roomId) {
  whereClause = "WHERE u.room_id = $1";
  params = [roomId];
}

// This created invalid SQL when roomId was null:
${whereClause}
${roomId ? "" : "AND"} u.user_type = 'participant'
```

**Problems:**
1. When `roomId` was null (main page): Created invalid SQL like `SELECT ... FROM ... AND u.user_type = 'participant'` (missing WHERE)
2. When `roomId` existed: Failed to filter by `user_type` at all, showing all users in both categories

### After (Fixed Logic)
```javascript
if (roomId) {
  whereClause = "WHERE u.room_id = $1 AND";
  params = [roomId];
} else {
  whereClause = "WHERE";
}

// Now creates valid SQL:
${whereClause} u.user_type = 'participant'
```

**Results:**
1. When `roomId` is null: `WHERE u.user_type = 'participant'` ✅
2. When `roomId` exists: `WHERE u.room_id = $1 AND u.user_type = 'participant'` ✅

## Files Modified
- `server.mjs` - Fixed the `getLeaderboard()` function (lines ~190-225)

## Status
✅ **FIXED** - Users now appear only in their designated category (Participants OR Observers, not both)

Server has been restarted with the corrected code.
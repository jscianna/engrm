-- FatHippo User Migration Script
-- Migrates all data from old Clerk userId to new Clerk userId
-- Run AFTER switching to production Clerk and getting the new userId

-- Set these variables before running:
-- OLD_USER_ID: user_39b7Bzrd5LLE2qQspDj0uSlM0lZ (your test Clerk userId)
-- NEW_USER_ID: (your production Clerk userId - get this after switching)

-- Step 1: Migrate memories
UPDATE memories 
SET user_id = 'NEW_USER_ID_HERE'
WHERE user_id = 'user_39b7Bzrd5LLE2qQspDj0uSlM0lZ';

-- Step 2: Migrate syntheses (if table exists)
UPDATE syntheses 
SET user_id = 'NEW_USER_ID_HERE'
WHERE user_id = 'user_39b7Bzrd5LLE2qQspDj0uSlM0lZ';

-- Step 3: Migrate analytics/injection events (if table exists)
UPDATE injection_events 
SET user_id = 'NEW_USER_ID_HERE'
WHERE user_id = 'user_39b7Bzrd5LLE2qQspDj0uSlM0lZ';

-- Step 4: Migrate search_hits (if table exists)
UPDATE search_hits 
SET user_id = 'NEW_USER_ID_HERE'
WHERE user_id = 'user_39b7Bzrd5LLE2qQspDj0uSlM0lZ';

-- Step 5: Verify migration
SELECT 'memories' as table_name, COUNT(*) as count FROM memories WHERE user_id = 'NEW_USER_ID_HERE'
UNION ALL
SELECT 'syntheses', COUNT(*) FROM syntheses WHERE user_id = 'NEW_USER_ID_HERE'
UNION ALL
SELECT 'injection_events', COUNT(*) FROM injection_events WHERE user_id = 'NEW_USER_ID_HERE';

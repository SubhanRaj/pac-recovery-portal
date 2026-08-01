-- One-time INSERT-only backfill from excise_dues into the new schema (0000_init.sql).
-- Never UPDATEs/DELETEs/DROPs excise_dues — see pac-recovery-migration-plan.md §5.
-- Run local-only until explicitly told to run against remote.
--
-- MIGRATION_PERIOD below ('2026-07') is this migration's assumed first period, matching
-- CLAUDE.md's documented PAC-meeting baseline ("collected as of 08-Jul-2026"). Confirm before
-- this file is ever run against remote D1.

-- 1. All 75 districts. 59 come from excise_dues (with their historical totals); the other 16
--    (no excise_dues row yet) are seeded with a NULL baseline, sourced from the reference
--    project's district list (scripts_and_data/backups/revenue-recovery-portal_districts_users_*.sql).
INSERT INTO districts (district_name, total_dues, collected_till_date)
  SELECT DISTINCT district_name, total_dues, collected_till_date FROM excise_dues;

INSERT INTO districts (district_name, total_dues, collected_till_date) VALUES
  ('Amroha', NULL, NULL),
  ('Auraiya', NULL, NULL),
  ('Banda', NULL, NULL),
  ('Budaun', NULL, NULL),
  ('Chitrakoot', NULL, NULL),
  ('Gautam Buddha Nagar', NULL, NULL),
  ('Ghaziabad', NULL, NULL),
  ('Hamirpur', NULL, NULL),
  ('Hapur', NULL, NULL),
  ('Hathras', NULL, NULL),
  ('Kushinagar', NULL, NULL),
  ('Maharajganj', NULL, NULL),
  ('Moradabad', NULL, NULL),
  ('Pilibhit', NULL, NULL),
  ('Rampur', NULL, NULL),
  ('Sambhal', NULL, NULL);

-- 2. DEO users, carrying over real cug_hash/deo_email unchanged (never rehashed/regenerated).
INSERT INTO users (role, email, cug_hash, district_id, created_at)
  SELECT 'deo', e.deo_email, e.cug_hash, d.id, CURRENT_TIMESTAMP
  FROM excise_dues e JOIN districts d ON d.district_name = e.district_name
  WHERE e.cug_hash IS NOT NULL;

-- 3. First pac_dues period for the 59 districts with historical data. opening_balance is the
--    pre-existing total_dues - collected_till_date baseline; recovered_this_period carries over
--    collected_after_date (whatever a DEO already recovered under the old single-snapshot system).
INSERT INTO pac_dues (
  district_id, period, opening_balance, recovered_this_period,
  batte_khatte_count, batte_khatte_amount, court_case_count, court_stayed_amount,
  net_recoverable, lock_status, locked_at, submitted_by_name
)
  SELECT
    d.id,
    '2026-07',
    e.total_dues - e.collected_till_date,
    e.collected_after_date,
    e.batte_khatte_count, e.batte_khatte_amount, e.court_case_count, e.court_stayed_amount,
    MAX(0, (e.total_dues - e.collected_till_date) - e.collected_after_date
           - e.batte_khatte_amount - e.court_stayed_amount),
    e.is_locked,
    e.locked_at,
    e.deo_name
  FROM excise_dues e JOIN districts d ON d.district_name = e.district_name;

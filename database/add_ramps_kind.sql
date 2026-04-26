-- Distinguish boat ramps from lake cut-offs in the ramps table.
--
-- The seed data mixed two kinds of spots:
--   * Boat ramps  — actual launch points (Wahweap, Bullfrog, Halls Crossing,
--                   Antelope Point, Stateline, Hite, Farley Canyon, Copper
--                   Canyon, Piute Farms, Bullfrog Spur).
--   * Lake cut-offs — rocky passages between sections of the lake that close
--                     as the water drops (Castle Rock Cut-Off, Dominguez Butte
--                     Cut-Off, Gunsight to Padre Bay Cut-Off, Bullfrog to Halls
--                     Creek Cut-Off).
--
-- They share the same elevation rules (above the min ⇒ usable, below ⇒ out of
-- reach) but they aren't the same thing in the world. This column lets the UI
-- render distinct icons + group them on the /ramps page.
--
-- Safe to run multiple times: the column add and the row updates are both
-- idempotent.

ALTER TABLE ramps
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'boat_ramp'
  CHECK (kind IN ('boat_ramp', 'cut_off'));

UPDATE ramps SET kind = 'cut_off'
WHERE name IN (
  'Castle Rock Cut-Off',
  'Dominguez Butte Cut-Off',
  'Gunsight to Padre Bay Cut-Off',
  'Bullfrog to Halls Creek Cut-Off'
);

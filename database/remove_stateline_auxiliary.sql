-- Remove duplicate Stateline Auxiliary Ramp
-- Keep Stateline Launch, remove Stateline Auxiliary Ramp
-- Both have the same elevation values and location, so they are duplicates

DELETE FROM ramps 
WHERE name = 'Stateline Auxiliary Ramp';


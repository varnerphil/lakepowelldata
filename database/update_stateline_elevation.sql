-- Update Stateline Launch safe launch cutoff elevation to 3520.00 ft
-- This corrects the elevation from 3564.00 ft to 3520.00 ft

UPDATE ramps 
SET min_safe_elevation = 3520.00,
    min_usable_elevation = 3519.00,
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'Stateline Launch';



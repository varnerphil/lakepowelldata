-- Seed ramp definitions into database
-- Based on data from lakepowell.water-data.com ramp accessibility table

INSERT INTO ramps (name, min_safe_elevation, min_usable_elevation, location) VALUES
('Stateline Auxiliary Ramp', 3520.00, 3519.00, 'Stateline, UT'),
('Bullfrog North Ramp', 3529.00, 3528.00, 'Bullfrog, UT'),
('Antelope Point Business Ramp', 3540.00, 3539.00, 'Antelope Point, AZ'),
('Bullfrog Spur (Boats < 25'')', 3549.00, 3548.00, 'Bullfrog, UT'),
('Wahweap (Main Launch)', 3550.00, 3549.00, 'Wahweap, AZ'),
('Halls Crossing (use at own risk)', 3556.00, 3555.00, 'Halls Crossing, UT'),
('Stateline Launch', 3520.00, 3519.00, 'Stateline, UT'),
('Bullfrog (Main Launch)', 3578.00, 3577.00, 'Bullfrog, UT'),
('Castle Rock Cut-Off', 3583.00, 3582.00, 'Castle Rock, UT'),
('Antelope Point Public Ramp', 3588.00, 3587.00, 'Antelope Point, AZ'),
('Dominguez Butte Cut-Off', 3602.00, 3601.00, 'Dominguez Butte, UT'),
('Gunsight to Padre Bay Cut-Off', 3613.00, 3612.00, 'Gunsight, UT'),
('Hite', 3650.00, 3649.00, 'Hite, UT'),
('Farley Canyon', 3653.00, 3652.00, 'Farley Canyon, UT'),
('Copper Canyon', 3663.00, 3662.00, 'Copper Canyon, UT'),
('Bullfrog to Halls Creek Cut-Off', 3670.00, 3669.00, 'Bullfrog, UT'),
('Piute Farms', 3682.00, 3681.00, 'Piute Farms, UT')
ON CONFLICT (name) DO NOTHING;






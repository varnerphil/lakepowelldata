"""
Seed ramp definitions into database.
Based on data from lakepowell.water-data.com ramp accessibility table.
"""
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.database import insert_ramp

# Ramp definitions based on lakepowell.water-data.com
# Minimum safe elevation and absolute minimum usable elevation
RAMPS = [
    {
        'name': 'Bullfrog North Ramp',
        'min_safe_elevation': 3529.00,
        'min_usable_elevation': 3528.00,
        'location': 'Bullfrog, UT'
    },
    {
        'name': 'Antelope Point Business Ramp',
        'min_safe_elevation': 3540.00,
        'min_usable_elevation': 3539.00,
        'location': 'Antelope Point, AZ'
    },
    {
        'name': 'Bullfrog Spur (Boats < 25\')',
        'min_safe_elevation': 3549.00,
        'min_usable_elevation': 3548.00,
        'location': 'Bullfrog, UT'
    },
    {
        'name': 'Wahweap (Main Launch)',
        'min_safe_elevation': 3550.00,
        'min_usable_elevation': 3549.00,
        'location': 'Wahweap, AZ'
    },
    {
        'name': 'Halls Crossing (use at own risk)',
        'min_safe_elevation': 3556.00,
        'min_usable_elevation': 3555.00,
        'location': 'Halls Crossing, UT'
    },
    {
        'name': 'Stateline Launch',
        'min_safe_elevation': 3520.00,
        'min_usable_elevation': 3519.00,
        'location': 'Stateline, UT'
    },
    {
        'name': 'Bullfrog (Main Launch)',
        'min_safe_elevation': 3578.00,
        'min_usable_elevation': 3577.00,
        'location': 'Bullfrog, UT'
    },
    {
        'name': 'Castle Rock Cut-Off',
        'min_safe_elevation': 3583.00,
        'min_usable_elevation': 3582.00,
        'location': 'Castle Rock, UT'
    },
    {
        'name': 'Antelope Point Public Ramp',
        'min_safe_elevation': 3588.00,
        'min_usable_elevation': 3587.00,
        'location': 'Antelope Point, AZ'
    },
    {
        'name': 'Dominguez Butte Cut-Off',
        'min_safe_elevation': 3602.00,
        'min_usable_elevation': 3601.00,
        'location': 'Dominguez Butte, UT'
    },
    {
        'name': 'Gunsight to Padre Bay Cut-Off',
        'min_safe_elevation': 3613.00,
        'min_usable_elevation': 3612.00,
        'location': 'Gunsight, UT'
    },
    {
        'name': 'Hite',
        'min_safe_elevation': 3650.00,
        'min_usable_elevation': 3649.00,
        'location': 'Hite, UT'
    },
    {
        'name': 'Farley Canyon',
        'min_safe_elevation': 3653.00,
        'min_usable_elevation': 3652.00,
        'location': 'Farley Canyon, UT'
    },
    {
        'name': 'Copper Canyon',
        'min_safe_elevation': 3663.00,
        'min_usable_elevation': 3662.00,
        'location': 'Copper Canyon, UT'
    },
    {
        'name': 'Bullfrog to Halls Creek Cut-Off',
        'min_safe_elevation': 3670.00,
        'min_usable_elevation': 3669.00,
        'location': 'Bullfrog, UT'
    },
    {
        'name': 'Piute Farms',
        'min_safe_elevation': 3682.00,
        'min_usable_elevation': 3681.00,
        'location': 'Piute Farms, UT'
    },
]


def seed_ramps():
    """Seed all ramp definitions into the database."""
    print("Seeding ramp definitions...")
    
    for ramp in RAMPS:
        try:
            ramp_id = insert_ramp(
                name=ramp['name'],
                min_safe_elevation=ramp['min_safe_elevation'],
                min_usable_elevation=ramp['min_usable_elevation'],
                location=ramp['location']
            )
            print(f"✓ Inserted ramp: {ramp['name']} (ID: {ramp_id})")
        except Exception as e:
            print(f"✗ Failed to insert ramp {ramp['name']}: {e}")
    
    print(f"\nSeeded {len(RAMPS)} ramp definitions")


if __name__ == '__main__':
    seed_ramps()






import Image from 'next/image'

const PHOTOS: { src: string; alt: string }[] = [
  { src: '/lp-pictures/lake-aerial-panorama.jpg', alt: 'Aerial panorama of Lake Powell' },
  { src: '/lp-pictures/butte-landscape.jpg', alt: 'Lake Powell butte landscape' },
  { src: '/lp-pictures/reflection-canyon-sunrise.webp', alt: 'Sunrise over Reflection Canyon' },
  { src: '/lp-pictures/sandstone-shore.jpg', alt: 'Sandstone shoreline meeting clear Lake Powell water' },
  { src: '/lp-pictures/sunset-reflections.webp', alt: 'Sunset sandstone cliffs reflected in Lake Powell' },
  { src: '/lp-pictures/bathtub-rings-aerial.jpg', alt: 'Aerial view of Lake Powell side canyons' },
  { src: '/lp-pictures/sunset-panorama.webp', alt: 'Lake Powell at sunset with blue water' },
  { src: '/lp-pictures/reflection-canyon-bathtub.jpg', alt: 'Reflection Canyon aerial showing bathtub rings' },
]

/**
 * Photo-only gallery for the bottom of the home page. 2 columns on mobile,
 * 4 on desktop.
 */
export default function LakePowellGallery() {
  return (
    <section>
      <h2 className="mb-4 sm:mb-5 px-1 text-lg sm:text-xl lg:text-2xl font-light text-gray-900">
        Lake Powell
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {PHOTOS.map((p) => (
          <div key={p.src} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100">
            <Image
              src={p.src}
              alt={p.alt}
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  )
}

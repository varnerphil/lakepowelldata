import Image from 'next/image'

export default function AboutPage() {
  return (
    <div>
      {/* Personal hero */}
      <section className="relative">
        <div className="relative h-[60vh] min-h-[400px] sm:h-[70vh] w-full">
          <Image
            src="/about-lake-powell-generations.jpeg"
            alt="A child plays in the sand at Lake Powell at sunset, with a houseboat in the background"
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 lg:px-16 pb-8 sm:pb-12">
            <div className="max-w-3xl mx-auto">
              <h1
                className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight"
                style={{ color: '#ffffff', textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
              >
                Four generations here. Aiming for five.
              </h1>
            </div>
          </div>
        </div>
      </section>

      {/* Personal story */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="space-y-6 text-gray-800 font-light leading-relaxed text-lg sm:text-xl">
            <p className="text-xl sm:text-2xl text-gray-900">
              Lake Powell has been part of my family for generations.
            </p>
            <p>
              My grandpa started bringing my dad here while the reservoir was
              still filling. My dad passed that love of the lake down to us by
              taking us early and often. I took my first trip when I was just
              three weeks old. Now my own kids — including my son in the photo
              above — have been coming since they were babies too.
            </p>
            <p>
              We still make it down to the lake five to ten times a year. Same
              beaches, same sunsets, same houseboat rhythm. Four generations
              strong.
            </p>
            <p className="text-xl sm:text-2xl text-gray-900">
              I built this site because I want there to be a fifth.
            </p>
            <p>
              I want my kids to be able to bring their kids here one day. For
              that to happen, Lake Powell needs to still be here — and it needs
              to be healthy. Right now, that future is not something we can take
              for granted.
            </p>
            <p>
              This site exists to make the conversation around Lake Powell
              easier to understand. I wanted a way to show what different
              proposals and operating plans actually mean in real terms — not
              buried in legal or technical language, but expressed as water
              levels over time under real conditions.
            </p>
            <p>
              If you care about this place, you should be able to clearly see
              what&apos;s being proposed and what the likely outcomes are.
            </p>
            <p>
              My goal is to create content grounded in solid data: not
              clickbait, not fear-driven messaging, just a clear look at the
              numbers and what they mean for the lake, the people who depend on
              it, and the families who love it.
            </p>
          </div>
        </div>
      </section>

      {/* Data / methodology */}
      <div className="bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="max-w-3xl mx-auto space-y-8 sm:space-y-12">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-gray-900 mb-2">
                How the site works
              </h2>
              <p className="text-sm sm:text-base text-gray-600 font-light max-w-2xl mx-auto">
                Data sources, methodology, and definitions
              </p>
            </div>

            <section className="card p-4 sm:p-8 lg:p-10">
              <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-gray-900">Data Sources</h2>
              <ul className="space-y-4 text-gray-700 font-light leading-relaxed">
                <li className="flex items-start">
                  <span className="mr-3 text-gray-400">•</span>
                  <div>
                    <span className="font-normal text-gray-900">USBR (Bureau of Reclamation):</span>{' '}
                    Official water elevation, content, inflow, and outflow data
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="mr-3 text-gray-400">•</span>
                  <div>
                    <span className="font-normal text-gray-900">Weather API:</span>{' '}
                    Temperature data from OpenWeatherMap
                  </div>
                </li>
              </ul>
            </section>

            <section className="card p-4 sm:p-8 lg:p-10">
              <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-gray-900">Methodology</h2>
              <div className="space-y-4 text-gray-700 font-light leading-relaxed">
                <p>
                  Water level data is collected daily from the USBR and stored in our database.
                  Ramp accessibility is calculated based on current water elevation compared to
                  each ramp&apos;s minimum safe and usable elevations.
                </p>
                <p>
                  Historical averages are calculated from all available data in our database,
                  with separate calculations for all-time, since filled (June 22, 1980), and
                  since Water Year 2000 (October 1, 1999).
                </p>
                <p>
                  Projections use a Monte Carlo simulation that samples historical water year
                  inflow patterns and applies your chosen release policy forward in time.
                  Optional streamflow adjustments match USBR CRSS climate projections, and
                  augmentation scenarios model the Colorado River Abundance Act&apos;s proposed
                  desalinated Replacement Water as an offset to Powell releases.
                </p>
              </div>
            </section>

            <section className="card p-4 sm:p-8 lg:p-10">
              <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-gray-900">Ramp Status Definitions</h2>
              <ul className="space-y-6">
                <li>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#f0f5ed] border border-[#8b9a6b] flex items-center justify-center mr-4 mt-1">
                      <span className="text-[#8b9a6b] text-sm">✓</span>
                    </div>
                    <div>
                      <h3 className="font-normal text-gray-900 mb-1">Open and Usable</h3>
                      <p className="text-gray-700 font-light leading-relaxed">
                        Current elevation is at or above the ramp&apos;s minimum safe elevation.
                      </p>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#faf5f0] border border-[#d4a574] flex items-center justify-center mr-4 mt-1">
                      <span className="text-[#d4a574] text-sm">⚠</span>
                    </div>
                    <div>
                      <h3 className="font-normal text-gray-900 mb-1">Use at Own Risk</h3>
                      <p className="text-gray-700 font-light leading-relaxed">
                        Current elevation is between the minimum usable and minimum safe elevations.
                      </p>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="flex items-start">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#faf0f0] border border-[#c99a7a] flex items-center justify-center mr-4 mt-1">
                      <span className="text-[#c99a7a] text-sm">✗</span>
                    </div>
                    <div>
                      <h3 className="font-normal text-gray-900 mb-1">Unusable</h3>
                      <p className="text-gray-700 font-light leading-relaxed">
                        Current elevation is below the ramp&apos;s minimum usable elevation.
                      </p>
                    </div>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

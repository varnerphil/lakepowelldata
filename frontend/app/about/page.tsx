export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      <div className="mb-8 sm:mb-12 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-gray-900 mb-2 sm:mb-4">
          About
        </h1>
        <p className="text-sm sm:text-lg text-gray-600 font-light max-w-2xl mx-auto">
          Learn about our data sources, methodology, and how we calculate ramp accessibility
        </p>
      </div>
      
      <div className="max-w-3xl mx-auto space-y-8 sm:space-y-12">
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
  )
}




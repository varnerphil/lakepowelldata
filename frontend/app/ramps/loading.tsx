export default function RampsLoading() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-16">
      <div className="mb-8 sm:mb-12 text-center">
        <div className="h-10 sm:h-14 lg:h-16 bg-gray-200 rounded-lg w-64 mx-auto mb-4 animate-pulse"></div>
        <div className="h-4 sm:h-6 bg-gray-100 rounded w-80 mx-auto animate-pulse"></div>
      </div>
      
      <div className="mb-8 sm:mb-12 card p-6 sm:p-8 text-center animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mx-auto mb-4"></div>
        <div className="h-10 bg-gray-200 rounded w-40 mx-auto mb-4"></div>
        <div className="h-3 bg-gray-100 rounded w-48 mx-auto"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card p-6 animate-pulse">
            <div className="flex items-start mb-4">
              <div className="w-10 h-10 bg-gray-200 rounded-full mr-4"></div>
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-100 rounded w-1/2"></div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-3 bg-gray-100 rounded w-full"></div>
              <div className="h-3 bg-gray-100 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


export default function DashboardLoading() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-12">
      {/* Current Status Skeleton */}
      <div className="card p-4 lg:p-6 mb-6 lg:mb-8 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center">
              <div className="h-3 bg-gray-200 rounded w-20 mx-auto mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-24 mx-auto mb-1"></div>
              <div className="h-3 bg-gray-100 rounded w-16 mx-auto"></div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Skeleton */}
      <div className="card p-4 lg:p-6 mb-6 lg:mb-8 animate-pulse">
        <div className="flex justify-between items-center mb-4">
          <div className="h-6 bg-gray-200 rounded w-32"></div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded w-16"></div>
            ))}
          </div>
        </div>
        <div className="h-64 lg:h-80 bg-gray-100 rounded"></div>
      </div>

      {/* Favorites/Ramps Skeleton */}
      <div className="card p-4 lg:p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded"></div>
          ))}
        </div>
      </div>
    </div>
  )
}


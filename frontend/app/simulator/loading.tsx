export default function SimulatorLoading() {
  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-12 lg:py-16">
      <div className="mb-8 sm:mb-12 text-center">
        <div className="h-10 sm:h-14 lg:h-16 bg-gray-200 rounded-lg w-72 mx-auto mb-4 animate-pulse"></div>
        <div className="h-4 sm:h-6 bg-gray-100 rounded w-80 mx-auto animate-pulse"></div>
      </div>
      
      <div className="card p-4 sm:p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="h-10 bg-gray-100 rounded"></div>
          <div className="h-10 bg-gray-100 rounded"></div>
        </div>
        <div className="h-64 sm:h-80 lg:h-96 bg-gray-100 rounded mb-6"></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="h-16 bg-gray-100 rounded"></div>
          <div className="h-16 bg-gray-100 rounded"></div>
          <div className="h-16 bg-gray-100 rounded"></div>
          <div className="h-16 bg-gray-100 rounded"></div>
        </div>
      </div>
    </div>
  )
}


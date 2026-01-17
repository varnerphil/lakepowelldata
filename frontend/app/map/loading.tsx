export default function MapLoading() {
  return (
    <div className="w-full h-[calc(100vh-5rem)] bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
        <p className="text-gray-500 font-light">Loading map...</p>
      </div>
    </div>
  )
}


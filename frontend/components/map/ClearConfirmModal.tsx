'use client'

import { X, AlertTriangle } from 'lucide-react'

interface ClearConfirmModalProps {
  onConfirm: () => void
  onCancel: () => void
}

export default function ClearConfirmModal({ onConfirm, onCancel }: ClearConfirmModalProps) {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" strokeWidth={1.5} />
            </div>
            <h2 className="text-lg font-medium text-gray-900">Clear Path?</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-gray-600 mb-4">
            Are you sure you want to clear all points? This action cannot be undone.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-light"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-light"
            >
              Clear Path
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


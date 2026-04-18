import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const add = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++idCounter
    setToasts(prev => [...prev.slice(-4), { id, message, type }]) // max 5 visible
    setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const toast = {
    success: (msg, dur)  => add(msg, 'success', dur),
    error:   (msg, dur)  => add(msg, 'error',   dur ?? 5000),
    info:    (msg, dur)  => add(msg, 'info',     dur),
    warning: (msg, dur)  => add(msg, 'warning',  dur),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Toast stack — bottom-right */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
              max-w-xs pointer-events-auto animate-slide-in
              ${t.type === 'success' ? 'bg-green-600 text-white' :
                t.type === 'error'   ? 'bg-red-600 text-white'   :
                t.type === 'warning' ? 'bg-amber-500 text-white' :
                                       'bg-navy-900 text-white'}`}
          >
            <span className="text-base leading-none mt-0.5">
              {t.type === 'success' ? '✓' :
               t.type === 'error'   ? '✕' :
               t.type === 'warning' ? '!' : 'i'}
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-60 hover:opacity-100 text-xs ml-1 leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

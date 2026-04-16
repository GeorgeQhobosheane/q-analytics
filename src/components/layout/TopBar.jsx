import NotificationBell from '../notifications/NotificationBell'

export default function TopBar({ title, onMenuToggle, onNavigate }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center
      justify-between px-4 lg:px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-navy-900">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell onNavigate={onNavigate} />
      </div>
    </header>
  )
}

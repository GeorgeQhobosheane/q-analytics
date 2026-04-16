import { useState, useEffect, useRef } from 'react'
import { useNotifications } from '../../hooks/useNotifications'

// ── Notification metadata helpers ─────────────────────────────────────────────

const URGENCY_CONFIG = {
  critical: {
    border: 'border-l-red-600',
    dot:    'bg-red-600',
    label:  'Critical',
    labelCls: 'bg-red-100 text-red-700',
  },
  high: {
    border: 'border-l-orange-500',
    dot:    'bg-orange-500',
    label:  'High',
    labelCls: 'bg-orange-100 text-orange-700',
  },
  medium: {
    border: 'border-l-amber-400',
    dot:    'bg-amber-400',
    label:  'Medium',
    labelCls: 'bg-amber-100 text-amber-700',
  },
  low: {
    border: 'border-l-green-500',
    dot:    'bg-green-500',
    label:  'New',
    labelCls: 'bg-green-100 text-green-700',
  },
  info: {
    border: 'border-l-blue-500',
    dot:    'bg-blue-500',
    label:  'Info',
    labelCls: 'bg-blue-100 text-blue-700',
  },
}

function getUrgency(n) {
  if (n.type === 'grant_match') return 'low'
  if (n.type === 'compliance_alert') {
    const t = (n.title ?? '').toUpperCase()
    if (t.includes('CRITICAL')) return 'critical'
    if (t.includes('HIGH'))     return 'high'
    return 'medium'
  }
  return 'info'
}

function getAction(n) {
  if (n.type === 'grant_match')      return { label: 'View Grant',    tab: 'grantradar' }
  if (n.type === 'compliance_alert') return { label: 'See Action',    tab: 'compliancewatch' }
  return                                    { label: 'View Analysis', tab: 'budgetlens' }
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'grants',     label: 'Grants',     types: ['grant_match'] },
  { key: 'compliance', label: 'Compliance', types: ['compliance_alert'] },
  { key: 'budget',     label: 'Budget',     types: ['budget_analysis', 'budget_alert', 'budget'] },
]

// ── Notification card ─────────────────────────────────────────────────────────

function NotificationCard({ n, onRead, onNavigate, onClose }) {
  const urgency = getUrgency(n)
  const cfg     = URGENCY_CONFIG[urgency]
  const action  = getAction(n)

  function handleAction() {
    onRead(n.id)
    onNavigate?.(action.tab)
    onClose()
  }

  function handleCardClick() {
    onRead(n.id)
  }

  return (
    <div
      onClick={handleCardClick}
      className={`border-l-4 ${cfg.border} px-4 py-3.5 cursor-pointer
        transition-colors hover:bg-gray-50
        ${!n.read ? 'bg-blue-50/40' : 'bg-white'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {/* Unread dot */}
          {!n.read && (
            <span className={`flex-shrink-0 mt-1.5 w-2 h-2 rounded-full ${cfg.dot}`} />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
              {n.title}
            </p>
            {n.message && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.message}</p>
            )}
          </div>
        </div>
        <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.labelCls}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center justify-between mt-2.5 pl-4">
        <span className="text-[11px] text-gray-400">{relativeTime(n.created_at)}</span>
        <button
          onClick={e => { e.stopPropagation(); handleAction() }}
          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700
            hover:underline transition-colors"
        >
          {action.label} →
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotificationBell({ onNavigate }) {
  const { notifications, unreadCount, markOneRead, markAllRead } = useNotifications()

  const [open, setOpen]       = useState(false)
  const [activeTab, setActiveTab] = useState('grants')
  const [pulse, setPulse]     = useState(false)
  const prevCountRef          = useRef(0)

  // Pulse badge when unread count increases
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 1000)
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Filtered notifications per tab
  const tabNotifications = (tab) => {
    const cfg = TABS.find(t => t.key === tab)
    if (!cfg) return []
    return notifications.filter(n => cfg.types.includes(n.type))
  }

  const tabUnread = (tab) =>
    tabNotifications(tab).filter(n => !n.read).length

  const visibleNotifications = tabNotifications(activeTab)
  const hasUnreadInTab = tabUnread(activeTab) > 0

  function close() { setOpen(false) }

  return (
    <>
      {/* ── Bell button ────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 text-gray-500 hover:text-navy-900 hover:bg-gray-100
          rounded-full transition-colors"
        aria-label="Open notifications"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0
               00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0
               .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>

        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center">
            {/* Ping ring on new notification */}
            {pulse && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full
                bg-red-500 opacity-60" />
            )}
            <span className="relative inline-flex items-center justify-center rounded-full
              bg-[#DC2626] text-white text-[9px] font-bold leading-none px-1 min-w-[18px] h-[18px]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* ── Backdrop ───────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={close}
        aria-hidden="true"
      />

      {/* ── Drawer ─────────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-50
          flex flex-col transform transition-transform duration-300 ease-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-label="Notifications drawer"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center bg-[#DC2626] text-white
                text-[10px] font-bold rounded-full px-1.5 min-w-[20px] h-5">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasUnreadInTab && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={close}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0 px-1">
          {TABS.map(tab => {
            const count = tabUnread(tab.key)
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold
                  border-b-2 transition-colors ${
                    active
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center rounded-full
                    text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] leading-none ${
                      active
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0
                       00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0
                       .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500">No {TABS.find(t => t.key === activeTab)?.label} notifications</p>
                <p className="text-xs text-gray-400 mt-1">New notifications will appear here</p>
              </div>
            </div>
          ) : (
            visibleNotifications.map(n => (
              <NotificationCard
                key={n.id}
                n={n}
                onRead={markOneRead}
                onNavigate={onNavigate}
                onClose={close}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {visibleNotifications.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
            <p className="text-[11px] text-gray-400 text-center">
              Showing {visibleNotifications.length} notification{visibleNotifications.length !== 1 ? 's' : ''}
              {' · '}Updates in real-time
            </p>
          </div>
        )}
      </div>
    </>
  )
}

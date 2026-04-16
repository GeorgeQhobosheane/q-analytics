import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const TABS = [
  {
    id: 'documind',
    label: 'DocuMind',
    description: 'Upload & chat with docs',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
             01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'grantradar',
    label: 'GrantRadar',
    description: 'Matched grants & proposals',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0
             0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0
             002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'compliancewatch',
    label: 'ComplianceWatch',
    description: 'Regulations & deadlines',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9
             5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'budgetlens',
    label: 'BudgetLens',
    description: 'Budget upload & AI analysis',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11
             0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21
             12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

export default function Sidebar({ activeTab, onSelect, onClose }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex flex-col h-full bg-navy-900 text-white">
      {/* Brand */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-navy-700">
        <div>
          <span className="text-xl font-bold tracking-tight text-white">Q Analytics</span>
          <p className="text-xs text-blue-300 mt-0.5 truncate max-w-[160px]">
            {profile?.agency_name ?? ''}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden text-navy-200 hover:text-white p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav tabs */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { onSelect(tab.id); onClose?.() }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left
              transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-navy-200 hover:bg-navy-800 hover:text-white'
              }`}
          >
            {tab.icon}
            <div>
              <p className="text-sm font-semibold leading-none">{tab.label}</p>
              <p className={`text-xs mt-0.5 ${
                activeTab === tab.id ? 'text-blue-100' : 'text-navy-400'
              }`}>
                {tab.description}
              </p>
            </div>
          </button>
        ))}
      </nav>

      {/* Bottom links */}
      <div className="border-t border-navy-700 px-3 py-4 space-y-1">
        <Link
          to="/account"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-navy-200 hover:bg-navy-800 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573
                 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065
                 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0
                 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0
                 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0
                 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0
                 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0
                 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium">Account</span>
        </Link>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-navy-200 hover:bg-red-600/20 hover:text-red-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0
                 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  )
}

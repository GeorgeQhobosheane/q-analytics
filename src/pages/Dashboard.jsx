import { useState } from 'react'
import Sidebar from '../components/layout/Sidebar'
import TopBar from '../components/layout/TopBar'
import DocuMind from './dashboard/DocuMind'
import GrantRadar from './dashboard/GrantRadar'
import ComplianceWatch from './dashboard/ComplianceWatch'
import BudgetLens from './dashboard/BudgetLens'

const TABS = {
  documind:        { label: 'DocuMind',        Component: DocuMind },
  grantradar:      { label: 'GrantRadar',      Component: GrantRadar },
  compliancewatch: { label: 'ComplianceWatch', Component: ComplianceWatch },
  budgetlens:      { label: 'BudgetLens',      Component: BudgetLens },
}

export default function Dashboard() {
  const [activeTab, setActiveTab]     = useState('documind')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { label, Component } = TABS[activeTab]

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 shadow-lg">
        <Sidebar activeTab={activeTab} onSelect={setActiveTab} />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 z-50 lg:hidden flex flex-col shadow-2xl">
            <Sidebar
              activeTab={activeTab}
              onSelect={setActiveTab}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 lg:pl-64 min-h-screen">
        <TopBar title={label} onMenuToggle={() => setSidebarOpen(v => !v)} onNavigate={setActiveTab} />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Component />
        </main>
      </div>
    </div>
  )
}

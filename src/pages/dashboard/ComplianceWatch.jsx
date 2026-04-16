import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

const URGENCY_VARIANT = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' }
const STATUS_VARIANT  = { pending: 'info', complete: 'success', overdue: 'danger' }

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86_400_000)
}

function getCardBorderColor(item) {
  const today = new Date().toISOString().slice(0, 10)
  const days  = daysUntil(item.deadline)
  if (item.status === 'overdue' || (item.deadline && item.deadline < today && item.status !== 'complete')) {
    return 'border-l-4 border-l-red-500'
  }
  if (item.status === 'complete') {
    return 'border-l-4 border-l-green-500'
  }
  if (item.status === 'pending' && days != null && days >= 0 && days <= 30) {
    return 'border-l-4 border-l-orange-500'
  }
  return ''
}

function DeadlinePill({ deadline }) {
  const days = daysUntil(deadline)
  if (days == null) return null
  const color =
    days < 0  ? 'text-red-600' :
    days <= 30 ? 'text-orange-500' :
                'text-gray-400'
  const label =
    days < 0  ? `${Math.abs(days)}d overdue` :
    days === 0 ? 'Due today' :
                 `${days}d remaining`
  return (
    <span className={`text-xs font-medium ${color}`}>
      {new Date(deadline).toLocaleDateString()} ({label})
    </span>
  )
}

export default function ComplianceWatch() {
  const { user } = useAuth()
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    supabase
      .from('compliance_items')
      .select('*')
      .eq('agency_id', user.id)
      .order('deadline', { ascending: true, nullsFirst: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [user])

  async function markComplete(id) {
    await supabase.from('compliance_items').update({ status: 'complete' }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'complete' } : i))
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter)

  const counts = {
    pending:  items.filter(i => i.status === 'pending').length,
    overdue:  items.filter(i => i.status === 'overdue').length,
    complete: items.filter(i => i.status === 'complete').length,
  }
  const pct = items.length > 0 ? Math.round(counts.complete / items.length * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Compliance progress bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600">Compliance Progress</span>
          <span className="text-xs font-bold text-green-600">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {counts.complete} of {items.length} item{items.length !== 1 ? 's' : ''} complete
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending',  count: counts.pending,  color: 'text-blue-600' },
          { label: 'Overdue',  count: counts.overdue,  color: 'text-red-600' },
          { label: 'Complete', count: counts.complete, color: 'text-green-600' },
        ].map(({ label, count, color }) => (
          <Card key={label} className="p-4">
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'overdue', 'complete'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-navy-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-gray-400 text-sm">
            No compliance items. Items are generated from regulatory digests.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <Card key={item.id} className={`p-5 ${getCardBorderColor(item)}`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-bold text-navy-900">{item.regulation_title}</h3>
                    <Badge variant={STATUS_VARIANT[item.status] ?? 'neutral'}>{item.status}</Badge>
                    {item.urgency && (
                      <Badge variant={URGENCY_VARIANT[item.urgency] ?? 'neutral'}>{item.urgency}</Badge>
                    )}
                  </div>

                  {item.action_required && (
                    <p className="text-sm text-gray-600">{item.action_required}</p>
                  )}

                  {item.deadline && (
                    <div className="mt-1">
                      <DeadlinePill deadline={item.deadline} />
                    </div>
                  )}

                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                    >
                      Regulation source ↗
                    </a>
                  )}
                </div>

                {item.status !== 'complete' && (
                  <button
                    onClick={() => markComplete(item.id)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-green-700
                      bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    Mark Complete
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

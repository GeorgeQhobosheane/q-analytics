import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'

const URGENCY_VARIANT = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' }
const STATUS_VARIANT  = { pending: 'info', complete: 'success', overdue: 'danger' }
const URGENCY_ORDER   = { critical: 0, high: 1, medium: 2, low: 3 }

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
  if (item.status === 'complete') return 'border-l-4 border-l-green-500'
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

/** Parse SUMMARY: / ACTION: / CONSEQUENCE: sections from action_required text */
function parseActionRequired(text) {
  if (!text) return null
  const parts = {}
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=\n\nACTION:|$)/)
  const actionMatch  = text.match(/ACTION:\s*([\s\S]*?)(?=\n\nCONSEQUENCE:|$)/)
  const consequenceMatch = text.match(/CONSEQUENCE:\s*([\s\S]*)/)
  if (summaryMatch)     parts.summary     = summaryMatch[1].trim()
  if (actionMatch)      parts.action      = actionMatch[1].trim()
  if (consequenceMatch) parts.consequence = consequenceMatch[1].trim()
  if (!parts.summary && !parts.action) return null // plain text, no markers
  return parts
}

/** Sort: overdue first, then by urgency, then by deadline asc */
function sortItems(items) {
  return [...items].sort((a, b) => {
    const today = new Date().toISOString().slice(0, 10)
    const aOver = a.status === 'overdue' || (a.deadline && a.deadline < today && a.status !== 'complete')
    const bOver = b.status === 'overdue' || (b.deadline && b.deadline < today && b.status !== 'complete')
    if (aOver !== bOver) return aOver ? -1 : 1
    const urgDiff = (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9)
    if (urgDiff !== 0) return urgDiff
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return a.deadline.localeCompare(b.deadline)
  })
}

export default function ComplianceWatch() {
  const { user } = useAuth()
  const toast    = useToast()
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter]   = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    supabase
      .from('compliance_items')
      .select('*')
      .eq('agency_id', user.id)
      .then(({ data }) => { setItems(sortItems(data ?? [])); setLoading(false) })
  }, [user])

  async function setStatus(id, newStatus) {
    const prev = items.find(i => i.id === id)?.status
    setItems(prev => sortItems(prev.map(i => i.id === id ? { ...i, status: newStatus } : i)))
    const { error } = await supabase.from('compliance_items').update({ status: newStatus }).eq('id', id)
    if (error) {
      toast.error('Failed to update status')
      setItems(prev => sortItems(prev.map(i => i.id === id ? { ...i, status: prev } : i)))
    } else {
      toast.success(newStatus === 'complete' ? 'Marked complete' : 'Reverted to pending')
    }
  }

  const filtered = items.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (urgencyFilter !== 'all' && i.urgency !== urgencyFilter) return false
    return true
  })

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

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600">Compliance Progress</span>
          <span className="text-xs font-bold text-green-600">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {counts.complete} of {items.length} item{items.length !== 1 ? 's' : ''} complete
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending',  count: counts.pending,  color: 'text-blue-600'  },
          { label: 'Overdue',  count: counts.overdue,  color: 'text-red-600'   },
          { label: 'Complete', count: counts.complete, color: 'text-green-600' },
        ].map(({ label, count, color }) => (
          <Card key={label} className="p-4">
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Status filter */}
        <div className="flex gap-1">
          {['all', 'pending', 'overdue', 'complete'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === f
                  ? 'bg-navy-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Urgency filter */}
        <div className="flex gap-1 ml-auto">
          {['all', 'critical', 'high', 'medium', 'low'].map(u => (
            <button key={u} onClick={() => setUrgencyFilter(u)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                urgencyFilter === u
                  ? 'bg-red-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {u === 'all' ? 'All urgency' : u}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-gray-400 text-sm">
            {items.length === 0
              ? 'No compliance items. Items are generated from regulatory digests.'
              : 'No items match your current filters.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const parsed = parseActionRequired(item.action_required)
            return (
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

                    {/* Parsed action_required sections */}
                    {parsed ? (
                      <div className="space-y-2 mt-2">
                        {parsed.summary && (
                          <p className="text-sm text-gray-700 leading-snug">{parsed.summary}</p>
                        )}
                        {parsed.action && (
                          <div className="bg-blue-50 border-l-2 border-blue-400 pl-3 py-1 rounded-r-lg">
                            <p className="text-xs font-bold text-blue-700 mb-0.5">Required Action</p>
                            <p className="text-xs text-blue-800 leading-snug">{parsed.action}</p>
                          </div>
                        )}
                        {parsed.consequence && (
                          <div className="bg-amber-50 border-l-2 border-amber-400 pl-3 py-1 rounded-r-lg">
                            <p className="text-xs font-bold text-amber-700 mb-0.5">Consequence of Inaction</p>
                            <p className="text-xs text-amber-800 leading-snug">{parsed.consequence}</p>
                          </div>
                        )}
                      </div>
                    ) : item.action_required ? (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{item.action_required}</p>
                    ) : null}

                    {item.deadline && (
                      <div className="mt-2">
                        <DeadlinePill deadline={item.deadline} />
                      </div>
                    )}

                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                        Regulation source ↗
                      </a>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {item.status !== 'complete' ? (
                      <button
                        onClick={() => setStatus(item.id, 'complete')}
                        className="px-3 py-1.5 text-xs font-semibold text-green-700
                          bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        Mark Complete
                      </button>
                    ) : (
                      <button
                        onClick={() => setStatus(item.id, 'pending')}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-600
                          bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Revert to Pending
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

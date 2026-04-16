import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import GrantWriter from './GrantWriter'

const STATUS_VARIANT = {
  new: 'info', saved: 'navy', applied: 'warning', awarded: 'success', declined: 'neutral',
}

function formatRange(min, max) {
  const f = v => v != null ? `$${Number(v).toLocaleString()}` : null
  if (f(min) && f(max)) return `${f(min)} – ${f(max)}`
  return f(min) ?? f(max) ?? '—'
}

export default function GrantRadar() {
  const { user } = useAuth()
  const [grants, setGrants]         = useState([])
  const [proposals, setProposals]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState('grants')
  const [writerGrant, setWriterGrant] = useState(null)  // grant row to write proposal for

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('grant_matches').select('*').eq('agency_id', user.id)
        .order('match_score', { ascending: false }),
      supabase.from('grant_proposals').select('*').eq('agency_id', user.id)
        .order('created_at', { ascending: false }),
    ]).then(([{ data: g }, { data: p }]) => {
      setGrants(g ?? [])
      setProposals(p ?? [])
      setLoading(false)
    })
  }, [user])

  async function setStatus(id, status) {
    await supabase.from('grant_matches').update({ status }).eq('id', id)
    setGrants(prev => prev.map(g => g.id === id ? { ...g, status } : g))
  }

  function handleProposalSaved() {
    // Refresh proposals list after saving a new draft
    supabase
      .from('grant_proposals')
      .select('*')
      .eq('agency_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setProposals(data ?? []))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
    {/* Grant Writer full-screen overlay */}
    {writerGrant && (
      <GrantWriter
        grant={writerGrant}
        onClose={() => setWriterGrant(null)}
        onSaved={() => { handleProposalSaved(); setView('proposals') }}
      />
    )}

    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex gap-2">
        {[
          { key: 'grants',    label: `Matched Grants (${grants.length})` },
          { key: 'proposals', label: `Proposals (${proposals.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              view === key
                ? 'bg-navy-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grants */}
      {view === 'grants' && (
        <div className="space-y-3">
          {grants.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-gray-400 text-sm">
                No grant matches yet. Matches are generated automatically from your agency profile.
              </p>
            </Card>
          ) : grants.map(grant => (
            <Card key={grant.id} className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-bold text-navy-900">{grant.grant_title}</h3>
                    <Badge variant={STATUS_VARIANT[grant.status] ?? 'neutral'}>{grant.status}</Badge>
                    {grant.match_score != null && (
                      <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        {grant.match_score}% match
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatRange(grant.amount_min, grant.amount_max)}
                    {grant.deadline && ` · Deadline: ${new Date(grant.deadline).toLocaleDateString()}`}
                  </p>
                  {grant.qualify_reason && (
                    <p className="text-sm text-gray-600 mt-2">{grant.qualify_reason}</p>
                  )}
                  {grant.action_items && (
                    <p className="text-xs text-blue-700 font-medium mt-1">
                      Next step: {grant.action_items}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  {grant.source_url && (
                    <a
                      href={grant.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                    >
                      Source ↗
                    </a>
                  )}
                  {/* Draft Proposal button — opens GrantWriter overlay */}
                  <button
                    onClick={() => setWriterGrant(grant)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-900 hover:bg-navy-800
                      text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                           m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    Draft Proposal
                  </button>
                  <select
                    value={grant.status}
                    onChange={e => setStatus(grant.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white
                      focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {['new','saved','applied','awarded','declined'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Proposals */}
      {view === 'proposals' && (
        <div className="space-y-3">
          {proposals.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-gray-400 text-sm">
                No proposals yet. Save a grant match to auto-generate a draft proposal.
              </p>
            </Card>
          ) : proposals.map(p => (
            <Card key={p.id} className="p-5">
              <div className="flex items-center justify-between mb-2">
                <Badge variant={p.status === 'submitted' ? 'success' : 'info'}>{p.status}</Badge>
                <span className="text-xs text-gray-400">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-5">
                {p.draft_content ?? 'No draft content yet.'}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
    </>
  )
}

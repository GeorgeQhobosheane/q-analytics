import { useState, useRef, useEffect } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

// ── Constants ─────────────────────────────────────────────────────────────────
const VIOLET      = '#7C3AED'
const PIE_COLORS  = ['#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE']
const MAX_ROWS_UI = 20    // rows visible in preview before "show more"
const MAX_ROWS_AI = 150   // rows sent to backend

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || n === '' || Number.isNaN(+n)) return '—'
  return '$' + Number(n).toLocaleString('en-US')
}

// ── Upload Zone ───────────────────────────────────────────────────────────────
function UploadZone({ onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  function handleFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      alert('Please upload an .xlsx, .xls, or .csv file.')
      return
    }
    onFile(file)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer
        transition-all duration-200 select-none ${
          dragging
            ? 'border-violet-500 bg-violet-50 scale-[1.01]'
            : 'border-gray-300 hover:border-violet-400 hover:bg-gray-50'
        }`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
      onClick={() => inputRef.current.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => handleFile(e.target.files[0])}
      />
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586
                 a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-800">
            {dragging ? 'Release to upload' : 'Drop your budget file here'}
          </p>
          <p className="text-sm text-gray-400 mt-1">or click to browse</p>
        </div>
        <div className="flex gap-2 mt-1">
          {['XLSX', 'XLS', 'CSV'].map(f => (
            <span key={f} className="px-2.5 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-full">
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Pie chart inner label (% on each slice) ───────────────────────────────────
const RADIAN = Math.PI / 180
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 700, pointerEvents: 'none' }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BudgetLens() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase]           = useState('upload') // upload | parsing | analyzing | ready
  const [file, setFile]             = useState(null)
  const [headers, setHeaders]       = useState([])
  const [rows, setRows]             = useState([])
  const [csvData, setCsvData]       = useState('')
  const [showAllRows, setShowAllRows] = useState(false)
  const [analysis, setAnalysis]     = useState(null)
  const [analysisError, setAnalysisError] = useState(null)
  const [messages, setMessages]     = useState([])
  const [question, setQuestion]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [exporting, setExporting]   = useState(false)

  const chatEndRef = useRef()
  const streamRef  = useRef('')   // accumulates streaming text outside React state

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── File parsing ─────────────────────────────────────────────────────────────
  async function parseFile(f) {
    setFile(f)
    setPhase('parsing')
    setAnalysis(null)
    setAnalysisError(null)
    setMessages([])
    setCsvData('')
    setShowAllRows(false)

    try {
      // Dynamic import keeps SheetJS (~1MB) out of the initial bundle
      const xlsxMod = await import('xlsx')
      const XLSX    = xlsxMod.default ?? xlsxMod
      const buf     = await f.arrayBuffer()

      let wb
      if (f.name.toLowerCase().endsWith('.csv')) {
        wb = XLSX.read(new TextDecoder().decode(buf), { type: 'string' })
      } else {
        wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      }

      const sheet    = wb.Sheets[wb.SheetNames[0]]
      const raw      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
      const nonEmpty = raw.filter(row => row.some(cell => cell !== '' && cell != null))

      if (nonEmpty.length < 2) throw new Error('File appears empty or has no data rows.')

      const hdrs     = nonEmpty[0].map(h => String(h).trim())
      const dataRows = nonEmpty.slice(1).map(row =>
        hdrs.map((_, i) => (row[i] == null ? '' : row[i]))
      )

      setHeaders(hdrs)
      setRows(dataRows)

      // Build CSV string for the backend (capped at MAX_ROWS_AI rows)
      const csvLines = [
        hdrs.join(','),
        ...dataRows.slice(0, MAX_ROWS_AI).map(row =>
          row.map(cell => {
            const s = String(cell).replace(/"/g, '""')
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
          }).join(',')
        ),
      ]
      const csv = csvLines.join('\n')
      setCsvData(csv)

      setPhase('analyzing')
      await runAnalysis(csv, f.name)
    } catch (err) {
      console.error('BudgetLens parse error:', err)
      setAnalysisError(err.message || 'Failed to parse file.')
      setPhase('ready')
    }
  }

  // ── Auto-analysis ─────────────────────────────────────────────────────────────
  async function runAnalysis(csv, filename) {
    try {
      const res = await fetch('/api/budget-lens/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data: csv, filename }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }
      setAnalysis(await res.json())
    } catch (err) {
      console.error('BudgetLens analysis error:', err)
      setAnalysisError(err.message || 'Analysis failed.')
    } finally {
      setPhase('ready')
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────
  async function sendQuestion() {
    const q = question.trim()
    if (!q || chatLoading || !csvData) return
    setQuestion('')
    setChatLoading(true)

    // Build history from all complete Q&A pairs already in state
    const history = []
    for (let i = 0; i + 1 < messages.length; i += 2) {
      if (messages[i].role === 'user' && messages[i + 1]?.role === 'assistant') {
        history.push({ question: messages[i].content, answer: messages[i + 1].content })
      }
    }

    streamRef.current = ''
    setMessages(prev => [
      ...prev,
      { role: 'user',      content: q },
      { role: 'assistant', content: '' },  // placeholder filled by stream
    ])

    try {
      const res = await fetch('/api/budget-lens/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ data: csvData, question: q, history }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.text) {
              streamRef.current += evt.text
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: streamRef.current }
                return next
              })
            }
            if (evt.error) {
              streamRef.current = `Error: ${evt.error}`
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: streamRef.current }
                return next
              })
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: `Error: ${err.message}` }
        return next
      })
    } finally {
      setChatLoading(false)
    }
  }

  // ── PDF export ────────────────────────────────────────────────────────────────
  function exportPDF() {
    if (exporting) return
    setExporting(true)

    const today = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })

    const summaryHtml = (analysis?.summary ?? [])
      .map(b => `<li style="margin-bottom:8px">${b}</li>`)
      .join('')

    const catRows = (analysis?.top_categories ?? [])
      .map((c, i) => `
        <tr style="background:${i % 2 ? '#ffffff' : '#f9fafb'}">
          <td style="padding:8px 12px">${c.name}</td>
          <td style="padding:8px 12px;text-align:right">${fmt(c.amount)}</td>
          <td style="padding:8px 12px;text-align:right">
            ${c.percentage != null ? c.percentage.toFixed(1) + '%' : '—'}
          </td>
        </tr>`)
      .join('')

    const yoyRows = (analysis?.yoy_data ?? [])
      .map((d, i) => {
        const change = d.prior ? ((d.current - d.prior) / d.prior * 100).toFixed(1) : null
        return `
        <tr style="background:${i % 2 ? '#ffffff' : '#f9fafb'}">
          <td style="padding:8px 12px">${d.category}</td>
          <td style="padding:8px 12px;text-align:right">${fmt(d.prior)}</td>
          <td style="padding:8px 12px;text-align:right">${fmt(d.current)}</td>
          <td style="padding:8px 12px;text-align:right;
            color:${change != null && +change >= 0 ? '#dc2626' : '#16a34a'}">
            ${change != null ? (change >= 0 ? '+' : '') + change + '%' : '—'}
          </td>
        </tr>`
      })
      .join('')

    const grantsHtml = (analysis?.grant_opportunities ?? [])
      .map(g => `
        <div style="border:1px solid #e5e7eb;border-left:4px solid ${VIOLET};
          border-radius:8px;padding:12px 16px;margin-bottom:10px">
          <strong style="font-size:14px">${g.name}</strong>
          <div style="color:${VIOLET};font-size:13px;margin:4px 0">
            ${g.agency} · ${g.estimated_amount}
          </div>
          <div style="color:#6b7280;font-size:13px">${g.match_reason}</div>
        </div>`)
      .join('')

    const chatHtml = messages
      .map(m => `
        <div style="margin-bottom:10px;padding:10px 14px;border-radius:8px;
          background:${m.role === 'user' ? '#f5f3ff' : '#f9fafb'};
          border-left:3px solid ${m.role === 'user' ? VIOLET : '#d1d5db'}">
          <strong style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;
            color:${m.role === 'user' ? VIOLET : '#9ca3af'}">
            ${m.role === 'user' ? 'Question' : 'AI Response'}
          </strong>
          <p style="margin:5px 0 0;font-size:13px;white-space:pre-wrap">${m.content}</p>
        </div>`)
      .join('')

    const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<title>BudgetLens — ${file?.name ?? 'Report'}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         color: #1f2937; margin: 0; padding: 40px; max-width: 860px; }
  h1  { color: ${VIOLET}; font-size: 22px; margin: 0 0 4px; }
  h2  { color: ${VIOLET}; font-size: 16px; margin: 28px 0 10px;
        border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .meta { color: #6b7280; font-size: 13px; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  th { background: ${VIOLET}; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
  @media print { body { padding: 20px; } }
</style>
</head><body>

<div style="border-bottom:2px solid ${VIOLET};padding-bottom:14px;margin-bottom:24px">
  <p class="meta">Q Analytics — BudgetLens Report</p>
  <h1>${file?.name ?? 'Budget Analysis'}</h1>
  <p class="meta">
    Generated ${today}
    ${analysis?.total_budget ? ` &middot; Total budget: ${fmt(analysis.total_budget)}` : ''}
    &middot; ${rows.length} rows
  </p>
</div>

<h2>Executive Summary</h2>
<ul style="padding-left:20px;margin:0;line-height:1.7">${summaryHtml}</ul>

${catRows ? `
<h2>Top 5 Spending Categories</h2>
<table>
  <thead><tr>
    <th>Category</th>
    <th style="text-align:right">Amount</th>
    <th style="text-align:right">Share</th>
  </tr></thead>
  <tbody>${catRows}</tbody>
</table>` : ''}

${yoyRows ? `
<h2>Year-over-Year Comparison</h2>
<table>
  <thead><tr>
    <th>Category</th>
    <th style="text-align:right">Prior Year</th>
    <th style="text-align:right">Current Year</th>
    <th style="text-align:right">Change</th>
  </tr></thead>
  <tbody>${yoyRows}</tbody>
</table>` : ''}

${grantsHtml ? `<h2>Matched Grant Opportunities</h2>${grantsHtml}` : ''}

${chatHtml ? `<h2>AI Analysis Session</h2>${chatHtml}` : ''}

</body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    setTimeout(() => { win.print(); setExporting(false) }, 500)
  }

  // ── Reset ─────────────────────────────────────────────────────────────────────
  function reset() {
    setPhase('upload')
    setFile(null)
    setHeaders([])
    setRows([])
    setCsvData('')
    setAnalysis(null)
    setAnalysisError(null)
    setMessages([])
    setShowAllRows(false)
  }

  // ── Render: upload phase ──────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">BudgetLens</h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload a municipal budget spreadsheet for AI-powered analysis, charts, and grant matching
          </p>
        </div>
        <UploadZone onFile={parseFile} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '📊', label: 'Spending breakdown by category' },
            { icon: '📈', label: 'Year-over-year comparison' },
            { icon: '📝', label: 'Plain English executive summary' },
            { icon: '💰', label: 'Matched grant opportunities' },
          ].map(({ icon, label }) => (
            <div key={label} className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
              <div className="text-xl mb-1">{icon}</div>
              <p className="text-xs text-violet-700 font-medium leading-snug">{label}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Render: loading phase ─────────────────────────────────────────────────────
  if (phase === 'parsing' || phase === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-gray-600">
          {phase === 'parsing' ? 'Parsing budget file…' : 'Generating AI analysis…'}
        </p>
        {phase === 'analyzing' && (
          <p className="text-xs text-gray-400">This may take 15–30 seconds</p>
        )}
      </div>
    )
  }

  // ── Render: ready phase ───────────────────────────────────────────────────────
  const visibleRows = showAllRows ? rows : rows.slice(0, MAX_ROWS_UI)

  return (
    <div className="space-y-5">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-violet-100 flex-shrink-0 flex items-center justify-center">
            <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586
                   a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{file?.name}</p>
            <p className="text-xs text-gray-400">
              {rows.length} rows · {headers.length} columns
              {rows.length > MAX_ROWS_AI && (
                <span className="text-amber-500 ml-1">
                  · first {MAX_ROWS_AI} rows sent to AI
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-white
              border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            New File
          </button>
          <button
            onClick={exportPDF}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700
              text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* ── Analysis error ───────────────────────────────────────────────────── */}
      {analysisError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">
            <strong>Analysis error:</strong> {analysisError}
          </p>
          <button
            onClick={() => csvData && runAnalysis(csvData, file?.name)}
            className="ml-4 flex-shrink-0 text-xs font-semibold text-red-600 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Charts + insights ────────────────────────────────────────────────── */}
      {analysis && (
        <>
          {/* Row 1: Pie chart + Summary + Grants */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Pie: top 5 categories */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900">Top 5 Spending Categories</h3>
              {analysis.total_budget != null && (
                <p className="text-xs text-gray-400 mt-0.5 mb-3">
                  Total budget:
                  <span className="font-semibold text-gray-700 ml-1">
                    {fmt(analysis.total_budget)}
                  </span>
                </p>
              )}
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={analysis.top_categories ?? []}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    labelLine={false}
                    label={PieLabel}
                  >
                    {(analysis.top_categories ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [fmt(v), 'Amount']} />
                  <Legend
                    iconSize={10}
                    formatter={value => (
                      <span style={{ fontSize: 11, color: '#4b5563' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Right column: Summary + Grants */}
            <div className="flex flex-col gap-4">

              {/* Executive summary */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex-1">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Executive Summary</h3>
                <ol className="space-y-2.5">
                  {(analysis.summary ?? []).map((bullet, i) => (
                    <li key={i} className="flex gap-2.5 items-start">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100
                        text-violet-700 text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-700 leading-snug">{bullet}</span>
                    </li>
                  ))}
                </ol>
                {analysis.data_notes && (
                  <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 italic">
                    {analysis.data_notes}
                  </p>
                )}
              </div>

              {/* Grant opportunities */}
              {(analysis.grant_opportunities ?? []).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">
                    Matched Grant Opportunities
                  </h3>
                  <div className="space-y-3">
                    {analysis.grant_opportunities.map((g, i) => (
                      <div key={i} className="pl-3 border-l-2 border-violet-400">
                        <p className="text-xs font-semibold text-gray-800">{g.name}</p>
                        <p className="text-xs text-violet-600 font-medium mt-0.5">
                          {g.agency}
                          {g.estimated_amount && ` · ${g.estimated_amount}`}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                          {g.match_reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Year-over-year bar chart (conditional) */}
          {Array.isArray(analysis.yoy_data) && analysis.yoy_data.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Year-over-Year Comparison</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={analysis.yoy_data}
                  margin={{ top: 4, right: 16, bottom: 4, left: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={v => [fmt(v), '']} />
                  <Legend
                    iconSize={10}
                    formatter={value => (
                      <span style={{ fontSize: 11, color: '#4b5563' }}>{value}</span>
                    )}
                  />
                  <Bar dataKey="prior"   name="Prior Year"   fill="#C4B5FD" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="current" name="Current Year" fill={VIOLET}  radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ── Budget data preview ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Budget Data Preview</h3>
          <span className="text-xs text-gray-400">{rows.length} rows total</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-violet-50">
                {headers.map((h, i) => (
                  <th key={i}
                    className="px-3 py-2.5 text-left font-semibold text-violet-800 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {row.map((cell, ci) => (
                    <td key={ci}
                      className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-xs truncate">
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > MAX_ROWS_UI && (
          <div className="px-5 py-3 border-t border-gray-100 text-center">
            <button
              onClick={() => setShowAllRows(v => !v)}
              className="text-xs font-semibold text-violet-600 hover:underline"
            >
              {showAllRows ? `Show fewer rows` : `Show all ${rows.length} rows`}
            </button>
          </div>
        )}
      </div>

      {/* ── Chat interface ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6
                   a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
            </svg>
          </div>
          <h3 className="text-sm font-bold text-gray-900">Ask the AI Analyst</h3>
          <span className="text-xs text-gray-400 ml-auto">Powered by Claude</span>
        </div>

        {/* Messages */}
        <div className="h-72 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-gray-400">
                Ask any question about this budget
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  'What are the biggest spending increases?',
                  'Where can we find savings?',
                  'Which departments are over budget?',
                  'Summarize capital expenditures',
                  "What's the revenue vs. expenditure gap?",
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => setQuestion(s)}
                    className="px-3 py-1.5 text-xs bg-violet-50 text-violet-700
                      rounded-full border border-violet-200 hover:bg-violet-100 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {msg.content
                    ? <span className="whitespace-pre-wrap">{msg.content}</span>
                    : <span className="flex gap-1 items-center py-0.5">
                        {[0, 150, 300].map(d => (
                          <span key={d}
                            className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </span>
                  }
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuestion()}
            placeholder="Ask about spending, trends, savings opportunities…"
            className="flex-1 text-sm px-4 py-2 border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent
              disabled:bg-gray-50 disabled:text-gray-400"
            disabled={chatLoading || !csvData}
          />
          <button
            onClick={sendQuestion}
            disabled={chatLoading || !question.trim() || !csvData}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm
              font-semibold rounded-lg transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

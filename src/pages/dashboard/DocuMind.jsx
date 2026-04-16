import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../lib/supabase'   // used for document list + upload
import { useAuth } from '../../context/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

export default function DocuMind() {
  const { user } = useAuth()
  const [documents, setDocuments]   = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [messages, setMessages]     = useState([])
  const [question, setQuestion]     = useState('')
  const [uploading, setUploading]   = useState(false)
  const [asking, setAsking]         = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(true)
  const fileRef    = useRef(null)
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('documents')
      .select('*')
      .eq('uploaded_by', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setDocuments(data ?? []); setLoadingDocs(false) })
  }, [user])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const path = `${user.id}/${Date.now()}_${file.name}`
      const { error: storageErr } = await supabase.storage.from('documents').upload(path, file)
      if (storageErr) throw storageErr

      const { data: doc, error: dbErr } = await supabase
        .from('documents')
        .insert({ uploaded_by: user.id, file_name: file.name, file_path: path, file_size: file.size })
        .select()
        .single()
      if (dbErr) throw dbErr

      setDocuments(prev => [doc, ...prev])
    } catch (err) {
      alert(err.message)
    } finally {
      setUploading(false)
      fileRef.current.value = ''
    }
  }

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim() || !selectedDoc) return
    const q = question.trim()
    setQuestion('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setAsking(true)
    try {
      const res = await fetch('/api/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          user_id:     user.id,
          document_id: selectedDoc.id,
          question:    q,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`)
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setAsking(false)
    }
  }

  function selectDoc(doc) {
    setSelectedDoc(doc)
    setMessages([])
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ minHeight: '520px' }}>
      {/* Document list */}
      <Card className="p-4 flex flex-col lg:col-span-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-navy-900 uppercase tracking-wider">Documents</h2>
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            Upload PDF
          </Button>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
        </div>

        {loadingDocs ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            No documents yet. Upload a PDF to get started.
          </p>
        ) : (
          <ul className="space-y-2 overflow-y-auto flex-1">
            {documents.map(doc => (
              <li key={doc.id}>
                <button
                  onClick={() => selectDoc(doc)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    selectedDoc?.id === doc.id
                      ? 'bg-blue-50 border border-blue-200 text-blue-800'
                      : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                  }`}
                >
                  <p className="font-medium truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(doc.file_size / 1024).toFixed(0)} KB
                    {' · '}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Chat panel */}
      <Card className="lg:col-span-2 flex flex-col">
        {!selectedDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
            <svg className="w-14 h-14 text-gray-200 mb-3" fill="none" stroke="currentColor" strokeWidth={1.3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0
                   01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-400 text-sm">Select a document to start the conversation</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-bold text-navy-900 truncate">{selectedDoc.file_name}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  Ask anything about this document.
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-navy-900 text-white rounded-tr-none'
                      : 'bg-gray-100 text-gray-800 rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {asking && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 bg-gray-100 rounded-2xl rounded-tl-none">
                    <div className="flex gap-1">
                      {[0, 150, 300].map(delay => (
                        <span
                          key={delay}
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleAsk} className="px-4 py-4 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                placeholder="Ask a question about this document…"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                disabled={asking}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-xl
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  disabled:bg-gray-50"
              />
              <Button type="submit" loading={asking} disabled={!question.trim()}>
                Send
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}

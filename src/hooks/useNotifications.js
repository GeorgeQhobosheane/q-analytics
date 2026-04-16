import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount]     = useState(0)

  useEffect(() => {
    if (!user) return

    async function fetchNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('agency_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      const rows = data ?? []
      setNotifications(rows)
      setUnreadCount(rows.filter(n => !n.read).length)
    }

    fetchNotifications()

    // Real-time: re-fetch on any change to this agency's notifications
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'notifications',
          filter: `agency_id=eq.${user.id}`,
        },
        fetchNotifications,
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  async function markOneRead(id) {
    const n = notifications.find(n => n.id === id)
    if (!n || n.read) return
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('agency_id', user.id)
      .eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  return { notifications, unreadCount, markOneRead, markAllRead }
}

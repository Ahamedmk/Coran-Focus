import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { useState } from 'react'

export default function Sm2Playground(){
  const session = useSession()
  const [segmentId, setSegmentId] = useState('')
  const [log, setLog] = useState('')
  const [loading, setLoading] = useState(false)

  const signInGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/sm2-test' }
    })
  }
  const signOut = async () => { await supabase.auth.signOut() }

  const run = async () => {
    setLog(''); setLoading(true)
    if(!session) { setLog('❌ Pas connecté'); setLoading(false); return }
    const { error } = await supabase.rpc('complete_segment_and_init_sm2', {
      p_segment_id: Number(segmentId)
    })
    if (error) setLog('❌ RPC error: ' + error.message)
    else {
      const { count } = await supabase
        .from('user_memorization')
        .select('*', { head: true, count: 'exact' })
        .eq('user_id', session.user.id)
      setLog(`✅ OK. Mémos totaux: ${count}`)
    }
    setLoading(false)
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Test init SM-2</h1>
        {session ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">Connecté</span>
            <button onClick={signOut} className="text-sm px-3 py-1.5 rounded bg-slate-200">Se déconnecter</button>
          </div>
        ) : (
          <button onClick={signInGoogle} className="text-sm px-3 py-1.5 rounded bg-emerald-600 text-white">
            Se connecter avec Google
          </button>
        )}
      </div>

      <input
        className="w-full border rounded-lg p-2"
        placeholder="segmentId (program_segments.id)"
        value={segmentId}
        onChange={e=>setSegmentId(e.target.value)}
      />
      <button
        onClick={run}
        disabled={loading || !segmentId}
        className="w-full bg-emerald-600 text-white rounded-lg py-2 disabled:opacity-50"
      >
        {loading ? 'Exécution...' : 'Init SM-2 pour ce segment'}
      </button>
      <pre className="text-sm text-slate-600 whitespace-pre-wrap">{log}</pre>
    </div>
  )
}

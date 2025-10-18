import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input" // si pas généré: remplace par <input className="...">

export default function Login(){
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const signIn = async (e) => {
    e.preventDefault()
    setError(""); setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    else window.location.assign("/") // retour Today
    setLoading(false)
  }

  const signUp = async () => {
    setError(""); setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setError(error.message)
    else alert("Compte créé. Connecte-toi.")
    setLoading(false)
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" })
    if (error) setError(error.message)
  }

  return (
    <div className="max-w-sm mx-auto p-4">
      <Card>
        <CardHeader><CardTitle>Connexion</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={signIn} className="space-y-3">
            <Input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
            <Input type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1">Se connecter</Button>
              <Button type="button" variant="outline" onClick={signUp}>Créer un compte</Button>
            </div>
            <Button type="button" variant="secondary" onClick={signInWithGoogle} className="w-full">Google</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

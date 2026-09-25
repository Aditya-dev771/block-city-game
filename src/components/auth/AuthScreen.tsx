import { FormEvent, useState } from 'react';
import { Leaf, LoaderCircle, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../services/supabase';

export function AuthScreen({initialMode='login',onClose}:{initialMode?:'login'|'signup';onClose?:()=>void}) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [username, setUsername] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    const normalizedEmail=email.trim().toLowerCase();
    if(mode==='signup'){
      const approval=await supabase.rpc('is_alpha_email_approved',{requested_email:normalizedEmail});
      if(approval.error){setBusy(false);setMessage('Unable to verify your Private Alpha invitation. Please try again later.');return;}
      if(!approval.data){setBusy(false);setMessage('This email is not approved for the Private Alpha.');return;}
    }
    const result = mode === 'signup' ? await supabase.auth.signUp({ email:normalizedEmail, password, options: { data: { username: username.trim() } } }) : await supabase.auth.signInWithPassword({ email:normalizedEmail, password });
    setBusy(false); if (result.error) setMessage(result.error.message); else if (mode === 'signup' && !result.data.session) setMessage('Check your email to confirm your account.');
  }
  return <main className="min-h-dvh bg-ink p-4 text-cream sm:grid sm:place-items-center">
    <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-5xl overflow-hidden rounded-3xl bg-[#254632] shadow-2xl sm:min-h-0 sm:grid-cols-[1.1fr_.9fr]">
      <section className="relative hidden min-h-[580px] overflow-hidden p-10 sm:block"><div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#6d9b67,transparent_35%),radial-gradient(circle_at_75%_70%,#c49a52,transparent_35%)] opacity-80"/><div className="absolute bottom-[-9rem] left-[-5rem] h-80 w-80 rounded-full bg-[#789b57]"/><div className="absolute right-8 top-20 text-[9rem] opacity-40">🏡</div><div className="relative z-10"><p className="text-xs font-bold uppercase tracking-[.35em] text-gold">Season 0</p><h1 className="mt-3 max-w-md font-display text-5xl font-bold leading-tight">A small town with a big future.</h1><p className="mt-5 max-w-md text-cream/70">Build a life, master a craft, and help shape the Founding Era.</p></div></section>
      <section className="relative flex min-h-full flex-col justify-center bg-cream p-6 text-ink sm:p-10">{onClose?<button onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 hover:bg-ink/10" aria-label="Close authentication"><X className="h-5 w-5"/></button>:null}<div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-moss p-2 text-cream"><Leaf/></span><div><p className="font-display text-xl font-bold">Founding Era</p><p className="text-xs uppercase tracking-widest text-ink/50">Private Alpha</p></div></div><h2 className="font-display text-3xl font-bold">{mode === 'login' ? 'Welcome home' : 'Become a founder'}</h2><p className="mt-2 text-sm text-ink/60">{mode === 'login' ? 'Continue your resident’s story.' : 'Use your approved Alpha email. Progress and economy values may change during testing.'}</p>
        {!isSupabaseConfigured && <p className="mt-4 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">Add the Supabase variables from <code>.env.example</code> to begin.</p>}
        <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">{mode === 'signup' && <label className="field">Username<input required minLength={3} maxLength={24} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Town name"/></label>}<label className="field">Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"/></label><label className="field">Password<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"/></label>{message && <p className="rounded-lg bg-ink/5 p-3 text-sm">{message}</p>}<button disabled={busy || !isSupabaseConfigured} className="flex w-full items-center justify-center gap-2 rounded-xl bg-moss px-4 py-3 font-bold text-white disabled:opacity-50">{busy && <LoaderCircle className="h-4 w-4 animate-spin"/>}{mode === 'login' ? 'Enter town' : 'Create account'}</button></form>
        <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }} className="mt-5 text-sm font-semibold text-moss">{mode === 'login' ? 'New here? Create an account' : 'Already a founder? Log in'}</button>
      </section>
    </div>
  </main>;
}

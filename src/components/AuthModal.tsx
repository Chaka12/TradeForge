'use client';

import { useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { LogIn, UserPlus, X, Shield } from 'lucide-react';

export function AuthModal() {
  const showAuthModal = useAppStore((s) => s.showAuthModal);
  const authMode = useAppStore((s) => s.authMode);
  const setAuthMode = useAppStore((s) => s.setAuthMode);
  const setShowAuthModal = useAppStore((s) => s.setShowAuthModal);
  const login = useAppStore((s) => s.login);
  const signup = useAppStore((s) => s.signup);
  const currentUser = useAppStore((s) => s.currentUser);
  const logout = useAppStore((s) => s.logout);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!showAuthModal && currentUser) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'login') {
      login(username, password);
    } else {
      if (!email) return;
      signup(username, email, password);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-xl border shadow-2xl" style={{ background: '#1a1a2e', borderColor: '#2a2a4a' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid #2a2a4a' }}>
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-emerald-400" />
            <span className="text-sm font-semibold text-gray-100">TradeForge</span>
          </div>
          <button onClick={() => setShowAuthModal(false)} className="text-gray-500 hover:text-gray-300"><X className="size-4" /></button>
        </div>

        {currentUser ? (
          /* Logged in state */
          <div className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                <span className="text-emerald-400 font-bold text-lg">{currentUser.username[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100">{currentUser.username}</p>
                <p className="text-xs text-gray-500">Account active</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">Your drawings and analysis are automatically saved to your device and will persist between sessions.</p>
            <Button onClick={logout} className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs" variant="ghost">Sign Out</Button>
          </div>
        ) : (
          /* Login/Signup form */
          <form onSubmit={handleSubmit} className="p-4">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors ${authMode === 'login' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'}`}
                onClick={() => setAuthMode('login')}
              >
                <LogIn className="size-3.5" /> Sign In
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors ${authMode === 'signup' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'}`}
                onClick={() => setAuthMode('signup')}
              >
                <UserPlus className="size-3.5" /> Create Account
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <Label className="text-xs text-gray-300 mb-1 block">Username</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="trader42"
                  className="h-9 text-sm" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }}
                  required
                />
              </div>
              {authMode === 'signup' && (
                <div>
                  <Label className="text-xs text-gray-300 mb-1 block">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@example.com"
                    className="h-9 text-sm" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }}
                    required
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-gray-300 mb-1 block">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 text-sm" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }}
                  required
                  minLength={3}
                />
              </div>
            </div>

            <Button type="submit" className={`w-full mt-4 text-xs font-semibold ${authMode === 'login' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
            >
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>

            {authMode === 'login' && (
              <p className="text-[10px] text-gray-600 text-center mt-3">No account? Data is saved to your device by default.</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

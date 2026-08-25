'use client';

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type SidebarTab = 'symbols' | 'orders' | 'positions' | 'account' | 'journal' | 'indicators' | 'drawings' | 'broker';

type Theme = 'light' | 'dark';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  createdAt: number;
  lastLogin: number;
}

export interface BrokerConnection {
  id: string;
  name: string;
  type: 'demo' | 'mt4' | 'mt5' | 'ctrader' | 'dxtrade' | 'custom';
  server?: string;
  login?: string;
  connected: boolean;
  lastConnected?: number;
}

interface AppState {
  sidebarTab: SidebarTab;
  showOrderDialog: boolean;
  orderDialogSide: 'buy' | 'sell';
  showSettings: boolean;
  toasts: Toast[];
  theme: Theme;

  // Mobile
  mobileMenuOpen: boolean;
  isFullscreen: boolean;
  showMobileBuySell: boolean;

  // Auth
  currentUser: UserAccount | null;
  showAuthModal: boolean;
  authMode: 'login' | 'signup';

  // Broker
  brokerConnections: BrokerConnection[];
  activeBrokerId: string | null;

  // Actions
  setSidebarTab: (t: SidebarTab) => void;
  setShowOrderDialog: (v: boolean) => void;
  setOrderDialogSide: (s: 'buy' | 'sell') => void;
  setShowSettings: (v: boolean) => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  setTheme: (t: Theme) => void;

  // Mobile actions
  setMobileMenuOpen: (v: boolean) => void;
  toggleFullscreen: () => void;
  toggleMobileBuySell: () => void;

  // Auth actions
  setShowAuthModal: (v: boolean) => void;
  setAuthMode: (m: 'login' | 'signup') => void;
  login: (username: string, password: string) => boolean;
  signup: (username: string, email: string, password: string) => boolean;
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let toastCounter = 0;

function createToast(message: string, type: 'success' | 'error' | 'info'): Toast {
  return { id: `toast_${Date.now()}_${++toastCounter}`, message, type };
}

// ---------------------------------------------------------------------------
// LocalStorage auth helpers
// ---------------------------------------------------------------------------

function getStoredUsers(): Array<{ username: string; email: string; password: string; id: string; createdAt: number; lastLogin: number }> {
  try { return JSON.parse(localStorage.getItem('tradeforge_users') || '[]'); } catch { return []; }
}

function saveUsers(users: Array<{ username: string; email: string; password: string; id: string; createdAt: number; lastLogin: number }>) {
  try { localStorage.setItem('tradeforge_users', JSON.stringify(users)); } catch { /* */ }
}

function getCurrentSession(): { userId: string; username: string } | null {
  try { return JSON.parse(localStorage.getItem('tradeforge_session') || 'null'); } catch { return null; }
}

function saveSession(userId: string, username: string) {
  try { localStorage.setItem('tradeforge_session', JSON.stringify({ userId, username })); } catch { /* */ }
}

function clearSession() {
  try { localStorage.removeItem('tradeforge_session'); } catch { /* */ }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// Restore session on load
const initialSession = typeof window !== 'undefined' ? getCurrentSession() : null;
// Restore theme on load
const storedTheme = typeof window !== 'undefined' ? (localStorage.getItem('tradeforge_theme') as Theme | null) : null;

export const useAppStore = create<AppState>((set, get) => ({
  sidebarTab: 'positions',
  showOrderDialog: false,
  orderDialogSide: 'buy',
  showSettings: false,
  toasts: [],
  theme: storedTheme ?? 'dark',

  // Mobile
  mobileMenuOpen: false,
  isFullscreen: false,
  showMobileBuySell: false,

  // Auth
  currentUser: initialSession ? { id: initialSession.userId, username: initialSession.username, email: '', createdAt: Date.now(), lastLogin: Date.now() } : null,
  showAuthModal: false,
  authMode: 'login',

  // Broker
  brokerConnections: [],
  activeBrokerId: null,

  // -- Actions --

  setSidebarTab: (t) => set({ sidebarTab: t }),

  setShowOrderDialog: (v) => set({ showOrderDialog: v }),

  setOrderDialogSide: (s) => set({ orderDialogSide: s }),

  setShowSettings: (v) => set({ showSettings: v }),

  addToast: (message, type) => {
    const toast = createToast(message, type);
    set((state) => ({ toasts: [...state.toasts, toast] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== toast.id) }));
    }, 4000);
  },

  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  setTheme: (t) => {
    set({ theme: t });
    try { localStorage.setItem('tradeforge_theme', t); } catch { /* */ }
  },

  // Mobile
  setMobileMenuOpen: (v) => set({ mobileMenuOpen: v }),

  toggleFullscreen: () => {
    const next = !get().isFullscreen;
    if (typeof document !== 'undefined') {
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }
    set({ isFullscreen: next });
  },

  toggleMobileBuySell: () => set({ showMobileBuySell: !get().showMobileBuySell }),

  // Auth
  setShowAuthModal: (v) => set({ showAuthModal: v }),
  setAuthMode: (m) => set({ authMode: m }),

  login: (username, password) => {
    const users = getStoredUsers();
    const user = users.find((u) => u.username === username);
    if (!user) { get().addToast('User not found', 'error'); return false; }
    if (user.password !== password) { get().addToast('Invalid password', 'error'); return false; }
    user.lastLogin = Date.now();
    saveUsers(users);
    saveSession(user.id, user.username);
    set({ currentUser: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin }, showAuthModal: false });
    get().addToast(`Welcome back, ${user.username}!`, 'success');
    return true;
  },

  signup: (username, email, password) => {
    const users = getStoredUsers();
    if (users.find((u) => u.username === username)) { get().addToast('Username already taken', 'error'); return false; }
    if (users.find((u) => u.email === email)) { get().addToast('Email already registered', 'error'); return false; }
    const newUser = { id: `user_${Date.now()}`, username, email, password, createdAt: Date.now(), lastLogin: Date.now() };
    users.push(newUser);
    saveUsers(users);
    saveSession(newUser.id, newUser.username);
    set({ currentUser: { id: newUser.id, username: newUser.username, email: newUser.email, createdAt: newUser.createdAt, lastLogin: newUser.lastLogin }, showAuthModal: false });
    get().addToast(`Account created! Welcome, ${username}!`, 'success');
    return true;
  },

  logout: () => {
    clearSession();
    set({ currentUser: null });
    get().addToast('Logged out', 'info');
  },
}));

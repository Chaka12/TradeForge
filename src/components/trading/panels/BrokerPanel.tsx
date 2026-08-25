'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore, type BrokerConnection } from '@/stores/app-store';
import { cn } from '@/lib/utils';
import { Plug, Unplug, Plus, Trash2, CheckCircle, AlertCircle, Server } from 'lucide-react';

const BROKER_TYPES: Array<{ value: BrokerConnection['type']; label: string; description: string }> = [
  { value: 'demo', label: 'Demo Account', description: 'Simulated broker for paper trading' },
  { value: 'mt4', label: 'MetaTrader 4', description: 'Connect to MT4 broker server' },
  { value: 'mt5', label: 'MetaTrader 5', description: 'Connect to MT5 broker server' },
  { value: 'ctrader', label: 'cTrader', description: 'Connect to cTrader / Spotware' },
  { value: 'dxtrade', label: 'DXtrade', description: 'Connect to DXtrade platform' },
  { value: 'custom', label: 'Custom REST API', description: 'Connect via custom API endpoint' },
];

export function BrokerPanel() {
  const brokerConnections = useAppStore((s) => s.brokerConnections);
  const activeBrokerId = useAppStore((s) => s.activeBrokerId);
  const addToast = useAppStore((s) => s.addToast);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<BrokerConnection['type']>('demo');
  const [formName, setFormName] = useState('');
  const [formServer, setFormServer] = useState('');
  const [formLogin, setFormLogin] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [testConnection, setTestConnection] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');

  const handleConnect = (conn: BrokerConnection) => {
    // Toggle connection state
    const store = useAppStore.getState();
    const updated = store.brokerConnections.map((c) =>
      c.id === conn.id ? { ...c, connected: !c.connected, lastConnected: !c.connected ? Date.now() : undefined } : c
    );
    useAppStore.setState({ brokerConnections: updated, activeBrokerId: !conn.connected ? conn.id : null });
    addToast(!conn.connected ? `Connected to ${conn.name}` : `Disconnected from ${conn.name}`, !conn.connected ? 'success' : 'info');
  };

  const handleDelete = (id: string) => {
    const updated = useAppStore.getState().brokerConnections.filter((c) => c.id !== id);
    useAppStore.setState({
      brokerConnections: updated,
      activeBrokerId: useAppStore.getState().activeBrokerId === id ? null : useAppStore.getState().activeBrokerId,
    });
    addToast('Broker connection removed', 'info');
  };

  const handleTest = () => {
    setTestConnection('testing');
    // Simulate connection test
    setTimeout(() => {
      setTestConnection(formType === 'demo' ? 'success' : Math.random() > 0.5 ? 'success' : 'fail');
    }, 1500);
  };

  const handleAdd = () => {
    if (!formName.trim()) return;
    const newConn: BrokerConnection = {
      id: `broker_${Date.now()}`,
      name: formName.trim(),
      type: formType,
      server: formServer.trim() || undefined,
      login: formLogin.trim() || undefined,
      connected: false,
    };
    useAppStore.setState({ brokerConnections: [...useAppStore.getState().brokerConnections, newConn] });
    setFormName(''); setFormServer(''); setFormLogin(''); setFormPassword('');
    setShowForm(false);
    addToast(`Added ${newConn.name}`, 'success');
  };

  return (
    <div className="flex flex-col">
      {/* Info banner */}
      <div className="px-3 py-3" style={{ background: 'rgba(6,182,212,0.06)', borderBottom: '1px solid #1e1e3a' }}>
        <div className="flex items-start gap-2">
          <Server className="size-4 text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-gray-200">Broker Connections</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">Connect to external brokers for live trading. Demo mode uses the built-in simulator. All connections are stored locally on your device.</p>
          </div>
        </div>
      </div>

      {/* Existing connections */}
      {brokerConnections.length > 0 && (
        <div>
          {brokerConnections.map((conn) => {
            const isActive = conn.id === activeBrokerId;
            return (
              <div key={conn.id} className="px-3 py-2.5 flex items-center gap-3 transition-colors" style={{ borderBottom: '1px solid #1e1e3a' }}>
                <div className={cn('size-2 rounded-full shrink-0', conn.connected ? 'bg-emerald-400' : 'bg-gray-600')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate">{conn.name}</p>
                  <p className="text-[10px] text-gray-500 capitalize">{conn.type}{conn.server ? ` — ${conn.server}` : ''}</p>
                </div>
                <button
                  className={cn('text-[10px] px-2 py-1 rounded font-medium shrink-0',
                    conn.connected ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                  )}
                  onClick={() => handleConnect(conn)}
                >{conn.connected ? 'Disconnect' : 'Connect'}</button>
                <button className="text-gray-600 hover:text-red-400 shrink-0" onClick={() => handleDelete(conn.id)}><Trash2 className="size-3" /></button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new connection form */}
      {showForm ? (
        <div className="p-3 flex flex-col gap-3" style={{ borderBottom: '1px solid #1e1e3a' }}>
          <p className="text-xs font-semibold text-gray-200">New Connection</p>
          <div>
            <Label className="text-[10px] text-gray-400 mb-1 block">Broker Type</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {BROKER_TYPES.map((bt) => (
                <button key={bt.value}
                  className={cn('text-left px-2 py-1.5 rounded text-[10px] transition-colors',
                    formType === bt.value ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/40' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200'
                  )}
                  onClick={() => setFormType(bt.value)}
                >
                  <span className="font-medium">{bt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-gray-400 mb-1 block">Connection Name</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="My Broker"
              className="h-8 text-xs" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }} />
          </div>
          {formType !== 'demo' && (
            <>
              <div>
                <Label className="text-[10px] text-gray-400 mb-1 block">Server Address</Label>
                <Input value={formServer} onChange={(e) => setFormServer(e.target.value)} placeholder="broker.example.com:443"
                  className="h-8 text-xs" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }} />
              </div>
              <div>
                <Label className="text-[10px] text-gray-400 mb-1 block">Login ID</Label>
                <Input value={formLogin} onChange={(e) => setFormLogin(e.target.value)} placeholder="12345678"
                  className="h-8 text-xs" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }} />
              </div>
              <div>
                <Label className="text-[10px] text-gray-400 mb-1 block">Password</Label>
                <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="••••••••"
                  className="h-8 text-xs" style={{ background: '#0d0d14', borderColor: '#2a2a4a', color: '#e5e7eb' }} />
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <Button onClick={handleTest} size="sm" variant="ghost" className="text-[10px] text-gray-300"
              disabled={testConnection === 'testing'}>
              {testConnection === 'testing' ? 'Testing...' : 'Test Connection'}
            </Button>
            {testConnection === 'success' && <CheckCircle className="size-3 text-emerald-400" />}
            {testConnection === 'fail' && <AlertCircle className="size-3 text-red-400" />}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold">Add Connection</Button>
            <Button onClick={() => setShowForm(false)} size="sm" variant="ghost" className="text-[10px] text-gray-400">Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <button onClick={() => { setShowForm(true); setTestConnection('idle'); }} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-cyan-400 bg-cyan-600/10 hover:bg-cyan-600/20 rounded-md border border-cyan-500/30 transition-colors">
            <Plus className="size-3" /> Add Broker Connection
          </button>
        </div>
      )}
    </div>
  );
}

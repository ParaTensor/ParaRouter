import React, {useEffect, useState} from 'react';
import {motion} from 'motion/react';
import {Server, Activity, RefreshCw, Loader2} from 'lucide-react';
import {apiGet, apiPost} from '../lib/api';
import {localUser} from '../lib/session';

interface Gateway {
  instance_id: string;
  status: string;
  last_seen?: number;
}

export default function HubConsoleView() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = localUser.role === 'admin';
  const [simulating, setSimulating] = useState(false);

  const loadGateways = async () => {
    try {
      const data = await apiGet<Gateway[]>('/api/gateway/list');
      setGateways(data);
    } catch (error) {
      console.error('Load gateways failed:', error);
      setGateways([]);
    } finally {
      setLoading(false);
    }
  };

  const simulateRegistration = async () => {
    setSimulating(true);
    try {
      const id = `gw-sim-${Math.floor(Math.random() * 1000)}`;
      await apiPost('/api/gateway/register', {instance_id: id, status: 'online'});
      await loadGateways();
    } finally {
      setSimulating(false);
    }
  };

  const simulateUsage = async () => {
    setSimulating(true);
    try {
      const models = ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'];
      await apiPost('/api/gateway/usage', {
        model: models[Math.floor(Math.random() * models.length)],
        tokens: Math.floor(Math.random() * 500) + 100,
        latency: Math.floor(Math.random() * 1000) + 200,
        status: 200,
      });
      await loadGateways();
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadGateways();
  }, [isAdmin]);

  if (!isAdmin) {
    return <div className="p-12 border-2 border-dashed rounded-xl text-center text-gray-500">Only administrators can access the Hub Console.</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Hub Console</h2>
        <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Monitoring
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-6 bg-zinc-900 text-white rounded-xl shadow-lg space-y-4 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-800 rounded-lg">
              <RefreshCw className={cn('w-6 h-6', simulating && 'animate-spin')} />
            </div>
            <div>
              <h3 className="font-bold text-lg">Dev Simulator</h3>
              <p className="text-xs text-zinc-500">Test data flow</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button onClick={simulateRegistration} disabled={simulating} className="px-3 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50">
              Mock Gateway
            </button>
            <button onClick={simulateUsage} disabled={simulating} className="px-3 py-2 bg-zinc-800 text-white text-xs font-bold rounded-lg hover:bg-zinc-700 disabled:opacity-50">
              Mock Usage
            </button>
          </div>
        </div>

        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : gateways.length === 0 ? (
          <div className="col-span-full p-12 border-2 border-dashed rounded-xl text-center text-gray-500">No gateways registered yet.</div>
        ) : (
          gateways.map((gw) => (
            <motion.div key={gw.instance_id} initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}} className="p-6 bg-white border rounded-xl shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Server className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{gw.instance_id}</h3>
                  <p className="text-xs text-gray-500 font-mono">ID: {gw.instance_id}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <span className={cn('text-sm font-bold flex items-center gap-2', gw.status === 'online' ? 'text-emerald-600' : 'text-zinc-400')}>
                  <Activity className="w-4 h-4" /> {gw.status.toUpperCase()}
                </span>
                <button className="text-sm font-bold hover:underline">Manage</button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function cn(...classes: Array<string | boolean>) {
  return classes.filter(Boolean).join(' ');
}

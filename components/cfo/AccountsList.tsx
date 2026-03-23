import React from 'react';
import { Landmark, PiggyBank } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  nickname: string | null;
  kind: string;
  current_balance: number;
  status: string;
}

interface Props {
  accounts: Account[];
}

export const AccountsList: React.FC<Props> = ({ accounts }) => {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Mercury Accounts</h3>
      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                {a.kind === 'savings' ? (
                  <PiggyBank size={14} className="text-blue-400" />
                ) : (
                  <Landmark size={14} className="text-slate-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-slate-200">{a.nickname || a.name}</p>
                <p className="text-[10px] text-slate-500 uppercase">{a.kind}</p>
              </div>
            </div>
            <span className={`text-sm font-mono font-semibold ${a.current_balance > 0 ? 'text-white' : 'text-slate-500'}`}>
              ${a.current_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

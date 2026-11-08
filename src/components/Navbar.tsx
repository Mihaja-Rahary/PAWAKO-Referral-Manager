import React from 'react';
import { User } from '../types';
import { RefreshCw, KeyRound, Shield, LogOut } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  currentUser: User | null;
  onOpenDiscordLogin: () => void;
  onLogout: () => void;
  isOAuthConfigured: boolean;
  onRefresh: () => void;
}

export const Navbar: React.FC<Props> = ({
  title,
  subtitle,
  currentUser,
  onOpenDiscordLogin,
  onLogout,
  isOAuthConfigured,
  onRefresh,
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {currentUser ? (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.displayName}
                className="w-6 h-6 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[10px]">
                {currentUser.displayName.charAt(0)}
              </div>
            )}
            <div className="text-xs">
              <span className="font-semibold text-slate-900">{currentUser.displayName}</span>
              <span className="text-slate-400 mx-1.5">·</span>
              <span className="font-medium text-slate-600 text-[11px]">{currentUser.role}</span>
            </div>
            <button
              onClick={onLogout}
              title="Se déconnecter"
              className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors ml-1"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenDiscordLogin}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-[#5865F2] hover:bg-[#4752C4] rounded-lg transition-colors shadow-xs"
            title="Connexion officielle Discord OAuth2"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Connexion Discord OAuth2</span>
          </button>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          title="Actualiser les données réelles"
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};

import React from 'react';
import { User } from '../types';
import { RefreshCw, KeyRound, LogOut } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

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
  currentUser,
  onOpenDiscordLogin,
  onLogout,
  onRefresh,
}) => {
  return (
    <header className="h-16 bg-white dark:bg-[#090611] border-b border-slate-200 dark:border-[#1e1530] px-6 flex items-center justify-between gap-6 shrink-0 transition-colors">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight truncate">
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <ThemeToggle compact />

        <button
          onClick={onRefresh}
          title="Actualiser"
          aria-label="Actualiser"
          className="p-2 text-slate-500 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#191129] rounded-lg transition-colors border border-slate-200 dark:border-[#241a38] bg-white dark:bg-[#100b1a] cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {currentUser ? (
          <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] px-3 py-1.5 rounded-lg">
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.displayName}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-[#2e224a]"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-[10px]">
                {currentUser.displayName.charAt(0)}
              </div>
            )}
            <div className="text-xs whitespace-nowrap">
              <span className="font-semibold text-slate-900 dark:text-[#f4f1fa]">
                {currentUser.displayName}
              </span>
              <span className="text-slate-300 dark:text-[#3b2d5c] mx-1.5">·</span>
              <span className="font-medium text-slate-600 dark:text-violet-300 text-[11px]">
                {currentUser.role}
              </span>
            </div>
            <button
              onClick={onLogout}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded transition-colors ml-0.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenDiscordLogin}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Connexion Discord</span>
          </button>
        )}
      </div>
    </header>
  );
};

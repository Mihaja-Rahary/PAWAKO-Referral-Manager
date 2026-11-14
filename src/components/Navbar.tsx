import React from 'react';
import { User } from '../types';
import { RefreshCw, KeyRound, LogOut, Menu } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  title: string;
  subtitle?: string;
  currentUser: User | null;
  onOpenDiscordLogin: () => void;
  onLogout: () => void;
  isOAuthConfigured: boolean;
  onRefresh: () => void;
  onOpenMobileMenu?: () => void;
}

export const Navbar: React.FC<Props> = ({
  title,
  currentUser,
  onOpenDiscordLogin,
  onLogout,
  onRefresh,
  onOpenMobileMenu,
}) => {
  const [isSpinning, setIsSpinning] = React.useState(false);

  const handleRefreshClick = () => {
    setIsSpinning(true);
    onRefresh();
    setTimeout(() => setIsSpinning(false), 650);
  };

  return (
    <header className="h-16 bg-white dark:bg-[#090611] border-b border-slate-200 dark:border-[#1e1530] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-6 shrink-0 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Ouvrir le menu de navigation"
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 dark:text-[#c4badb] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#191129] transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight truncate">
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <ThemeToggle compact />

        <button
          onClick={handleRefreshClick}
          title="Actualiser"
          aria-label="Actualiser"
          className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2 text-slate-500 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#191129] rounded-lg transition-colors border border-slate-200 dark:border-[#241a38] bg-white dark:bg-[#100b1a] cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? 'animate-spin text-violet-500' : ''}`} />
        </button>

        {currentUser ? (
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg">
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.displayName}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-[#2e224a] shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                {currentUser.displayName.charAt(0)}
              </div>
            )}
            <div className="text-xs whitespace-nowrap hidden sm:block">
              <span className="font-semibold text-slate-900 dark:text-[#f4f1fa] max-w-[120px] truncate inline-block align-middle">
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
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded transition-colors cursor-pointer"
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

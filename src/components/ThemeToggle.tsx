import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../utils/theme';

interface Props {
  compact?: boolean;
}

export const ThemeToggle: React.FC<Props> = ({ compact = false }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-[#241a38] bg-white dark:bg-[#100b1a] text-slate-700 dark:text-[#e9e5f5] hover:bg-slate-100 dark:hover:bg-[#191129] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
        compact ? 'p-2' : 'px-3 py-1.5 text-xs font-medium'
      }`}
    >
      {isDark ? (
        <>
          <Sun className="w-3.5 h-3.5 text-violet-300" />
          {!compact && <span>Clair</span>}
        </>
      ) : (
        <>
          <Moon className="w-3.5 h-3.5 text-violet-600" />
          {!compact && <span>Sombre</span>}
        </>
      )}
    </button>
  );
};

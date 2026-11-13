import React, { useState } from 'react';
import squareLogoUrl from '../assets/images/pawako_square_logo_1794531156007.jpg';

interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  xs: 'w-7 h-7 rounded-lg',
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-xl',
  lg: 'w-14 h-14 rounded-2xl',
  xl: 'w-20 h-20 rounded-2xl',
};

export const PawakoLogo: React.FC<Props> = ({ size = 'sm', className = '' }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`${sizeMap[size]} bg-[#06040a] border border-violet-500/35 flex items-center justify-center shrink-0 ${className}`}
        aria-label="PAWAKO"
      >
        <svg viewBox="0 0 32 32" className="w-3/5 h-3/5" aria-hidden="true">
          <path
            d="M16 4C10.5 4 7 9.5 6 17c-.6 4.4.8 8.2 3.5 11h13c2.7-2.8 4.1-6.6 3.5-11C25 9.5 21.5 4 16 4z"
            fill="#140d24"
            stroke="#8b5cf6"
            strokeWidth="1.5"
          />
          <path d="M11.5 14.5l3 1.4-2.5.8zM20.5 14.5l-3 1.4 2.5.8z" fill="#c084fc" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`${sizeMap[size]} overflow-hidden bg-[#040208] border border-slate-200/80 dark:border-violet-500/30 shrink-0 ${className}`}
    >
      <img
        src={squareLogoUrl}
        alt="PAWAKO"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover block"
      />
    </div>
  );
};

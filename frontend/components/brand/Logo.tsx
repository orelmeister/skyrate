'use client';
import Image from 'next/image';

type LogoVariant = 'horizontal' | 'icon' | 'dark' | 'white';
type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const LOGO_FILES: Record<LogoVariant, string> = {
  horizontal: '/images/logos/logo-horizontal.png',
  icon: '/images/logos/logo-icon.png',
  dark: '/images/logos/logo-dark.png',
  white: '/images/logos/logo-white.png',
};

const SIZES: Record<LogoSize, { width: number; height: number }> = {
  xs: { width: 24, height: 24 },
  sm: { width: 32, height: 32 },
  md: { width: 40, height: 40 },
  lg: { width: 56, height: 56 },
  xl: { width: 80, height: 80 },
};

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
  showText?: boolean;
}

export default function Logo({ variant = 'horizontal', size = 'md', className = '', showText = true }: LogoProps) {
  const dims = SIZES[size];
  
  if (variant === 'icon' || !showText) {
    return (
      <Image
        src={LOGO_FILES[variant === 'icon' ? 'icon' : variant]}
        alt="SkyRate AI"
        width={dims.width}
        height={dims.height}
        className={`object-contain ${className}`}
        priority
      />
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src={LOGO_FILES[variant]}
        alt="SkyRate AI"
        width={dims.width}
        height={dims.height}
        className="object-contain"
        priority
      />
      <span className={`font-bold text-${size === 'xs' || size === 'sm' ? 'lg' : 'xl'} ${variant === 'dark' || variant === 'white' ? 'text-white' : 'text-slate-900'}`}>
        SkyRate<span className={variant === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}>.AI</span>
      </span>
    </div>
  );
}

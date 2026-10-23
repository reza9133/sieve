import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:shadow-glow active:translate-y-px',
  secondary: 'border border-border bg-surface text-text hover:border-accent hover:text-accent',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
  danger: 'border border-danger/60 text-danger hover:bg-danger/10',
};
const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra = '') =>
  `${base} ${variants[variant]} ${sizes[size]} ${extra}`;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Subtle pull toward the pointer. Disabled under prefers-reduced-motion. */
  magnetic?: boolean;
}

export function Button({ variant = 'primary', size = 'md', magnetic, className = '', type = 'button', ...rest }: ButtonProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!magnetic || reduce || !el || el.disabled) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.12}px, ${(e.clientY - r.top - r.height / 2) * 0.18}px)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      onPointerMove={move}
      onPointerLeave={leave}
      {...rest}
    />
  );
}

interface LinkButtonProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function LinkButton({ variant = 'primary', size = 'md', className = '', ...rest }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

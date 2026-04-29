import type { HTMLAttributes } from 'react';

export function MenuItem({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['menuItem', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

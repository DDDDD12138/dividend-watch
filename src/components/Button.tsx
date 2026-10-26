import type { ComponentPropsWithRef } from 'react'
import './button.css'

type Props = Omit<ComponentPropsWithRef<'button'>, 'aria-busy'> & {
  variant?: 'primary' | 'secondary' | 'text'
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  loading = false,
  disabled,
  type = 'button',
  className,
  ...props
}: Props) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`button button--${variant}${className ? ` ${className}` : ''}`}
    />
  )
}

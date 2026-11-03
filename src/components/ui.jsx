import { useEffect, useId, useRef } from 'react'
import { Clipboard, X } from 'lucide-react'
import { copyText, cx } from '../lib/utils'
import { useToast } from '../store/ToastContext'

export function LogoMark({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <rect width="64" height="64" rx="18" fill="currentColor" />
      <rect x="15" y="20" width="34" height="26" rx="7" stroke="var(--logo-paper, #F5F2E9)" strokeWidth="3" />
      <path
        d="M17 24.5 32 35l15-10.5"
        stroke="var(--logo-accent, #C6F26B)"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="47.5"
        cy="17.5"
        r="5"
        fill="var(--logo-accent, #C6F26B)"
        stroke="var(--logo-ink, #121713)"
        strokeWidth="2.5"
      />
    </svg>
  )
}

export function Logo({ light = false, compact = false, className = '' }) {
  return (
    <span className={cx('logo', light && 'logo--light', className)}>
      <span className="logo__mark">
        <LogoMark size={compact ? 27 : 30} />
      </span>
      {!compact && (
        <span className="logo__word">
          Postique<span className="logo__dot">.</span>
        </span>
      )}
    </span>
  )
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon = null,
  iconRight = null,
  className = '',
  loading = false,
  ...props
}) {
  return (
    <button
      className={cx('button', `button--${variant}`, `button--${size}`, className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="button__spinner" /> : icon}
      <span>{children}</span>
      {iconRight}
    </button>
  )
}

export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button className={cx('icon-button', className)} aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span className={cx('badge', `badge--${tone}`, className)}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  )
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Avatar({ name, initials: explicit, color, size = 38, className = '' }) {
  const value =
    explicit ||
    name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() ||
    '?'
  const background = color || '#E5E1D7'
  const hex = String(background).replace('#', '')
  let textColor = '#2D382F'
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const red = Number.parseInt(hex.slice(0, 2), 16)
    const green = Number.parseInt(hex.slice(2, 4), 16)
    const blue = Number.parseInt(hex.slice(4, 6), 16)
    if ((red * 299 + green * 587 + blue * 114) / 1000 < 145) textColor = '#F7F4EA'
  }
  return (
    <span
      className={cx('avatar', className)}
      style={{
        width: size,
        height: size,
        background,
        color: textColor,
        fontSize: size * 0.32,
      }}
      aria-hidden="true"
    >
      {value}
    </span>
  )
}

export function Toggle({ checked, onChange, label, disabled = false, size = 'md' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('toggle', checked && 'is-on', `toggle--${size}`)}
      onClick={() => onChange?.(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  )
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={cx('field', className)}>
      {label && <span className="field__label">{label}</span>}
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  )
}

export function CopyButton({ value, label = 'Copy', compact = false, className = '', onCopied }) {
  const { toast } = useToast()
  const handle = async () => {
    await copyText(value)
    toast('Copied to clipboard', 'success')
    onCopied?.()
  }
  return (
    <button
      type="button"
      className={cx('copy-button', compact && 'copy-button--compact', className)}
      onClick={handle}
      title={label}
    >
      <Clipboard size={compact ? 13 : 14} />
      {!compact && <span>{label}</span>}
    </button>
  )
}

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = 'md',
  className = '',
}) {
  const titleId = useId()
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.()
    }
    document.addEventListener('keydown', handleKey)
    const previous = document.activeElement
    const timer = setTimeout(() => {
      const focusable = ref.current?.querySelector(
        'input, textarea, select, button:not(.modal__close), [tabindex="0"]',
      )
      focusable?.focus()
    }, 30)
    document.body.classList.add('has-modal')
    return () => {
      document.removeEventListener('keydown', handleKey)
      clearTimeout(timer)
      document.body.classList.remove('has-modal')
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div
        className={cx('modal', `modal--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
      >
        <div className="modal__head">
          <div>
            {eyebrow && <p className="eyebrow eyebrow--small">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
            {description && <p className="modal__desc">{description}</p>}
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  )
}

export function ProgressBar({ value, tone = 'lime', label }) {
  return (
    <div className="progress" aria-label={label}>
      <span className={cx('progress__fill', `progress__fill--${tone}`)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  )
}

export function SectionHeading({ eyebrow, title, copy, align = 'left' }) {
  return (
    <div className={cx('section-heading', align === 'center' && 'section-heading--center')}>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2>{title}</h2>
      {copy && <p>{copy}</p>}
    </div>
  )
}

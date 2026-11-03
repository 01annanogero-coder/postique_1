import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react'
import { cx } from '../lib/utils'

export function PageHeader({ eyebrow, title, description, actions, className = '', children }) {
  return (
    <header className={cx('page-head', className)}>
      <div className="page-head__copy">
        {eyebrow && <span className="page-head__eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </header>
  )
}

export function SectionCard({ title, description, action, children, className = '', bodyClassName = '' }) {
  return (
    <section className={cx('section-card', className)}>
      {(title || action) && (
        <div className="section-card__head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action && <div className="section-card__action">{action}</div>}
        </div>
      )}
      <div className={cx('section-card__body', bodyClassName)}>{children}</div>
    </section>
  )
}

export function StatCard({ label, value, suffix, delta, deltaLabel, icon, tone = 'lime', foot }) {
  const positive = delta !== undefined && !String(delta).startsWith('-')
  return (
    <div className={cx('stat-card', `stat-card--${tone}`)}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {icon && <span className="stat-card__icon">{icon}</span>}
      </div>
      <div className="stat-card__value">
        {value}
        {suffix && <span className="stat-card__suffix">{suffix}</span>}
      </div>
      {(delta !== undefined || deltaLabel) && (
        <div className="stat-card__foot">
          {delta !== undefined && (
            <span className={cx('stat-card__delta', positive ? 'is-up' : 'is-down')}>
              {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {delta}
            </span>
          )}
          {deltaLabel && <span>{deltaLabel}</span>}
        </div>
      )}
      {foot}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={cx('search-box', className)}>
      <Search size={14} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search">
          ×
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state__icon">{icon}</span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function MiniSparkline({ values, color = '#6f9e35', width = 78, height = 26 }) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / (max - min || 1)) * (height - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="mini-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

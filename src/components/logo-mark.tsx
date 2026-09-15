type LogoMarkProps = {
  className?: string
}

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <span className={['logo-brand', className].filter(Boolean).join(' ')}>
      <span className="logo-mark" aria-hidden="true">
        <svg className="logo-mark-icon" viewBox="0 0 1024 1024" focusable="false">
          <use href="/logo.svg#svg_15" />
        </svg>
      </span>
      <span className="logo-brand-name">FreeCoffee.bio</span>
    </span>
  )
}

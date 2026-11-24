import { createContext, useContext, useEffect } from 'react';

// Provided by each dashboard (admin, candidate): a page header reports its trail (parents + itself) here, and the
// dashboard draws the breadcrumbs above the page card, outside it.
export const SetTrail = createContext(null);

const TITLE = 'flex min-w-0 items-center gap-1.5 text-sm font-semibold text-purple-600 sm:text-base';
const iconOf = (icon) => (typeof icon === 'string' ? <i className={`fa-solid ${icon} shrink-0`} aria-hidden="true" /> : icon);

/** The page title alone: same look on every screen (also used by the calendar home toolbars). */
export function PageTitle({ icon, children }) {
  return (
    <h1 className={TITLE}>
      {iconOf(icon)}
      <span className="truncate">{children}</span>
    </h1>
  );
}

// Dashboard breadcrumb bar (admin and candidate): left-aligned above the page card, outside it, in the page gutter.
// items: [{ label, icon?, onClick? | href? }]; the last item is the current page.
export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="px-2 pt-2 sm:px-4 md:px-8 print:hidden">
      <ol className="flex flex-wrap items-center gap-x-1 text-xs sm:text-sm text-slate-500">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          const link = !last && (c.onClick || c.href);
          const cls = 'py-1 font-medium text-purple-600 hover:text-purple-800 hover:underline';
          return (
            <li key={`${i}-${c.label}`} className="flex items-center gap-1">
              {i > 0 && <i className="fa-solid fa-chevron-right translate-y-px text-[9px] leading-none text-slate-300" aria-hidden="true" />}
              {c.icon && <i className={`fa-solid ${c.icon} text-[11px] leading-none ${link ? 'text-purple-600' : 'text-slate-400'}`} aria-hidden="true" />}
              {!link ? (
                <span aria-current={last ? 'page' : undefined} className="py-1 font-medium text-slate-400">{c.label}</span>
              ) : c.href ? (
                <a href={c.href} className={cls}>{c.label}</a>
              ) : (
                <button type="button" onClick={c.onClick} className={cls}>{c.label}</button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * One title row for every screen: back left · icon + title centred (+ extra, e.g. reload) · actions right.
 * `parents`: breadcrumbs between Home and this page, [{ label, onClick | href }] (drawn by the dashboard).
 * `stackActions`: put the actions on their own row below lg (pages with several buttons).
 */
export default function PageHeader({ icon, title, onBack, backLabel = 'Go back', extra, actions, parents = [], crumb, stackActions = false }) {
  const setTrail = useContext(SetTrail);
  const label = crumb ?? (typeof title === 'string' ? title : '');
  const key = [...parents.map((p) => `${p.label}|${p.href || ''}`), label, icon].join('»');
  useEffect(() => {
    if (!setTrail) return undefined;
    setTrail([...parents, { label, icon }]);
    return () => setTrail(null);
  }, [setTrail, key]); // eslint-disable-line react-hooks/exhaustive-deps -- parents' callbacks are setters; the labels decide
  const grid = stackActions
    ? 'grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[1fr_auto_1fr]'
    : 'grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[1fr_auto_1fr]';
  return (
    <div className={`mb-4 grid items-center gap-2 ${grid}`}>
      <div>
        {onBack && (
          <button type="button" onClick={onBack} className="btn-circle" aria-label={backLabel} title={backLabel}>
            <i className="fa-solid fa-arrow-left text-sm" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex min-w-0 items-center justify-center gap-2">
        <PageTitle icon={icon}>{title}</PageTitle>
        {extra}
      </div>
      <div className={`flex flex-wrap items-center justify-end gap-2 ${stackActions ? 'col-span-2 lg:col-span-1' : ''}`}>{actions}</div>
    </div>
  );
}

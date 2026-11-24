import { createContext, useContext } from 'react';

// Set by the admin dashboard: every page header under it shows breadcrumbs starting at this Home crumb.
export const HomeCrumb = createContext(null);

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

const crumbLink = 'inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 hover:underline';

function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 print:hidden">
      <ol className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500 sm:text-xs">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          const body = <>{c.icon && iconOf(c.icon)}<span>{c.label}</span></>;
          return (
            <li key={`${i}-${c.label}`} className="inline-flex min-w-0 items-center gap-1">
              {i > 0 && <i className="fa-solid fa-chevron-right text-[8px] text-slate-400" aria-hidden="true" />}
              {last ? (
                <span aria-current="page" className="inline-flex items-center gap-1 truncate font-medium text-slate-700">{body}</span>
              ) : c.href ? (
                <a href={c.href} className={crumbLink}>{body}</a>
              ) : (
                <button type="button" onClick={c.onClick} className={crumbLink}>{body}</button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * One title row for every screen: breadcrumbs (admin only) · back left · icon + title centred (+ extra, e.g. reload)
 * · actions right. `parents`: crumbs between Home and this page, [{ label, onClick | href }].
 * `stackActions`: put the actions on their own row below lg (pages with several buttons).
 */
export default function PageHeader({ icon, title, onBack, backLabel = 'Go back', extra, actions, parents = [], crumb, stackActions = false }) {
  const home = useContext(HomeCrumb);
  const grid = stackActions
    ? 'grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[1fr_auto_1fr]'
    : 'grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[1fr_auto_1fr]';
  return (
    <div className="mb-4">
      {home && <Breadcrumbs items={[home, ...parents, { label: crumb ?? title, icon }]} />}
      <div className={`grid items-center gap-2 ${grid}`}>
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
    </div>
  );
}

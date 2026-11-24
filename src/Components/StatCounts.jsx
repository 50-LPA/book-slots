// Count row shown left of a list's filters. items: [label, value, tone?]. Pass the filters' gap so both rows space alike.
const TONE = { total: 'text-slate-800', green: 'text-emerald-600', red: 'text-red-600', amber: 'text-amber-500' };

export default function StatCounts({ items, gap = 'gap-3', className = '' }) {
  return (
    <div className={`flex items-center ${gap} ${className}`}>
      {items.map(([label, value, tone = 'total']) => (
        <div key={label} className="flex flex-col items-center text-center leading-snug">
          <span className={`text-base font-semibold ${TONE[tone]}`}>{value ?? '–'}</span>
          <span className="whitespace-nowrap text-[11px] text-slate-500">{label}</span>
        </div>
      ))}
    </div>
  );
}

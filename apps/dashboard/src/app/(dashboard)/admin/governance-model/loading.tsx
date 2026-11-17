export default function GovernanceModelLoading() {
  return <div aria-label="جارٍ تحميل مركز إعداد الحوكمة" className="animate-pulse space-y-5"><div className="h-52 rounded-[28px] bg-q-surface-2"/><div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map((item)=><div key={item} className="h-32 rounded-q-card bg-q-surface"/>)}</div><div className="h-72 rounded-[24px] bg-q-surface"/></div>;
}

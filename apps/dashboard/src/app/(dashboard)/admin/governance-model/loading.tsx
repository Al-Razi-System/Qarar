export default function GovernanceModelLoading() {
  return <div aria-label="جارٍ تحميل مركز إعداد الحوكمة" className="animate-pulse space-y-5"><div className="h-52 rounded-[28px] bg-[#dfeaf5]"/><div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map((item)=><div key={item} className="h-32 rounded-2xl bg-white"/>)}</div><div className="h-72 rounded-[24px] bg-white"/></div>;
}

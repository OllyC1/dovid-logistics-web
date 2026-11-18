import { MarkNotificationsReadButton } from "@/components/account/notification-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: items } = await supabase.from("notifications")
    .select("id,title,body,created_at,read_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const unreadCount = items?.filter(item => !item.read_at).length ?? 0;

  return <>
    <div className="grid gap-4 sm:flex sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">Delivery updates</p>
        <h1 className="mt-2 text-3xl font-extrabold text-navy">Notifications</h1>
        <p className="mt-2 text-sm text-slate">Important booking, payment, pickup and delivery messages appear here.</p>
      </div>
      <MarkNotificationsReadButton unreadCount={unreadCount} />
    </div>
    <div className="mt-6 grid gap-3">
      {items?.map(item => <article key={item.id} className={`rounded-3xl bg-white p-5 sm:p-6 ${item.read_at ? "opacity-75" : "border-l-4 border-orange"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-extrabold text-navy">{item.title}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.read_at ? "bg-cloud text-slate" : "bg-orange/10 text-orange-dark"}`}>{item.read_at ? "Read" : "New"}</span>
        </div>
        <p className="mt-2 break-words text-sm leading-6 text-slate">{item.body}</p>
        <time className="mt-3 block text-xs text-slate">{new Date(item.created_at).toLocaleString("en-NG")}</time>
      </article>)}
      {!items?.length ? <p className="rounded-3xl bg-white p-8 text-slate">No notifications yet.</p> : null}
    </div>
  </>;
}

import AdminLayout from '@/components/AdminLayout'
import { AgentEventsPanel } from './Panel'

/* 內容抽到 Panel.tsx，因為「其他設定」頁（/settings/other）也要用同一份。
   Next.js 的 page.tsx 不允許多餘的具名匯出，所以不能直接從這裡匯出。
   路由保留，舊連結與書籤照樣能開。 */
export default function Page() {
  return (
    <AdminLayout pageTitle="事件中心">
      <AgentEventsPanel />
    </AdminLayout>
  )
}

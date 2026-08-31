'use client'

/**
 * 抽籤販售設定
 *
 * 版型跟「功能開關」「回收價格設定」一致（老闆指定）：左側分區、右側內容，
 * 共用 components/settings 的 SettingsShell / SettingsNav / SectionHead / SettingsRow。
 *
 * 這裡只放「跨檔期的預設值與全域開關」；單一檔期的名額、時間、價格在
 * 「抽籤販售管理」的檔期表單裡設定。分開的理由：檔期設定改了只影響那一檔，
 * 這頁改了影響之後每一檔 —— 混在同一頁會讓人以為改一次就能救回已經開賣的檔期。
 *
 * 值存在 platform_settings（key-value），走既有的 /api/admin/settings。
 */

import { useEffect, useState } from 'react'
import { AdminLayout, PageCard } from '@/components'
import { SettingsShell, SettingsNav, SectionHead, SettingsRow } from '@/components/settings/SettingsSection'
import Input from '@/components/ui/Input'
import Switch from '@/components/ui/Switch'
import Button from '@/components/ui/Button'
import { useToast } from '@/contexts/ToastContext'

type SectionKey = 'defaults' | 'display' | 'draw'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'defaults', label: '檔期預設值' },
  { key: 'display',  label: '前台顯示' },
  { key: 'draw',     label: '開獎與遞補' },
]

/**
 * 設定鍵與預設值。
 * 預設值寫在這裡而不是資料庫：全新環境不必先塞一批資料才跑得動，
 * 而且看程式碼就知道「沒設定時是什麼行為」。
 */
const KEYS = {
  entry_points:       { key: 'lottery_default_entry_points',       def: '20' },
  backup_count:       { key: 'lottery_default_backup_count',       def: '5' },
  pay_deadline_hours: { key: 'lottery_default_pay_deadline_hours', def: '48' },
  per_user_entries:   { key: 'lottery_default_per_user_entries',   def: '1' },
  list_enabled:       { key: 'lottery_list_enabled',               def: 'on' },
  show_entry_count:   { key: 'lottery_show_entry_count',           def: 'off' },
  auto_draw:          { key: 'lottery_auto_draw',                  def: 'on' },
  auto_promote:       { key: 'lottery_auto_promote',               def: 'on' },
}

export default function LotterySettingsPage() {
  const { toast } = useToast()
  const [section, setSection] = useState<SectionKey>('defaults')
  const [values, setValues] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then((all: Record<string, string>) => {
        const next: Record<string, string> = {}
        for (const { key, def } of Object.values(KEYS)) next[key] = all[key] ?? def
        setValues(next)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  const set = (key: string, v: string) => setValues(p => ({ ...p, [key]: v }))
  const on = (key: string) => values[key] === 'on'

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast('已儲存')
    } catch (e: any) {
      toast(e.message ?? '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  /** 數字欄位共用：窄一點、靠右，跟開關那一欄對齊 */
  const Num = ({ k, suffix }: { k: keyof typeof KEYS; suffix: string }) => (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        className="w-24 text-right"
        value={values[KEYS[k].key] ?? ''}
        onChange={e => set(KEYS[k].key, e.target.value)}
        disabled={!ready}
      />
      <span className="text-sm text-neutral-400">{suffix}</span>
    </div>
  )

  return (
    <AdminLayout pageTitle="抽籤販售設定">
      <div className="space-y-3">
        <PageCard>
          <SettingsShell nav={<SettingsNav sections={SECTIONS} value={section} onChange={setSection} />}>
            {section === 'defaults' && (
              <>
                <SectionHead
                  title="檔期預設值"
                  info="新增檔期時的預設帶入值。改了只影響之後新建的檔期，已經建立的不受影響 —— 已經有人登記的檔期本來就不該被這裡改動，玩家是照當時的條件付的積分。"
                />
                <div className="divide-y divide-neutral-100">
                  <SettingsRow
                    title="入場積分"
                    desc="登記一次要花多少積分。用積分而不是代幣，是因為積分買不到（只能靠簽到、任務、邀請、LINE 綁定賺）—— 免費可得的入場券在抽獎活動的定性上乾淨得多。"
                  >
                    <Num k="entry_points" suffix="積分" />
                  </SettingsRow>
                  <SettingsRow
                    title="每人可登記次數"
                    desc="同一個帳號在同一檔期最多能登記幾次。設 1 就是一人一票。"
                  >
                    <Num k="per_user_entries" suffix="次" />
                  </SettingsRow>
                  <SettingsRow
                    title="備取名額"
                    desc="正取逾期未付時往下遞補的人數。開獎時一起產生並公開 —— 事後才重抽會被說黑箱。"
                  >
                    <Num k="backup_count" suffix="名" />
                  </SettingsRow>
                  <SettingsRow
                    title="付款期限"
                    desc="中籤後多久內要付款，逾時讓給備取。太短玩家來不及看到通知，太長會把整檔拖住。"
                  >
                    <Num k="pay_deadline_hours" suffix="小時" />
                  </SettingsRow>
                </div>
              </>
            )}

            {section === 'display' && (
              <>
                <SectionHead
                  title="前台顯示"
                  info="玩家在前台看得到什麼。入口在首頁的懸浮選單裡（老闆 2026-08-31 指定）。"
                />
                <div className="divide-y divide-neutral-100">
                  <SettingsRow
                    title="開放抽籤販售列表"
                    desc="關掉之後前台的入口與列表頁都會收起來，已經在登記中的檔期也點不進去。臨時要收攤時用這個，不必一檔一檔取消。"
                    state={on(KEYS.list_enabled.key) ? 'on' : 'off'}
                  >
                    <Switch
                      checked={on(KEYS.list_enabled.key)}
                      onCheckedChange={v => set(KEYS.list_enabled.key, v ? 'on' : 'off')}
                      disabled={!ready}
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="登記期間公開人數"
                    desc="新檔期的預設值。建議關閉 ——「只有 3 人登記」的畫面會勸退後面的人；開獎後再公布「XXX 人搶 N 組」才是要的標題。單一檔期可以在檔期設定裡另外指定。"
                    state={on(KEYS.show_entry_count.key) ? 'on' : 'off'}
                  >
                    <Switch
                      checked={on(KEYS.show_entry_count.key)}
                      onCheckedChange={v => set(KEYS.show_entry_count.key, v ? 'on' : 'off')}
                      disabled={!ready}
                    />
                  </SettingsRow>
                </div>
              </>
            )}

            {section === 'draw' && (
              <>
                <SectionHead
                  title="開獎與遞補"
                  info="開獎本身是可驗證的：登記截止前就公布承諾值（seed 的 sha256），開獎時用 sha256(seed + 登記序號) 排序決定名次，開獎後公開 seed。任何人都能自己重算整份名單。"
                />
                <div className="divide-y divide-neutral-100">
                  <SettingsRow
                    title="到時間自動開獎"
                    desc="關掉之後要在「抽籤販售管理」手動按「立即開獎」。建議開著 —— 公布名單的時間是事先宣告的，人為延誤會直接傷到信任。"
                    state={on(KEYS.auto_draw.key) ? 'on' : 'off'}
                  >
                    <Switch
                      checked={on(KEYS.auto_draw.key)}
                      onCheckedChange={v => set(KEYS.auto_draw.key, v ? 'on' : 'off')}
                      disabled={!ready}
                    />
                  </SettingsRow>
                  <SettingsRow
                    title="逾期自動遞補"
                    desc="正取超過付款期限沒付款，自動讓給名次最前面的備取，並重新起算付款期限。關掉的話名額會一直空著。"
                    state={on(KEYS.auto_promote.key) ? 'on' : 'off'}
                  >
                    <Switch
                      checked={on(KEYS.auto_promote.key)}
                      onCheckedChange={v => set(KEYS.auto_promote.key, v ? 'on' : 'off')}
                      disabled={!ready}
                    />
                  </SettingsRow>
                </div>
              </>
            )}

            <div className="mt-6 flex justify-end border-t border-neutral-100 pt-4">
              <Button onClick={save} isLoading={saving} disabled={!ready}>儲存設定</Button>
            </div>
          </SettingsShell>
        </PageCard>
      </div>
    </AdminLayout>
  )
}

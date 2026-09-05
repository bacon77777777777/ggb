'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { CardSkeleton } from '@/components/ui/Skeleton'
import Note from '@/components/ui/Note'

export default function ShippingSettingsPage() {
  const { toast } = useToast()
  const [feeHome, setFeeHome] = useState('130')
  const [feeCvs711, setFeeCvs711] = useState('65')
  const [feeCvsFamily, setFeeCvsFamily] = useState('65')
  const [feeCvsHiLife, setFeeCvsHiLife] = useState('55')
  const [feeCvsOk, setFeeCvsOk] = useState('60')
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('7')
  /*
   * 免運門檻只有一個數字，但 DB 的 calc_delivery_fee() 優先讀分物流的
   * free_shipping_threshold_home／_cvs，讀不到才退回 free_shipping_threshold。
   * 2026-08-04 那次 migration 把宅配塞成 15、超商 7，這頁卻只顯示／只寫舊的單一 key ——
   * 老闆看到 7、玩家宅配 10 件照收 60，而且前台一次最多配 10 件，15 永遠到不了（老闆 2026-09-05 回報）。
   * 現在這一格是唯一真相：儲存時三個 key 一起寫；讀到分物流值跟這裡不同就先警告。
   */
  const [liveThresholds, setLiveThresholds] = useState<{ home: string | null; cvs: string | null }>({ home: null, cvs: null })
  // 寄件人（綠界物流開單必填；缺郵遞區號綠界直接拒單 SenderZipCode Is Null，2026-09-02）
  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [senderZip, setSenderZip] = useState('')
  const [senderAddress, setSenderAddress] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => {
        if (d.shipping_fee_home) setFeeHome(d.shipping_fee_home)
        if (d.shipping_fee_cvs_711) setFeeCvs711(d.shipping_fee_cvs_711)
        if (d.shipping_fee_cvs_family) setFeeCvsFamily(d.shipping_fee_cvs_family)
        if (d.shipping_fee_cvs_hilife) setFeeCvsHiLife(d.shipping_fee_cvs_hilife)
        if (d.shipping_fee_cvs_ok) setFeeCvsOk(d.shipping_fee_cvs_ok)
        if (d.free_shipping_threshold) setFreeShippingThreshold(d.free_shipping_threshold)
        setLiveThresholds({ home: d.free_shipping_threshold_home ?? null, cvs: d.free_shipping_threshold_cvs ?? null })
        if (d.shipping_sender_name) setSenderName(d.shipping_sender_name)
        if (d.shipping_sender_phone) setSenderPhone(d.shipping_sender_phone)
        if (d.shipping_sender_zip) setSenderZip(d.shipping_sender_zip)
        if (d.shipping_sender_address) setSenderAddress(d.shipping_sender_address)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipping_fee_home: feeHome,
          shipping_fee_cvs_711: feeCvs711,
          shipping_fee_cvs_family: feeCvsFamily,
          shipping_fee_cvs_hilife: feeCvsHiLife,
          shipping_fee_cvs_ok: feeCvsOk,
          free_shipping_threshold: freeShippingThreshold,
          free_shipping_threshold_home: freeShippingThreshold,
          free_shipping_threshold_cvs: freeShippingThreshold,
          shipping_sender_name: senderName,
          shipping_sender_phone: senderPhone,
          shipping_sender_zip: senderZip,
          shipping_sender_address: senderAddress,
        }),
      })
      if (!res.ok) throw new Error('儲存失敗')
      setSaved(true)
      setLiveThresholds({ home: freeShippingThreshold, cvs: freeShippingThreshold })
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      toast('儲存失敗，請重試', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminLayout pageTitle="運費設定">
      <div className="max-w-lg">
        <PageCard>
          {isLoading ? (
            <CardSkeleton rows={3} />
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-neutral-900 mb-1">平台統一運費</h2>
                <p className="text-sm text-neutral-500 mb-4">
                  用戶申請出貨時自動套用此金額。廠商承擔方式由合約另行約定，不影響此設定。
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      宅配運費（代幣）
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 text-sm font-bold">G</span>
                      <input
                        type="number"
                        min="0"
                        value={feeHome}
                        onChange={e => setFeeHome(e.target.value)}
                        className="w-32 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      超商取貨運費（代幣）
                    </label>
                    <div className="space-y-2">
                      {([
                        ['7-ELEVEN', feeCvs711, setFeeCvs711],
                        ['全家', feeCvsFamily, setFeeCvsFamily],
                        ['萊爾富', feeCvsHiLife, setFeeCvsHiLife],
                        ['OK mart', feeCvsOk, setFeeCvsOk],
                      ] as [string, string, (v: string) => void][]).map(([name, val, setter]) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-sm text-neutral-600 w-20">{name}</span>
                          <span className="text-neutral-500 text-sm font-bold">G</span>
                          <input
                            type="number"
                            min="0"
                            value={val}
                            onChange={e => setter(e.target.value)}
                            className="w-28 px-3 py-1.5 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent font-mono text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-100">
                <h2 className="text-base font-semibold text-neutral-900 mb-1">寄件人資料</h2>
                <p className="text-sm text-neutral-500 mb-4">
                  綠界物流開單用。郵遞區號與地址沒填的話，宅配開單會被綠界直接拒絕。
                </p>
                <div className="space-y-3">
                  {([
                    ['寄件人名稱', senderName, setSenderName, 'GGB吉吉比'],
                    ['寄件人手機', senderPhone, setSenderPhone, '09xxxxxxxx'],
                    ['郵遞區號', senderZip, setSenderZip, '251'],
                    ['寄件地址', senderAddress, setSenderAddress, '新北市淡水區…'],
                  ] as [string, string, (v: string) => void, string][]).map(([label, val, setter, ph]) => (
                    <div key={label}>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
                      <input
                        type="text"
                        value={val}
                        onChange={e => setter(e.target.value)}
                        placeholder={ph}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-100">
                <h2 className="text-base font-semibold text-neutral-900 mb-1">免運門檻</h2>
                <p className="text-sm text-neutral-500 mb-4">
                  用戶單次申請出貨件數達此數量（含）以上，免收運費。宅配與超商共用同一個門檻；含大件的訂單一律不免運。
                </p>
                {(() => {
                  const diff = (['home', 'cvs'] as const).filter(k => liveThresholds[k] != null && liveThresholds[k] !== freeShippingThreshold)
                  if (diff.length === 0) return null
                  const name = { home: '宅配', cvs: '超商' }
                  return (
                    <div className="mb-4">
                      <Note tone="warn">
                        目前實際計費用的門檻是{diff.map(k => `${name[k]} ${liveThresholds[k]} 件`).join('、')}，跟這裡的 {freeShippingThreshold} 件不一樣。按「儲存設定」會把所有物流方式一起改成這裡的值。
                      </Note>
                    </div>
                  )
                })()}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    免運件數門檻（件）
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={freeShippingThreshold}
                      onChange={e => setFreeShippingThreshold(e.target.value)}
                      className="w-32 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent font-mono"
                    />
                    <span className="text-sm text-neutral-500">件以上免運</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-100 flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {isSaving ? '儲存中...' : '儲存設定'}
                </button>
                {saved && (
                  <span className="text-sm text-green-600 font-medium">✓ 已儲存</span>
                )}
              </div>
            </div>
          )}
        </PageCard>
      </div>
    </AdminLayout>
  )
}

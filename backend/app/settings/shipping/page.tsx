'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect } from 'react'

export default function ShippingSettingsPage() {
  const [feeHome, setFeeHome] = useState('60')
  const [feeCvs, setFeeCvs] = useState('60')
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('7')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => {
        if (d.shipping_fee_home) setFeeHome(d.shipping_fee_home)
        if (d.shipping_fee_cvs) setFeeCvs(d.shipping_fee_cvs)
        if (d.free_shipping_threshold) setFreeShippingThreshold(d.free_shipping_threshold)
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
          shipping_fee_cvs: feeCvs,
          free_shipping_threshold: freeShippingThreshold,
        }),
      })
      if (!res.ok) throw new Error('儲存失敗')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert('儲存失敗，請重試')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminLayout pageTitle="運費設定" breadcrumbs={[{ label: '運費設定', href: '/settings/shipping' }]}>
      <div className="max-w-lg">
        <PageCard>
          {isLoading ? (
            <div className="py-8 text-center text-neutral-400">載入中...</div>
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
                      宅配運費（TWD）
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">$</span>
                      <input
                        type="number"
                        min="0"
                        value={feeHome}
                        onChange={e => setFeeHome(e.target.value)}
                        className="w-32 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      超商取貨運費（TWD）
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500">$</span>
                      <input
                        type="number"
                        min="0"
                        value={feeCvs}
                        onChange={e => setFeeCvs(e.target.value)}
                        className="w-32 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-100">
                <h2 className="text-base font-semibold text-neutral-900 mb-1">免運門檻</h2>
                <p className="text-sm text-neutral-500 mb-4">
                  用戶單次申請出貨件數達此數量（含）以上，免收運費。
                </p>
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
                      className="w-32 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
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

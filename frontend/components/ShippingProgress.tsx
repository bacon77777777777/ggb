'use client'

interface ShippingProgressProps {
  status: 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled'
  submittedAt: string
  shippedAt?: string | null
  showTitle?: boolean
}

interface ProgressStep {
  status: string
  location: string
  time: string
  completed: boolean
  cancelled: boolean
}

// 根據狀態生成配送進度
const getShippingProgress = (status: string, submittedAt: string, shippedAt: string | null = null): ProgressStep[] => {
  const progress: ProgressStep[] = []
  
  // 如果是已取消狀態，只顯示到已取消為止
  if (status === 'cancelled') {
    progress.push({
      status: '已提交',
      location: '訂單已建立',
      time: submittedAt,
      completed: true,
      cancelled: false
    })
    progress.push({
      status: '已取消',
      location: '訂單回收中',
      time: submittedAt,
      completed: true,
      cancelled: true
    })
    return progress
  }
  
  // 已提交
  progress.push({
    status: '已提交',
    location: '訂單已建立',
    time: submittedAt,
    completed: true,
    cancelled: false
  })
  
  // 處理中
  if (status !== 'submitted') {
    progress.push({
      status: '處理中',
      location: '倉庫處理中',
      time: submittedAt,
      completed: true,
      cancelled: false
    })
  } else {
    progress.push({
      status: '處理中',
      location: '倉庫處理中',
      time: '',
      completed: false,
      cancelled: false
    })
  }
  
  // 物流已收取
  if (status === 'picked_up' || status === 'shipping' || status === 'delivered') {
    progress.push({
      status: '物流已收取',
      location: '物流中心',
      time: shippedAt || submittedAt,
      completed: true,
      cancelled: false
    })
  } else {
    progress.push({
      status: '物流已收取',
      location: '物流中心',
      time: '',
      completed: false,
      cancelled: false
    })
  }
  
  // 配送中
  if (status === 'shipping' || status === 'delivered') {
    progress.push({
      status: '配送中',
      location: '配送站',
      time: shippedAt || submittedAt,
      completed: status === 'delivered',
      cancelled: false
    })
  } else {
    progress.push({
      status: '配送中',
      location: '配送站',
      time: '',
      completed: false,
      cancelled: false
    })
  }

  // 已送達
  if (status === 'delivered') {
    progress.push({
      status: '已送達',
      location: '收件地址',
      time: shippedAt || submittedAt,
      completed: true,
      cancelled: false
    })
  } else {
    progress.push({
      status: '已送達',
      location: '收件地址',
      time: '',
      completed: false,
      cancelled: false
    })
  }

  return progress
}

export default function ShippingProgress({ status, submittedAt, shippedAt, showTitle = true }: ShippingProgressProps) {
  const steps = getShippingProgress(status, submittedAt, shippedAt)

  return (
    <div className="w-full">
      {showTitle && <h4 className="text-sm font-medium text-neutral-900 mb-4">配送進度</h4>}
      <div className="relative">
        {/* 連接線 */}
        <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-neutral-100" />
        
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div key={index} className="relative flex gap-4">
              {/* 狀態點 */}
              <div className={`
                relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 
                ${step.cancelled 
                  ? 'bg-red-50 border-red-500 text-red-500' 
                  : step.completed 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-white border-neutral-200 text-neutral-300'}
              `}>
                {step.cancelled ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : step.completed ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-current" />
                )}
              </div>
              
              {/* 內容 */}
              <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className={`font-medium ${
                      step.cancelled 
                        ? 'text-red-600' 
                        : step.completed 
                          ? 'text-neutral-900' 
                          : 'text-neutral-400'
                    }`}>
                      {step.status}
                    </p>
                    <p className="text-sm text-neutral-500 mt-0.5">{step.location}</p>
                  </div>
                  {step.time && (
                    <span className="text-xs text-neutral-400 font-amount">
                      {step.time}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

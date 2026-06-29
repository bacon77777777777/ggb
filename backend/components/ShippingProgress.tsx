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
      location: '已簽收',
      time: shippedAt || submittedAt,
      completed: true,
      cancelled: false
    })
  } else {
    progress.push({
      status: '已送達',
      location: '已簽收',
      time: '',
      completed: false,
      cancelled: false
    })
  }
  
  return progress
}

export default function ShippingProgress({ status, submittedAt, shippedAt, showTitle = true }: ShippingProgressProps) {
  const progressSteps = getShippingProgress(status, submittedAt, shippedAt || null)
  const isCancelled = status === 'cancelled'
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      {showTitle && <h2 className="text-lg font-bold text-neutral-900 mb-6">配送進度</h2>}
      
      {/* 已取消狀態使用緊湊居中佈局 */}
      {isCancelled ? (
        <div className="relative max-w-xs mx-auto">
          {/* 紅色進度線 - 只在兩個圓形之間 */}
          <div 
            className="absolute top-5 h-0.5 bg-red-500 rounded-full"
            style={{ left: 'calc(25% + 20px)', right: 'calc(25% + 20px)' }}
          ></div>
          {/* 進度條 */}
          <div className="flex items-start justify-between relative">
            {/* 已提交節點 */}
            <div className="flex flex-col items-center relative z-10 w-1/2">
              <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center mt-3">
                <p className="font-medium text-sm text-neutral-900">已提交</p>
                <p className="text-xs text-neutral-400 mt-0.5">{progressSteps[0]?.time}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{progressSteps[0]?.location}</p>
              </div>
            </div>
            
            {/* 已取消節點 */}
            <div className="flex flex-col items-center relative z-10 w-1/2">
              <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-center mt-3">
                <p className="font-medium text-sm text-neutral-900">已取消</p>
                <p className="text-xs text-neutral-400 mt-0.5">{progressSteps[1]?.time}</p>
                <p className="text-xs text-neutral-400 mt-0.5">訂單回收中</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // 正常狀態使用完整進度條佈局
        <div className="relative">
          {/* 背景連接線 */}
          <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-neutral-200 rounded-full"></div>
          {/* 已完成的進度線 */}
          {(() => {
            const completedCount = progressSteps.filter(p => p.completed).length
            const totalSteps = progressSteps.length
            const progressWidth = completedCount > 1 ? ((completedCount - 1) / (totalSteps - 1)) * 80 : 0
            return (
              <div 
                className="absolute top-5 left-[10%] h-0.5 bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${progressWidth}%` }}
              ></div>
            )
          })()}
          {/* 進度條 */}
          <div className="flex items-start justify-between relative">
            {progressSteps.map((progress, idx) => (
              <div key={idx} className="flex flex-col items-center relative z-10" style={{ width: `${100 / progressSteps.length}%` }}>
                {/* 進度點 */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                  progress.completed 
                    ? 'bg-green-500' 
                    : 'bg-neutral-300'
                }`}>
                  {progress.completed ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-white"></div>
                  )}
                </div>
                {/* 文字內容 */}
                <div className="w-full text-center mt-3">
                  <p className={`font-medium text-sm ${
                    progress.completed 
                      ? 'text-neutral-900' 
                      : 'text-neutral-400'
                  }`}>
                    {progress.status}
                  </p>
                  {progress.time && (
                    <p className="text-xs text-neutral-400 mt-0.5">{progress.time}</p>
                  )}
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {progress.location}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

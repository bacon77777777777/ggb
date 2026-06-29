# UI Kit 組件庫

統一的 UI 組件庫，確保全站樣式一致性。

## 組件列表

### 基礎組件

- **Button** - 按鈕組件，支援多種變體和尺寸
- **Input** - 輸入框組件，支援標籤、錯誤訊息、圖標
- **Select** - 選擇框組件，統一樣式
- **Textarea** - 文本區域組件
- **FileInput** - 檔案上傳組件
- **Label** - 標籤組件
- **Badge** - 標籤/徽章組件
- **Card** - 卡片組件

## 快速開始

```tsx
import { Button, Input, Select, Card } from '@/components/ui'

function MyComponent() {
  return (
    <Card>
      <Input label="名稱" placeholder="請輸入名稱" />
      <Select 
        label="分類"
        options={[
          { value: '1', label: '選項 1' },
          { value: '2', label: '選項 2' },
        ]}
      />
      <Button variant="primary">提交</Button>
    </Card>
  )
}
```

## 設計原則

1. **一致性**：所有組件使用統一的樣式規範
2. **可訪問性**：內建無障礙設計支援
3. **可擴展性**：易於擴展和自訂
4. **類型安全**：完整的 TypeScript 類型定義

## 樣式規範

### 輸入框高度
統一使用 `px-3 py-2`（約 42px 高度）

### 顏色系統
- Primary: `#3B82F6` (藍色)
- Secondary: `#E5E5E5` (灰色)
- Danger: `#EF4444` (紅色)
- Success: `#10B981` (綠色)
- Warning: `#F59E0B` (黃色)

### 間距系統
- xs: 8px
- sm: 12px
- md: 16px
- lg: 24px
- xl: 32px

### 圓角
- 輸入框、按鈕、卡片: `rounded-lg` (8px)
- 標籤: `rounded-full`

## 遷移指南

將現有的 HTML 元素遷移到 UI Kit 組件：

### 輸入框

**之前：**
```tsx
<label className="block text-sm font-medium text-neutral-700 mb-1.5">
  名稱 <span className="text-red-500">*</span>
</label>
<input
  type="text"
  className="w-full px-3 py-2 bg-white border-2 border-neutral-200 rounded-lg..."
/>
```

**之後：**
```tsx
<Input
  label="名稱"
  type="text"
  required
/>
```

### 按鈕

**之前：**
```tsx
<button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark">
  點擊
</button>
```

**之後：**
```tsx
<Button variant="primary">點擊</Button>
```

### 選擇框

**之前：**
```tsx
<div className="relative">
  <select className="w-full px-3 py-2 pr-10...">
    <option>選項 1</option>
  </select>
  <div className="absolute right-3...">
    <svg>...</svg>
  </div>
</div>
```

**之後：**
```tsx
<Select
  options={[
    { value: '1', label: '選項 1' }
  ]}
/>
```

## 相關文件

- [完整使用指南](../../docs/ui-kit-guide.md)
- [樣式常數定義](../../lib/ui-constants.ts)

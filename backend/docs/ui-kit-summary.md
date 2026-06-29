# UI Kit 重構總結

## 已完成的工作

### 1. 創建基礎 UI 組件

已創建以下統一的 UI 組件，位於 `components/ui/` 目錄：

- ✅ **Button** (`Button.tsx`) - 統一的按鈕組件
  - 支援 5 種變體：primary, secondary, danger, ghost, outline
  - 支援 3 種尺寸：sm, md, lg
  - 支援載入狀態、圖標、全寬等屬性

- ✅ **Input** (`Input.tsx`) - 統一的輸入框組件
  - 內建標籤、錯誤訊息、輔助文字支援
  - 支援左右圖標
  - 統一樣式：`px-3 py-2`（高度約 42px）

- ✅ **Select** (`Select.tsx`) - 統一的選擇框組件
  - 內建下拉箭頭圖標
  - 支援標籤、錯誤訊息、輔助文字
  - 統一樣式與 Input 一致

- ✅ **Textarea** (`Textarea.tsx`) - 文本區域組件
  - 與 Input 統一樣式規範

- ✅ **FileInput** (`FileInput.tsx`) - 檔案上傳組件
  - 統一的檔案選擇樣式
  - 內建檔案按鈕樣式

- ✅ **Label** (`Label.tsx`) - 標籤組件
  - 支援必填標記和輔助文字

- ✅ **Badge** (`Badge.tsx`) - 標籤/徽章組件
  - 支援多種變體和尺寸
  - 統一的圓角和顏色

- ✅ **Card** (`Card.tsx`) - 卡片組件
  - 支援標題、底部、懸停效果
  - 可選內邊距

### 2. 創建工具函數和常數

- ✅ **utils.ts** (`lib/utils.ts`) - 類名合併工具函數
  - `cn()` 函數用於合併 Tailwind 類名

- ✅ **ui-constants.ts** (`lib/ui-constants.ts`) - 統一樣式常數
  - 尺寸定義（SIZES）
  - 顏色定義（COLORS）
  - 間距定義（SPACING）
  - 圓角定義（RADIUS）
  - 陰影定義（SHADOWS）
  - 過渡動畫定義（TRANSITIONS）
  - 輸入框基礎樣式（INPUT_BASE_STYLES）
  - 按鈕基礎樣式（BUTTON_BASE_STYLES）

### 3. 更新現有組件

- ✅ **PageCard** - 已更新為使用新的 Card 組件
- ✅ **YearMonthPicker** - 已統一輸入框高度（添加 `min-h-[42px]`）

### 4. 文檔

- ✅ **UI Kit 使用指南** (`docs/ui-kit-guide.md`) - 完整的使用文檔
- ✅ **UI Kit README** (`components/ui/README.md`) - 組件庫說明

## 統一樣式規範

### 輸入框
- **高度**：統一使用 `px-3 py-2`（約 42px）
- **邊框**：`border-2 border-neutral-200`
- **聚焦**：`focus:ring-2 focus:ring-primary focus:border-primary`
- **過渡**：`transition-all duration-200`

### 按鈕
- **基礎樣式**：`rounded-lg font-medium`
- **過渡**：`transition-all duration-200`
- **聚焦**：`focus:ring-2`
- **禁用**：`disabled:opacity-50 disabled:cursor-not-allowed`

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

## 使用方式

### 導入組件

```tsx
import { Button, Input, Select, Card } from '@/components/ui'
// 或
import { Button, Input, Select, Card } from '@/components'
```

### 基本範例

```tsx
<Card>
  <Input 
    label="商品名稱"
    placeholder="請輸入商品名稱"
    required
  />
  <Select
    label="分類"
    options={[
      { value: '1', label: '一番賞' },
      { value: '2', label: '轉蛋' },
    ]}
  />
  <Button variant="primary">提交</Button>
</Card>
```

## 下一步建議

1. **逐步遷移現有頁面**
   - 優先遷移表單密集的頁面（如商品新增/編輯頁面）
   - 逐步替換現有的原生 HTML 元素

2. **擴展組件**
   - 根據需求添加更多組件（如 DatePicker、Checkbox、Radio 等）
   - 添加更多變體和尺寸選項

3. **測試**
   - 確保所有組件在不同瀏覽器中正常運作
   - 測試無障礙功能

4. **文檔完善**
   - 添加更多使用範例
   - 創建 Storybook 或其他組件展示工具

## 檔案結構

```
components/
  ui/
    Button.tsx
    Input.tsx
    Select.tsx
    Textarea.tsx
    FileInput.tsx
    Label.tsx
    Badge.tsx
    Card.tsx
    index.ts
    README.md

lib/
  utils.ts
  ui-constants.ts

docs/
  ui-kit-guide.md
  ui-kit-summary.md
```

## 注意事項

1. **依賴問題**：`cn()` 函數目前使用簡化實現，不依賴外部庫。如需更強大的類名合併功能，可安裝 `clsx` 和 `tailwind-merge`。

2. **向後兼容**：現有頁面仍可正常運作，新頁面建議使用 UI Kit 組件。

3. **自訂樣式**：所有組件都支援 `className` prop，可進行自訂樣式擴展。

# UI Kit 使用指南

本專案已建立統一的 UI Kit，確保全站樣式一致性。

## 基礎組件

### Button（按鈕）

```tsx
import { Button } from '@/components/ui'

// 基本使用
<Button>點擊我</Button>

// 不同變體
<Button variant="primary">主要按鈕</Button>
<Button variant="secondary">次要按鈕</Button>
<Button variant="danger">危險按鈕</Button>
<Button variant="ghost">幽靈按鈕</Button>
<Button variant="outline">外框按鈕</Button>

// 不同尺寸
<Button size="sm">小按鈕</Button>
<Button size="md">中按鈕（預設）</Button>
<Button size="lg">大按鈕</Button>

// 帶圖標
<Button 
  leftIcon={<Icon />}
  rightIcon={<Icon />}
>
  帶圖標的按鈕
</Button>

// 載入狀態
<Button isLoading>載入中...</Button>

// 全寬
<Button fullWidth>全寬按鈕</Button>
```

### Input（輸入框）

```tsx
import { Input } from '@/components/ui'

// 基本使用
<Input 
  label="商品名稱"
  placeholder="請輸入商品名稱"
  required
/>

// 帶錯誤訊息
<Input 
  label="電子郵件"
  type="email"
  error="請輸入有效的電子郵件地址"
/>

// 帶輔助文字
<Input 
  label="價格"
  type="number"
  helperText="請輸入數字"
/>

// 帶圖標
<Input 
  label="搜尋"
  leftIcon={<SearchIcon />}
  rightIcon={<ClearIcon />}
/>
```

### Select（選擇框）

```tsx
import { Select } from '@/components/ui'

<Select
  label="分類"
  options={[
    { value: '一番賞', label: '一番賞' },
    { value: '轉蛋', label: '轉蛋' },
    { value: '盒玩', label: '盒玩' },
  ]}
  required
/>
```

### Textarea（文本區域）

```tsx
import { Textarea } from '@/components/ui'

<Textarea
  label="商品描述"
  rows={4}
  placeholder="請輸入商品描述"
/>
```

### FileInput（檔案上傳）

```tsx
import { FileInput } from '@/components/ui'

<FileInput
  label="商品圖片"
  accept="image/*"
  helperText="支援 JPG、PNG 格式"
/>
```

### Badge（標籤）

```tsx
import { Badge } from '@/components/ui'

<Badge variant="primary">主要</Badge>
<Badge variant="success">成功</Badge>
<Badge variant="warning">警告</Badge>
<Badge variant="danger">危險</Badge>
<Badge variant="info">資訊</Badge>

// 不同尺寸
<Badge size="sm">小標籤</Badge>
<Badge size="md">中標籤（預設）</Badge>
<Badge size="lg">大標籤</Badge>
```

### Card（卡片）

```tsx
import { Card } from '@/components/ui'

// 基本使用
<Card>
  <p>卡片內容</p>
</Card>

// 帶標題和底部
<Card
  header={<h3>標題</h3>}
  footer={<Button>確認</Button>}
>
  卡片內容
</Card>

// 無內邊距
<Card noPadding>
  無內邊距的內容
</Card>

// 懸停效果
<Card hover>
  懸停時有陰影效果
</Card>
```

### Label（標籤）

```tsx
import { Label } from '@/components/ui'

<Label required helperText="這是輔助文字">
  欄位名稱
</Label>
```

## 樣式常數

所有樣式常數定義在 `lib/ui-constants.ts`：

- `SIZES` - 尺寸定義（sm, md, lg）
- `COLORS` - 顏色定義（primary, secondary, danger, success, warning）
- `SPACING` - 間距定義
- `RADIUS` - 圓角定義
- `SHADOWS` - 陰影定義
- `TRANSITIONS` - 過渡動畫定義

## 遷移指南

### 舊的輸入框寫法

```tsx
<input
  type="text"
  className="w-full px-3 py-2 bg-white border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
/>
```

### 新的輸入框寫法

```tsx
<Input
  label="商品名稱"
  placeholder="請輸入商品名稱"
/>
```

### 舊的按鈕寫法

```tsx
<button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark">
  點擊我
</button>
```

### 新的按鈕寫法

```tsx
<Button variant="primary">點擊我</Button>
```

## 統一規範

### 輸入框高度

所有輸入框統一使用 `px-3 py-2`（高度約 42px），確保視覺一致性。

### 按鈕樣式

- Primary: 藍色背景，白色文字
- Secondary: 灰色背景，深色文字
- Danger: 紅色背景，白色文字
- Ghost: 透明背景，懸停時有背景
- Outline: 白色背景，灰色邊框

### 間距

- 表單元素之間：`gap-3`（12px）
- 卡片內邊距：`p-6`（24px）
- 標籤與輸入框之間：`mb-1.5`（6px）

### 圓角

- 輸入框、按鈕、卡片：`rounded-lg`
- 標籤：`rounded-full`

### 過渡動畫

所有互動元素統一使用 `transition-all duration-200`。

## 最佳實踐

1. **優先使用 UI Kit 組件**：避免直接寫原生 HTML 元素和 Tailwind 類名
2. **保持一致性**：使用統一的尺寸、顏色和間距
3. **響應式設計**：組件已內建響應式支援
4. **無障礙設計**：所有組件都包含適當的 label 和 aria 屬性
5. **錯誤處理**：使用組件的 `error` prop 顯示錯誤訊息

## 範例頁面

參考以下頁面查看實際使用範例：

- `/app/products/new/page.tsx` - 商品新增頁面
- `/app/products/[id]/page.tsx` - 商品編輯頁面

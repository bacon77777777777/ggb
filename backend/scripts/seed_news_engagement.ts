/**
 * 為現有新聞文章補充機器人假讚 + 假留言
 * npx tsx scripts/seed_news_engagement.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// 各種風格的留言池
const COMMENTS_POOL: string[] = [
  // 自然期待
  '好期待這個！要在台灣上市嗎？',
  '這個系列一直都很喜歡，這次又出新的了！',
  '感謝分享情報，馬上收藏',
  '這個造型真的很可愛耶',
  '終於等到了，一定要收！',
  '看起來品質很不錯，值得入手',
  '台灣版有嗎？什麼時候開放購買？',
  '看到這個就衝動消費了，荷包不保',
  '這個系列之前有買過，質感真的不錯',
  '剛好在找這類商品，感謝情報',
  // 北爛/吐槽
  '又要噴錢了，感謝貧窮',
  '我的錢包看到這個消息直接哭出來',
  '廠商又在挖錢坑，但還是會跳',
  '抽一次買十次，吉吉比讓我窮光蛋',
  '已經把腎賣掉了，荷包只剩感情',
  '每次看到這種情報，我媽就多了一個擔心的理由',
  '都說要節制了，但這款真的很難忍',
  '出這個是在逼人破產嗎哈哈哈',
  // 搞笑
  '我：我不買了。看到這個：好的我說謊',
  '錢包震怒，本人沉默，最後還是買了',
  '爸媽說我亂花錢，但他們不懂這有多值得',
  '本來想存錢買機車，現在打算買腳踏車',
  '另一半說不能再買了，報告這是「必需品」',
  '我的理智：不要買。我的手：已下單',
  // 生氣/急迫
  '台灣怎麼這麼慢，日本早就在賣了！',
  '一直缺貨！每次都搶不到',
  '代購價格都被炒爛了，希望正式引進',
  '上次抽到D賞，這次一定要抽到A賞！',
  '限量版永遠買不到，到底怎樣才能搶到',
]

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function main() {
  // 取得所有上架文章
  const { data: articles, error: artErr } = await supabase
    .from('news')
    .select('id, title')
    .eq('is_active', true)

  if (artErr || !articles?.length) {
    console.error('無法取得文章:', artErr?.message)
    process.exit(1)
  }
  console.log(`找到 ${articles.length} 篇文章`)

  // 取得機器人帳號
  const { data: bots, error: botErr } = await supabase
    .from('users')
    .select('id')
    .eq('is_bot', true)
    .limit(80)

  if (botErr || !bots?.length) {
    console.error('無法取得機器人帳號:', botErr?.message)
    process.exit(1)
  }
  console.log(`找到 ${bots.length} 個機器人`)

  const botIds = bots.map(b => b.id)

  // 清除現有機器人讚/留言（避免重複）
  console.log('清除舊的機器人互動...')
  await supabase.from('news_likes').delete().in('user_id', botIds)
  await supabase.from('news_comments').delete().in('user_id', botIds)

  let totalLikes = 0
  let totalComments = 0

  for (const article of articles) {
    // 每篇隨機 5-28 個讚
    const likeCount = randomBetween(5, 28)
    const likeUsers = shuffle(botIds).slice(0, likeCount)

    const likeRows = likeUsers.map(uid => ({
      news_id: String(article.id),
      user_id: uid,
      created_at: new Date(Date.now() - randomBetween(0, 86400_000 * 3)).toISOString(),
    }))

    const { error: likeErr } = await supabase.from('news_likes').insert(likeRows)
    if (!likeErr) totalLikes += likeRows.length

    // 每篇隨機 1-4 則留言
    const commentCount = randomBetween(1, 4)
    const commentUsers = shuffle(botIds).filter(id => !likeUsers.slice(0, 3).includes(id)).slice(0, commentCount)
    const commentTexts = shuffle(COMMENTS_POOL).slice(0, commentCount)

    const commentRows = commentUsers.map((uid, i) => ({
      news_id: String(article.id),
      user_id: uid,
      content: commentTexts[i],
      created_at: new Date(Date.now() - randomBetween(0, 86400_000 * 2)).toISOString(),
    }))

    const { error: commentErr } = await supabase.from('news_comments').insert(commentRows)
    if (!commentErr) totalComments += commentRows.length

    console.log(`  [${article.id}] 讚 ${likeRows.length}，留言 ${commentRows.length}`)
  }

  console.log(`\n完成！共新增 ${totalLikes} 個讚，${totalComments} 則留言`)
}

main().catch(console.error)

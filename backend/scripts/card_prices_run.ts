/** 手動跑一次抽卡市價更新（吃 .env.local 指向的環境）。  npx tsx scripts/card_prices_run.ts */
import { runCardPriceUpdate } from '../lib/cardPrices'
runCardPriceUpdate().then(s => { console.log(JSON.stringify(s, null, 2)) }).catch(e => { console.error(e); process.exit(1) })

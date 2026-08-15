/* eslint-disable */
// @ts-nocheck
/*
 * 商城原型引擎 —— 自 docs/prototypes/ggb-market-taobao_3.html 逐字移植（老闆的定版原型）。
 *
 * ⚠️ 這一階段刻意「先 UI 後接口」（老闆指定）：整套跑在本檔內的假資料上，
 * 交互與原型 1:1。之後接後端時，逐段把資料存取換成 supabase 呼叫、
 * 其餘渲染邏輯不動 —— 所以請不要在這裡「順手重構」，
 * 檔案結構跟原型檔對齊，兩邊 diff 得起來才改得安全。
 *
 * 宿主適配（不碰行為）：
 *   1. `$`／querySelectorAll 以 root 為範圍（原型是整頁 document）
 *   2. 結尾回傳 destroy()：清計時器與 AudioContext、popstate 監聽，給 React unmount 用
 *   3. opts.initialTab：支援 /sell?tab= 深連結（現在引擎自己讀網址，這個只是相容）
 *   4. opts.item／opts.itemData：商品詳情獨立頁模式（/sell/<id>）—— 沒有分頁列，#screen 就是那件商品
 *   5. opts.nav(url)／opts.onBack()：宿主給的換頁與返回（next/navigation）
 *   6. 網址同步：分頁 ?tab=、頁面級彈層 ?v=…，見「宿主適配：網址同步」那一段
 */
export function initMall(root, opts = {}) {

const $=(id)=>root.querySelector("#"+id);
/* 商品詳情獨立頁模式：/sell/<id>。BASE 是這個宿主的路徑，網址同步只在這條路徑上動作 */
const ITEM_MODE=!!opts.item;
const BASE=ITEM_MODE?"/sell/"+opts.item:"/sell";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nt=n=>Number(n).toLocaleString("zh-TW");
/* 賣家名 → 真實頭像網址。原型只有程式畫的臉，接上真資料後
   有設頭像的就放圖，沒設的才退回原型那張臉（新用戶本來就沒頭像）。*/
const AV={};
const avatar=n=>{
  if(AV[n])return `<img src="${esc(AV[n])}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`;
  const h=(n.charCodeAt(0)*37+n.length*61)%360;
  return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="hsl(${h} 60% 92%)"/>
    <circle cx="14" cy="15" r="6" fill="hsl(${h} 55% 74%)"/><circle cx="34" cy="15" r="6" fill="hsl(${h} 55% 74%)"/>
    <circle cx="24" cy="26" r="14" fill="hsl(${h} 60% 82%)"/>
    <circle cx="19" cy="24" r="2.4" fill="#3A3A3A"/><circle cx="29" cy="24" r="2.4" fill="#3A3A3A"/>
    <ellipse cx="24" cy="30" rx="3" ry="2" fill="hsl(${h} 45% 58%)"/>
    <path d="M20 34q4 3 8 0" stroke="#3A3A3A" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
};
const hue=n=>`hsl(${(n.charCodeAt(0)*37+n.length*61)%360} 45% 62%)`;
const SHIP=60;               // 預設運費，賣家可自訂
const shipTxt=v=>v?`運費 ${v}`:"免運費";

const TIERS=[
 {k:3,n:"金牌",ratio:.3,max:60000,cond:"≥100 單 · 成交率 ≥98%"},
 {k:2,n:"銀牌",ratio:.6,max:13000,cond:"≥10 單 · 成交率 ≥95%"},
 {k:1,n:"新手",ratio:1, max:3000, cond:"完成 <10 單"}
];
const tierOf=s=>(s.done>=100&&s.rate>=98)?TIERS[0]:(s.done>=10&&s.rate>=95)?TIERS[1]:TIERS[2];
const skus=it=>it.specs?it.specs.o.reduce((a,o)=>a.concat(o.items),[]):[];
const minP=it=>it.specs?Math.min.apply(null,skus(it).map(x=>x.p)):it.p;
const totQ=it=>it.specs?skus(it).reduce((n,x)=>n+x.q,0):it.q;
const guard=it=>{const t=tierOf(it),p=minP(it);return{tier:t,need:Math.ceil(p*t.ratio),total:p+(it.ship??SHIP)}};

/* 商品插畫 */
const A={
 fig:(a,b)=>`<svg viewBox="0 0 100 100"><path d="M28 30a22 22 0 0144 0v6H28z" fill="${a}"/><circle cx="30" cy="24" r="9" fill="${a}"/><circle cx="70" cy="24" r="9" fill="${a}"/><rect x="30" y="36" width="40" height="46" rx="14" fill="${b}"/><circle cx="41" cy="26" r="4" fill="#2B2B2B"/><circle cx="59" cy="26" r="4" fill="#2B2B2B"/><path d="M44 34q6 5 12 0" stroke="#2B2B2B" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
 card:(a,b)=>`<svg viewBox="0 0 100 100"><rect x="24" y="12" width="52" height="74" rx="6" fill="${b}" stroke="${a}" stroke-width="3"/><rect x="31" y="20" width="38" height="34" rx="4" fill="${a}"/><circle cx="50" cy="37" r="10" fill="${b}"/><rect x="31" y="60" width="38" height="4" rx="2" fill="${a}" opacity=".5"/><path d="M76 12L58 86" stroke="#fff" stroke-width="7" opacity=".2"/></svg>`,
 cap:(a,b)=>`<svg viewBox="0 0 100 100"><path d="M20 50a30 30 0 0160 0z" fill="${a}"/><path d="M20 50a30 30 0 0060 0z" fill="${b}"/><rect x="18" y="46" width="64" height="8" rx="4" fill="#fff" opacity=".55"/><ellipse cx="38" cy="34" rx="9" ry="6" fill="#fff" opacity=".4" transform="rotate(-22 38 34)"/></svg>`,
 box:(a,b)=>`<svg viewBox="0 0 100 100"><path d="M50 16l32 12v44L50 84 18 72V28z" fill="${b}"/><path d="M50 16l32 12-32 12-32-12z" fill="${a}"/><path d="M50 40v44L18 72V28z" fill="#000" opacity=".12"/><rect x="42" y="28" width="16" height="56" fill="${a}" opacity=".75"/></svg>`,
 plush:(a,b)=>`<svg viewBox="0 0 100 100"><circle cx="26" cy="36" r="12" fill="${a}"/><circle cx="74" cy="36" r="12" fill="${a}"/><circle cx="50" cy="52" r="32" fill="${b}"/><circle cx="38" cy="46" r="4.5" fill="#2B2B2B"/><circle cx="62" cy="46" r="4.5" fill="#2B2B2B"/><ellipse cx="50" cy="58" rx="6" ry="4" fill="${a}"/></svg>`
};
const PAL=[["#FF8A5B","#FFD9C2"],["#7FD1B9","#DDF3EC"],["#A99BE8","#E6E1FA"],["#FFC24B","#FFEDC7"],["#FF8FB1","#FFE0EA"],["#6FB7E8","#DCEDFA"]];
/* 真商品有圖就放圖；沒有（新上架、規格沒單獨附圖）才畫原型的 SVG 佔位。
   回傳形狀不變（{s,bg}），所以二十幾個呼叫端的模板都不用動。*/
const art=(k,i,img)=>{const p=PAL[i%PAL.length];
  return img
    ?{s:`<img src="${esc(img)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`,bg:p[1]}
    :{s:A[k](p[0],p[1]),bg:p[1]}};

let C2C=(opts.data&&opts.data.c2c&&opts.data.c2c.length)?opts.data.c2c:[
 {id:1,t:"航海王 一番賞 A賞 索隆 三刀流 造型公仔",specs:{n:"賞等",o:[{v:"A賞",items:[{n:"索隆 三刀流 造型公仔",p:2680,q:1,k:"fig"},{n:"魯夫 五檔 造型公仔",p:2980,q:1,k:"fig"}]},{v:"B賞",items:[{n:"香吉士 壓克力立牌",p:880,q:3,k:"card"},{n:"娜美 壓克力立牌",p:820,q:2,k:"card"}]},{v:"最後一賞",items:[{n:"艾斯 特典公仔",p:3600,q:1,k:"fig"}]}]},p:2680,ship:60,k:"fig",cond:"未拆",s:"阿凱の抽物間",v:1,pays:["銀行轉帳","LINE Pay"],rate:99.1,rel:8,done:412,q:1,sold:86},
 {id:2,t:"寶可夢 黑炎的支配者 皮卡丘 SAR 中文版",feat:1,p:5400,ship:60,k:"card",cond:"近全新",s:"卡神小林",v:1,pays:["銀行轉帳"],rate:98.4,rel:14,done:1280,q:1,sold:214},
 {id:3,t:"三麗鷗 大耳狗 星空系列 盒玩 全 8 入",p:1180,ship:0,k:"box",cond:"未拆",s:"小布丁玩具舖",v:1,pays:["LINE Pay"],rate:96.7,rel:22,done:188,q:3,sold:47},
 {id:4,t:"BE@RBRICK 400% 霓虹街頭聯名款",specs:{n:"尺寸",o:[{v:"400%",items:[{n:"霓虹街頭 400%",p:8900,q:1,k:"plush"}]},{v:"100%",items:[{n:"霓虹街頭 100%",p:2000,q:4,k:"plush"},{n:"夜光版 100%",p:2400,q:2,k:"plush"}]}]},feat:1,p:8900,ship:80,k:"plush",cond:"已拆封",s:"潮流倉庫 TW",v:1,pays:["銀行轉帳","LINE Pay"],rate:99.6,rel:6,done:733,q:1,sold:31},
 {id:5,t:"迪士尼 100 週年 扭蛋 米奇 復古版",p:220,ship:60,k:"cap",cond:"未拆",s:"轉蛋控 Ken",v:0,pays:["LINE Pay"],rate:88.2,rel:56,done:37,q:12,sold:9,gfree:100},
 {id:6,t:"遊戲王 25 週年 青眼白龍 亮面浮雕",p:12800,ship:60,k:"card",cond:"近全新",s:"卡神小林",v:1,pays:["銀行轉帳"],rate:98.4,rel:14,done:1280,q:1,sold:5},
 {id:7,t:"角落生物 白熊 大型絨毛玩偶 45cm",p:1450,ship:80,k:"plush",cond:"未拆",s:"小布丁玩具舖",v:1,pays:["LINE Pay"],rate:96.7,rel:22,done:188,q:2,sold:63},
 {id:8,t:"名偵探柯南 一番賞 C賞 壓克力立牌組",p:680,ship:60,k:"fig",cond:"未拆",s:"阿凱の抽物間",v:1,pays:["銀行轉帳","LINE Pay"],rate:99.1,rel:8,done:412,q:6,sold:120},
 {id:9,t:"Chiikawa 小可愛盒玩 第三彈 整箱",p:2340,ship:0,k:"box",cond:"未拆",s:"潮流倉庫 TW",v:1,pays:["銀行轉帳"],rate:99.6,rel:6,done:733,q:2,sold:28},
 {id:10,t:"咒術迴戰 五條悟 造型扭蛋 全 6 種",p:640,ship:60,k:"cap",cond:"未拆",s:"轉蛋控 Ken",v:0,pays:["LINE Pay"],rate:88.2,rel:56,done:37,q:4,sold:15}
];
const B2C=(opts.data&&opts.data.b2c&&opts.data.b2c.length)?opts.data.b2c:[
 {id:101,t:"吉吉比自製賞 台味系列 特賞 珍奶軟膠公仔",specs:{n:"口味",o:[{v:"珍奶系列",items:[{n:"珍奶 原味",p:1580,q:28,k:"fig"},{n:"珍奶 芋頭",p:1580,q:20,k:"fig"}]},{v:"茶飲系列",items:[{n:"青茶 檸檬",p:1480,q:15,k:"fig"}]}]},feat:1,p:1580,ship:60,k:"fig",q:48,sold:326},
 {id:102,t:"官方福袋 盒玩隨機 5 入 保證不重複",feat:1,p:990,ship:0,k:"box",q:120,sold:1204},
 {id:103,t:"吉吉比 × 廟口夜市 扭蛋機台紀念款",p:460,ship:0,k:"cap",q:300,sold:887},
 {id:104,t:"官方卡冊 抗UV 9 格 附卡套 100 入",p:680,ship:60,k:"card",q:75,sold:512},
 {id:105,t:"限量絨毛 吉吉比吉祥物 30cm",p:1290,ship:60,k:"plush",q:22,sold:98}
];
const S_C2C=["待付款","待確認收款","待出貨","待收貨","完成"];
const isDone=o=>o.st===(o.type==="b2c"?3:4);
const stName=o=>o.st===9?"已取消":stepsOf(o)[o.st];
function syncMine(){
  // 商品頁那件若是自己的商品也得留在池子裡（詳情頁靠 id 找），其餘照原型：自己的商品從 myList 重灌
  C2C=C2C.filter(x=>x.s!==ME.shop||(ITEM_MODE&&x.id===+opts.item));
  myList.filter(m=>m.st==="active").forEach(m=>C2C.unshift({id:m.id,t:m.t,p:m.p,ship:m.ship,k:m.k,category:m.category||"",cond:"未拆",s:ME.shop,v:1,specs:m.specs||null,
    pays:myPays.slice(),rate:ME.rate,rel:ME.rel,done:ME.done,q:m.q,sold:0,feat:(m.ads&&m.ads.length)?1:0}));
}
const S_B2C=["已付款","備貨中","已出貨","完成"];
const ME={done:346,rate:99.2,good:98.6,rel:9,name:"bacon",shop:"我的賣場"};
/* ── DB 接線（第二批）──────────────────────────────────────
   opts.db 有給就走真資料。**不做樂觀更新**：保證金、庫存、步驟都在 DB 決定，
   本機自己先改會讓老闆看到「成功了」但其實 RPC 擋下來。一律送出→重拉→重畫。*/
const DB=opts.db||null;
/* 上架類別白名單：宿主從後台「商城設定」載入注入；沒注入時用預設 */
let CATS=(opts.categories&&opts.categories.length)?opts.categories.slice():["公仔模型","盲盒盲袋","卡牌收藏","積木拼裝","娃娃玩偶","遙控玩具","益智桌遊","兒童玩具","限定收藏","玩具配件"];
let sCat="";
/* 類別 → 分類列圖片（老闆 2026-08-15 給的十張插畫，public/images/sell/category/*.webp）。
   白名單多了沒圖的類別退回線條圖示（CAT_ICON → ICONS） */
const CAT_IMG={"公仔模型":"figure","盲盒盲袋":"blindbox","卡牌收藏":"card","積木拼裝":"brick","娃娃玩偶":"plush","遙控玩具":"rc","益智桌遊":"boardgame","兒童玩具":"kids","限定收藏":"limited","玩具配件":"accessory"};
/* 類別 → 分類列線條圖示（ICONS 的 key）／示範資料的畫風／圓底色 */
const CAT_ICON={"公仔模型":"fig","盲盒盲袋":"box","卡牌收藏":"card","積木拼裝":"brick","娃娃玩偶":"plush","遙控玩具":"car","益智桌遊":"dice","兒童玩具":"balloon","限定收藏":"gem","玩具配件":"wrench",
  "一番賞":"fig","盒玩":"box","轉蛋":"cap","卡牌":"card","周邊商品":"plush"};
const CAT_KINDS={"公仔模型":["fig"],"盲盒盲袋":["box","cap"],"卡牌收藏":["card"],"積木拼裝":["box"],"娃娃玩偶":["plush"],"遙控玩具":["box"],"益智桌遊":["box"],"兒童玩具":["plush"],"限定收藏":["fig"],"玩具配件":["card"],
  "一番賞":["fig"],"盒玩":["box"],"轉蛋":["cap"],"卡牌":["card"],"周邊商品":["plush"]};
const CAT_BG=["#FFF0E6","#FFE9EC","#EAF4FF","#EAF8F1","#F3EDFF","#FFF6E0","#E8F7F5","#FFEFE0","#EEF1FF","#F6F0E8","#E9F3E0"];
if(opts.me&&opts.me.name){ME.name=opts.me.name;ME.shop=opts.me.name;ME.avatar=opts.me.avatar||""}
/* 商品詳情獨立頁：宿主單獨載好這件商品塞進池子（首頁 feed 只有前 60 筆，分享連結／舊商品不一定在裡面）*/
if(ITEM_MODE&&opts.itemData&&opts.itemData.item){
  const it=opts.itemData.item,pool=opts.itemData.official?B2C:C2C;
  const i=pool.findIndex(x=>x.id===it.id);
  if(i>=0)pool[i]=it;else pool.unshift(it);
}
[].concat(C2C,B2C).forEach(it=>{if(it&&it.avatar&&it.s)AV[it.s]=it.avatar});
if(ME.avatar)AV[ME.name]=ME.avatar;
async function pull(){
  if(!DB)return;
  const s=await DB.myState();
  if(!s||s.error||s.success===false)return;
  orders=s.orders||[];sellOrders=s.sellOrders||[];myList=s.myList||[];
  cart=s.cart||[];gbal=s.gbal||0;locked=s.locked||0;
  if(s.myPays&&s.myPays.length)myPays=s.myPays;
  syncMine();render();
  // 清單彈層開著就順手重畫（重新整理時先開空的，資料到了才有內容）；等資料的 ?v= 這時補開
  const T=topL();const f=T&&REFRESH[T.key];if(f)f();
  if(pendingRoute){const q=pendingRoute;pendingRoute=null;restoring=true;try{openRoute(q)}finally{restoring=false}}
  syncUrl();
}
/* 送一個 DB 動作。失敗就把 RPC 的訊息原字顯示（那些訊息本來就是寫給人看的），
   回 false 讓呼叫端別再往下走。*/
async function push(fn,okMsg,after){
  if(!DB)return true;
  const r=await fn();
  if(!r||r.error||r.success===false){toast((r&&(r.error||r.message))||"操作失敗");await pull();return false}
  await pull();
  if(okMsg)toast(okMsg);
  if(after)after();
  return true;
}
/* 引擎的購物車列是用索引定位的，換成 DB 需要 listing/群組/品項 */
const cartKey=c=>[c.id,c.oi,c.ii];
const payCode=n=>n==="LINE Pay"?"linepay":"bank";
const ST={active:["上架中","#3FA34D"],pending:["待審核","#E08B2C"],off:["已下架","#8C8C8C"],sold:["已售出","#8C8C8C"]};
const SO_ST=["待買家付款","待確認收款","待出貨","待收貨","已完成","已取消"];
let appeals=[];
let NOTIS=[
 {w:"seller",ic:"order",t:"有新訂單",d:"阿宏 下單「史努比 復古盒玩 全 6 入」，保證金 288G 已鎖定",tm:"10 分鐘前",go:"sorders",un:1},
 {w:"buyer", ic:"warn", t:"付款倒數剩 3 分鐘",d:"P70251180 若已完成轉帳，請立即按下「我已完成匯款」",tm:"12 分鐘前",go:"orders",un:1},
 {w:"seller",ic:"warn", t:"對帳提醒",d:"P70241560 買家已回報匯款 6 小時，請盡快確認收款（期限 24 小時）",tm:"30 分鐘前",go:"sorders",un:1},
 {w:"seller",ic:"warn", t:"訂單逾時提醒",d:"P70241188 已超過 72 小時未出貨，買家可申訴請求補償",tm:"1 小時前",go:"sorders",un:1},
 {w:"buyer", ic:"ship", t:"賣家已出貨",d:"P70250042 物流單號 F238104110，收到後請確認收貨",tm:"3 小時前",go:"orders",un:1},
 {w:"news",  ic:"ad",   t:"中元場開跑",d:"8/15-8/20 全站一番賞專題，賣家可加購專題位曝光",tm:"5 小時前",go:"",un:1},
 {w:"seller",ic:"ship", t:"待買家確認收貨",d:"P70240915 物流已送達，買家確認後保證金 384G 退還",tm:"5 小時前",go:"sorders",un:0},
 {w:"buyer", ic:"warn", t:"訂單已取消",d:"P70249815 賣家表示未收到款項，保證金保留中，可提出申訴",tm:"昨天",go:"orders",un:0},
 {w:"seller",ic:"ok",   t:"商品審核通過",d:"「間諜家家酒 一番賞 B賞 安妮亞 造型抱枕」已上架",tm:"昨天",go:"",un:0},
 {w:"news",  ic:"ok",   t:"新功能上線",d:"購物車支援跨賣家結帳，可一次成立多筆訂單",tm:"2 天前",go:"",un:0},
 {w:"seller",ic:"coin", t:"保證金已退還",d:"P70238640 交易完成，保證金已解除鎖定",tm:"3 天前",go:"",un:0}
];
let ntTab=0;
const NIC={
 order:['#FFF0E6','#FF6A00','M6 2L4 6v14a1 1 0 001 1h14a1 1 0 001-1V6l-2-4z M4 6h16'],
 warn: ['#FFECEC','#FF2D46','M12 4l9 16H3z M12 10v4 M12 17v.5'],
 ship: ['#EAF4FF','#3B8FD6','M3 7h11v8H3z M14 10h4l3 3v2h-7z M7 18a1.6 1.6 0 100-3.2A1.6 1.6 0 007 18z M18 18a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z'],
 ok:   ['#EAF8F1','#3FA34D','M4 12l5 5L20 6'],
 ad:   ['#F3EDFF','#8A6ADF','M4 9h4l7-4v14l-7-4H4z M18 9v6'],
 coin: ['#FFF6E0','#D89B2C','M12 3a9 9 0 100 18 9 9 0 000-18z M12 7v10 M9.5 9.5h5 M9.5 14h5']
};
let sellOrders=opts.data?[]:[
 {no:"P70241702",t:"史努比 復古盒玩 全 6 入 未拆",spec:"",qty:1,p:960,k:"box",cid:9002,buyer:"阿宏",st:0,dep:288,track:null,late:false,payAt:"—",last5:"—",way:"銀行轉帳",due:Date.now()+15*60000},
 {no:"P70241560",t:"間諜家家酒 一番賞 B賞 安妮亞 造型抱枕",spec:"款式：站姿",qty:1,p:1460,k:"plush",cid:9001,buyer:"豆漿",st:1,dep:384,track:null,late:false,payAt:"今天 09:41",last5:"48213",way:"銀行轉帳"},
 {no:"P70241188",t:"史努比 復古盒玩 全 6 入 未拆",spec:"",qty:1,p:960,k:"box",cid:9002,buyer:"小海豹",st:2,dep:288,track:null,late:true,payAt:"8/11 20:03",last5:"90117",way:"銀行轉帳"},
 {no:"P70240915",t:"間諜家家酒 一番賞 B賞 安妮亞 造型抱枕",spec:"款式：坐姿",qty:1,p:1340,k:"plush",cid:9001,buyer:"阿May",st:3,dep:384,track:"F238104772",late:false,payAt:"8/12 14:22",last5:"33907",way:"LINE Pay"},
 {no:"P70238640",t:"寶可夢 朱紫 補充包 未拆 3 包",spec:"",qty:2,p:1100,k:"card",cid:9003,buyer:"卡卡",st:4,dep:0,track:"F238100091",late:false,payAt:"8/09 11:05",last5:"77120",way:"銀行轉帳"}
];
let cart=opts.data?[]:[{kind:"c2c",id:1,oi:1,ii:0,qty:1,sel:true},{kind:"c2c",id:1,oi:1,ii:1,qty:1,sel:true},{kind:"b2c",id:102,oi:0,ii:0,qty:2,sel:false}];
let tab="market",seg="all",ordTab=0,orders=opts.data?[]:[
 {no:"P70251180",type:"c2c",dep:804,items:[{t:"航海王 一番賞 A賞 索隆 三刀流 造型公仔",spec:"A賞 / 索隆 三刀流",qty:1,p:2680,k:"fig",cid:1}],sub:2680,fee:60,off:0,p:2740,k:"fig",cid:1,s:"阿凱の抽物間",note:"麻煩包厚一點，謝謝",ship:{n:"7-11 交貨便",brand:"7-ELEVEN",kind:"store",d:"取貨門市"},pays:["銀行轉帳","LINE Pay"],pay:"銀行轉帳",st:0,due:Date.now()+15*60000,late:false,track:null},
 {no:"P70250042",type:"c2c",dep:1620,items:[{t:"寶可夢 黑炎的支配者 皮卡丘 SAR 中文版",spec:"",qty:1,p:5400,k:"card",cid:2}],sub:5400,fee:60,off:0,p:5460,k:"card",cid:2,s:"卡神小林",ship:{n:"7-11 交貨便",brand:"7-ELEVEN",kind:"store",d:"取貨門市"},pays:["銀行轉帳"],pay:"銀行轉帳",st:3,due:0,late:false,track:"F238104110"},
 {no:"P70249815",type:"c2c",dep:960,items:[{t:"史努比 復古盒玩 全 6 入 未拆",spec:"",qty:1,p:960,k:"box",cid:9002}],sub:960,fee:0,off:0,p:960,k:"box",cid:9002,s:"小布丁玩具舖",ship:{n:"7-11 交貨便",brand:"7-ELEVEN",kind:"store",d:"取貨門市"},pays:["LINE Pay"],pay:"LINE Pay",st:9,holdLeft:68,due:0,late:false,track:null},
 {no:"O70247731",type:"b2c",items:[{t:"官方福袋 盒玩隨機 5 入 保證不重複",spec:"",qty:1,p:990,k:"box",cid:102}],sub:990,fee:0,off:0,p:990,k:"box",cid:102,pay:"信用卡",ship:{n:"7-11 交貨便",brand:"7-ELEVEN",kind:"store",d:"取貨門市"},st:3,track:"F238100882"}
],gbal=12400,locked=0,myPays=["銀行轉帳"],myShip=60,tick=null;
let myList=opts.data?[]:[
 {id:9001,t:"間諜家家酒 一番賞 B賞 安妮亞 造型抱枕",p:1280,ship:60,k:"plush",q:2,need:384,st:"active",locked:false,ads:[{id:"feat",n:"精選商品格",left:3},{id:"cat",n:"分類首排",left:4}],views:214},
 {id:9002,t:"史努比 復古盒玩 全 6 入 未拆",p:960,ship:0,k:"box",q:2,need:288,st:"active",locked:true,ad:"",views:88},
 {id:9003,t:"寶可夢 朱紫 補充包 未拆 3 包",p:520,ship:60,k:"card",q:3,need:156,st:"pending",locked:false,ad:"",views:0}
];
/* 精選版位：每日 10 席，先買先得 */
const SLOT_TYPES=[
 {id:"feat", n:"精選商品格", d:"插在 C2C 瀏覽動線中",   price:200, seats:10, ic:"M12 3l2.4 5 5.6.8-4 3.9 1 5.5L12 15.6 6.9 18.2l1-5.5-4-3.9 5.6-.8z"},
 {id:"hero", n:"首頁輪播",   d:"C2C 最上方大圖",       price:900, seats:5,  ic:"M3 6h18v12H3zM7 18v2h10v-2"},
 {id:"kw",   n:"搜尋置頂",   d:"買家搜關鍵字時排第一", price:450, seats:3,  ic:"M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4"},
 {id:"cat",  n:"分類首排",   d:"該分類頁最上方橫列",   price:300, seats:6,  ic:"M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z"},
 {id:"topic",n:"專題位",     d:"編輯策展專題內卡片",   price:350, seats:8,  ic:"M5 4h14v16l-7-3-7 3z"},
 {id:"done", n:"完成頁推薦", d:"買家剛結完帳看到",     price:250, seats:8,  ic:"M4 12l5 5L20 6"}
];
const DATES=["8/14 四","8/15 五","8/16 六","8/17 日","8/18 一","8/19 二","8/20 三"];
const used={};SLOT_TYPES.forEach(t=>used[t.id]=[10,7,5,9,2,0,1].map(v=>Math.min(t.seats,Math.round(v*t.seats/10))));
const KEYWORDS=["一番賞","寶可夢","盒玩","BE@RBRICK","扭蛋","三麗鷗"];
/* 官方頁版位：賣給供應商，賣家端不能自助購買，由後台代為開單 */
const SUP_SLOTS=[
 {id:"b_hero", n:"官方頁輪播",   d:"官方旗艦店最上方大圖", price:1500, seats:4, ic:"M3 6h18v12H3zM7 18v2h10v-2"},
 {id:"b_new",  n:"新品首發位",   d:"新品上市當週置頂",     price:1800, seats:3, ic:"M12 3v18M5 8l7-5 7 5"},
 {id:"b_brand",n:"品牌專區",     d:"供應商專屬橫向展區",   price:1100, seats:6, ic:"M4 5h16v6H4zM4 13h16v6H4z"},
 {id:"b_feat", n:"官方頁精選格", d:"官方頁瀑布流插卡",     price:600,  seats:10,ic:"M12 3l2.4 5 5.6.8-4 3.9 1 5.5L12 15.6 6.9 18.2l1-5.5-4-3.9 5.6-.8z"}
];
SUP_SLOTS.forEach(t=>used[t.id]=[3,2,4,1,0,0,1].map(v=>Math.min(t.seats,v)));
const BRANDS=[{n:"BANPRESTO",d:"一番賞總代理"},{n:"POP MART",d:"盒玩品牌"},{n:"TOMY",d:"扭蛋機台"},{n:"Re-ment",d:"食玩微縮"}];
const allSlot=id=>SLOT_TYPES.concat(SUP_SLOTS).find(x=>x.id===id);
const slotOf=id=>SLOT_TYPES.concat(typeof SUP_SLOTS!=="undefined"?SUP_SLOTS:[]).find(x=>x.id===id);
let adSlot="feat",adStart=4,adDays=1,adKw="一番賞",pro=false,hero=0,heroT=null,promoFor=0,fromPromo=false;
let editIdx=null;
let useSpec=false,gSel=0,specTree=[{v:"",items:[{n:"",p:0,q:1}]}];
const adCost=()=>Math.round(slotOf(adSlot).price*adDays*(adDays>=7?.8:adDays>=3?.9:1));

/* ── 音效 ── */
let SND=true,AC=null,holdOsc=null;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  if(AC&&AC.state==="suspended")AC.resume();return AC}
function tone(f,d,type,vol,slideTo){
  if(!SND)return;const c=ac();if(!c)return;
  const o=c.createOscillator(),g=c.createGain();
  o.type=type||"sine";o.frequency.setValueAtTime(f,c.currentTime);
  if(slideTo)o.frequency.exponentialRampToValueAtTime(slideTo,c.currentTime+d);
  g.gain.setValueAtTime(0,c.currentTime);
  g.gain.linearRampToValueAtTime(vol||.14,c.currentTime+.012);
  g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d);
  o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+d+.02);
}
const SFX={
  tap:()=>tone(660,.06,"triangle",.08),
  add:()=>{tone(720,.08,"triangle",.1);setTimeout(()=>tone(980,.1,"triangle",.1),70)},
  err:()=>tone(180,.16,"square",.07),
  cancel:()=>tone(300,.12,"sine",.08,200),
  done:()=>{[784,1046,1318].forEach((f,i)=>setTimeout(()=>tone(f,.18,"triangle",.12),i*90))}
};
function holdSound(on){
  if(!SND){return}
  const c=ac();if(!c)return;
  if(on){
    if(holdOsc)return;
    const o=c.createOscillator(),g=c.createGain();
    o.type="sawtooth";o.frequency.setValueAtTime(220,c.currentTime);
    o.frequency.linearRampToValueAtTime(660,c.currentTime+.8);
    g.gain.setValueAtTime(.0001,c.currentTime);
    g.gain.linearRampToValueAtTime(.05,c.currentTime+.08);
    o.connect(g);g.connect(c.destination);o.start();
    holdOsc={o,g};
  }else if(holdOsc){
    const {o,g}=holdOsc;holdOsc=null;
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(g.gain.value,c.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.08);
    o.stop(c.currentTime+.1);
  }
}
root.addEventListener("pointerdown",()=>ac(),{once:true});
function toast(m){const t=$("toast");t.textContent=m;t.classList.add("on");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),2000)}
const stepsOf=o=>o.type==="b2c"?S_B2C:S_C2C;

const ICONS={
 all:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 brick:'<rect x="4" y="9.5" width="16" height="9.5" rx="1.6"/><path d="M7 9.5V6.8h3.2v2.7M13.8 9.5V6.8H17v2.7"/>',
 car:'<path d="M4.5 15.5l1.4-4.2A2 2 0 017.8 10h8.4a2 2 0 011.9 1.3l1.4 4.2V18H4.5z"/><circle cx="8" cy="18.5" r="1.6"/><circle cx="16" cy="18.5" r="1.6"/><path d="M12 10V6.5M10 6.5h4"/>',
 dice:'<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.1" fill="#FF6A00" stroke="none"/><circle cx="15.5" cy="8.5" r="1.1" fill="#FF6A00" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="#FF6A00" stroke="none"/><circle cx="8.5" cy="15.5" r="1.1" fill="#FF6A00" stroke="none"/><circle cx="15.5" cy="15.5" r="1.1" fill="#FF6A00" stroke="none"/>',
 balloon:'<path d="M12 4a5.2 5.2 0 00-5.2 5.4c0 3.3 2.9 6.1 5.2 6.1s5.2-2.8 5.2-6.1A5.2 5.2 0 0012 4z"/><path d="M11 15.5h2l-1 1.6z"/><path d="M12 17.1c-1.4 1.2 1.4 2.2 0 3.4"/>',
 gem:'<path d="M7 3.5h10l4 5.5-9 11.5L3 9z"/><path d="M3 9h18M10 3.5L8.5 9l3.5 11.5L15.5 9 14 3.5"/>',
 wrench:'<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
 tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
 fig:'<circle cx="12" cy="7" r="3.4"/><path d="M6 21c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5"/>',
 card:'<rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M9 8h6M9 12h4"/>',
 box:'<path d="M12 3l8 3.5v11L12 21l-8-3.5v-11z"/><path d="M4 6.5l8 3.5 8-3.5M12 10v11"/>',
 cap:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/>',
 plush:'<circle cx="12" cy="13" r="6.5"/><circle cx="6.5" cy="6.5" r="2.6"/><circle cx="17.5" cy="6.5" r="2.6"/>'
};
function header(){
  if(tab==="market"||tab==="official"){
    $("hdr").className="hdr";
    $("hdr").innerHTML=`<div class="srch">
      <button class="hicon" data-back="1" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <button class="sbox" data-search="1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <span class="sboxt">${tab==="market"?"搜尋一番賞、盒玩":"搜尋官方商品"}</span></button>
      <button class="hicon" data-go="cart" aria-label="購物車"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 4h2.2l2.3 11h10l2.2-8H6"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>${cart.length?`<span class="hicn">${cart.length}</span>`:""}</button>
      <button class="hicon" data-go="chats" aria-label="聊聊"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M20 12a7.5 7.5 0 01-11 6.6L4 20l1.4-4.2A7.5 7.5 0 1120 12z"/></svg>${Object.keys(UNREAD).length?`<span class="hicn">${Object.values(UNREAD).reduce((a,b)=>a+b,0)}</span>`:""}</button>
    </div>`;
  }else if(tab==="notis"){
    $("hdr").className="hdr plain";
    $("hdr").innerHTML=`<h1>通知</h1>`;
  }else{
    $("hdr").className="hdr none";
    $("hdr").innerHTML="";
  }
}
function render(){
  if(ITEM_MODE)tab="item";           // 商品頁沒有分頁：任何流程想切分頁都留在這一頁
  const s=$("screen");s.scrollTop=0;header();
  if(heroT){clearInterval(heroT);heroT=null}
  s.innerHTML={market:vMarket,official:vOfficial,notis:vNoti,me:vMe,item:vItem}[tab]();
  $("ordDot").style.display=NOTIS.filter(n=>n.un).length?"block":"none";
  if(tab==="market"||tab==="official")startHero();
}
function pcard(o){
  return `<button class="pcard${o.ad?" ft":""}" data-${o.kind}="${o.id}">
    <div class="pimg" style="background:${o.bg}">${o.svg}${o.badge}</div>
    <div class="pbody">
      <div class="ptitle">${esc(o.t)}</div>
      <div class="pprice"><i>NT$</i><b>${nt(o.p)}</b>${o.from?'<span class="from">起</span>':""}${o.right||""}</div>
      <div class="pshop"><span class="dot" style="background:${o.shopColor}"></span><span class="nm">${esc(o.shop)}</span>${o.lvl||""}</div>
      <div class="tags">${o.tags}</div>
    </div></button>`;
}
function feed(list,build,pool){
  // 右欄第一格 = 精選版位，之後每 8 格再插一次；不與相鄰或已出現過的廣告重複
  const out=[],seen=[];let f=0,prev=null;
  const pickAd=()=>{
    for(let n=0;n<pool.length;n++){
      const c=pool[(f+n)%pool.length];
      if(c!==prev&&seen.indexOf(c)<0){f=(f+n+1)%pool.length;return c}
    }
    return null;
  };
  list.forEach(it=>{
    if(pool.length&&(out.length===1||(out.length>1&&(out.length-1)%8===0))){
      const ad=pickAd();
      if(ad){
        // 兩欄 grid，索引奇偶就是左右欄。第一格維持原位，之後每次穿插左右交替出現：
        // 先放一般商品再放廣告，就把廣告推到另一欄。
        // 用商品 id 當種子而不是 Math.random() —— 每個動作都會 render 一次，
        // 真隨機會讓版位每次重畫都跳位置，看起來像畫面在閃。
        // 取 id 的高位元而不是 id%2：實測商品 id 常常整批同奇偶（種子資料連號），
        // 直接看最低位會變成「全部都在同一欄」。
        if(out.length>1&&((((ad.id*2654435761)>>>13)&1)===1)){
          out.push(build(it,false));prev=it;
          out.push(build(ad,true));seen.push(ad);
          return;
        }
        out.push(build(ad,true));seen.push(ad);
      }
    }
    out.push(build(it,false));prev=it;
  });
  if(out.length===1&&pool.length)out.push(build(pool[0],true));
  return out.join("");
}
function cardC2C(it,ad){
  const a=art(it.k,it.id,it.img),g=guard(it);
  return pcard({kind:"c2c",id:it.id,t:it.t,p:minP(it),from:!!it.specs,bg:a.bg,svg:a.s,shop:it.s,shopColor:hue(it.s),ad,
    badge:ad?'<span class="badge ft">精選</span><span class="adlbl">廣告</span>':'<span class="badge">玩家</span>',
    lvl:`<span class="lvl g${g.tier.k}">${g.tier.n}</span>`,
    right:`<span class="dep">保證金 ${nt(g.need)}G</span>`,
    tags:`${it.ship?"":'<span class="tg tg--dep">免運</span>'}${it.pays.map(p=>`<span class="tg tg--pay">${esc(p)}</span>`).join("")}`});
}
function cardB2C(it,ad){
  const a=art(it.k,it.id,it.img);
  return pcard({kind:"b2c",id:it.id,t:it.t,p:minP(it),from:!!it.specs,bg:a.bg,svg:a.s,shop:"吉吉比官方",shopColor:"#111",ad,
    badge:ad?'<span class="badge ft">精選</span><span class="adlbl">廣告</span>':'<span class="badge off">官方</span>',lvl:"",
    right:`<span class="dep off">官方出貨</span>`,
    tags:`${it.ship?"":'<span class="tg tg--off">免運</span>'}<span class="tg tg--off">刷卡分期</span><span class="tg tg--off">可退款</span>`});
}
function scards(list,label){
  return list.map(it=>{const a=art(it.k,it.id,it.img);
    return `<button class="scard" data-c2c="${it.id}"><div class="si" style="background:${a.bg}">${a.s}</div>
    <div class="st">${esc(it.t)}</div><div class="sp">NT$${nt(it.p)}</div></button>`}).join("");
}
function startHero(){
  const sl=root.querySelectorAll(".hslide");if(sl.length<2)return;
  heroT=setInterval(()=>{
    hero=(hero+1)%sl.length;
    sl.forEach((x,i)=>x.classList.toggle("on",i===hero));
    root.querySelectorAll(".hdots i").forEach((x,i)=>x.classList.toggle("on",i===hero));
  },3600);
}
function vMarket(){
  /* 分類列 = 上架白名單那幾類（老闆：兩邊要一致），不再寫死五種畫風；
     過濾看商品的類別本身，只有內建示範資料沒類別才退回用畫風對照 */
  const cats=[["all","全部"]].concat(CATS.map(c=>[c,c]));
  const inCat=x=>seg==="all"||(x.category?x.category===seg:(CAT_KINDS[seg]||[]).includes(x.k));
  const list=C2C.filter(inCat);
  const pool=C2C.filter(x=>x.feat);
  const hl=pool.slice(0,3);hero=0;
  const heroHTML=`<div class="heroC">${hl.map((it,i)=>{const a=art(it.k,it.id,it.img);return `<button class="hslide ${i===0?"on":""}" data-c2c="${it.id}">
      <span class="hart" style="background:${a.bg}">${a.s}</span>
      <span class="htx"><h3>${esc(it.t)}</h3><p>${esc(it.s)} · 已售 ${it.sold}</p>
      <span class="hprice">NT$${nt(it.p)}</span></span></button>`}).join("")}
    <span class="hdots">${hl.map((_,i)=>`<i class="${i===0?"on":""}"></i>`).join("")}</span></div>`;
  const catRow=`<div class="cats">${cats.map((c,i)=>`<button data-seg="${esc(c[0])}" aria-pressed="${seg===c[0]}">
      <span class="ci" style="background:${CAT_BG[i%CAT_BG.length]}">${CAT_IMG[c[0]]
        ?`<img src="/images/sell/category/${CAT_IMG[c[0]]}.webp" alt="" width="42" height="42" loading="lazy">`
        :`<svg viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[c[0]==="all"?"all":(CAT_ICON[c[0]]||"tag")]}</svg>`}</span>${esc(c[1])}</button>`).join("")}</div>`;
  const catStrip=seg!=="all"?`<div class="strip"><div class="striphd"><b>${esc(seg)} 分類首排</b></div>
    <div class="srow">${scards(C2C.filter(x=>x.category?x.category===seg:(CAT_KINDS[seg]||[]).includes(x.k)).concat(pool).slice(0,4),"推廣")}</div></div>`:"";
  const topic=`<div class="strip">
    <div class="striphd"><b>本週一番賞精選</b><button class="more" data-more="topic">更多 ›</button></div>
    <div class="srow">${scards([C2C[0],C2C[7],C2C[5],C2C[1]].filter(Boolean),"專題")}</div></div>`;
  const draw=`<div class="dban"><div><b>抽到不想要的獎品？</b><small>從抽獎紀錄一鍵上架，賣給需要的人</small></div><span class="go">去上架</span></div>`;
  return heroHTML+catRow+catStrip+topic+draw+`<div class="grid">${feed(list,cardC2C,pool)}</div>`;
}
function vOfficial(){
  const pool=B2C.filter(x=>x.feat);
  const hot=B2C.slice().sort((a,b)=>b.sold-a.sold).slice(0,4);
  const hl=B2C.slice(0,3);hero=0;
  const heroHTML=`<div class="heroC">${hl.map((it,i)=>{const a=art(it.k,it.id,it.img);return `<button class="hslide ${i===0?"on":""}" data-b2c="${it.id}">
      <span class="hart" style="background:${a.bg}">${a.s}</span>
      <span class="htx"><h3>${esc(it.t)}</h3><p>官方直送 · 48 小時出貨</p>
      <span class="hprice">NT$${nt(it.p)}</span></span></button>`}).join("")}
    <span class="hdots">${hl.map((_,i)=>`<i class="${i===0?"on":""}"></i>`).join("")}</span></div>`;
  const newIn=`<div class="strip"><div class="striphd"><b>新品首發</b><button class="more" data-more="new">更多 ›</button></div>
    <div class="srow">${B2C.slice(0,4).map(it=>{const a=art(it.k,it.id,it.img);
      return `<button class="scard" data-b2c="${it.id}"><div class="si" style="background:${a.bg}">${a.s}</div>
      <div class="st">${esc(it.t)}</div><div class="sp">NT$${nt(it.p)}</div></button>`}).join("")}</div></div>`;
  const brand=`<div class="strip"><div class="striphd"><b>品牌專區</b></div>
    <div class="srow">${BRANDS.map((b,i)=>`<button class="bcard"><span class="bmark">${esc(b.n[0])}</span>
      <span class="bn">${esc(b.n)}</span><span class="bd">${esc(b.d)}</span></button>`).join("")}</div></div>`;
  const rank=`<div class="strip"><div class="striphd"><b>熱賣排行</b><button class="more" data-more="hot">更多 ›</button></div>
    <div class="srow">${hot.map((it,i)=>{const a=art(it.k,it.id,it.img);
      return `<button class="scard" data-b2c="${it.id}"><div class="si" style="background:${a.bg}">${a.s}<span class="mini rank">${i+1}</span></div>
      <div class="st">${esc(it.t)}</div><div class="sp">NT$${nt(it.p)}</div></button>`}).join("")}</div></div>`;
  return heroHTML+newIn+brand+rank+`<div class="grid">${feed(B2C,cardB2C,pool)}</div>`;
}
function ordersSheet(){
  sheetFull("購買清單",vOrders());
}
function vOrders(){
  const F=[["全部",o=>true],["待付款",o=>o.st===0],["進行中",o=>!isDone(o)&&o.st>0&&o.st!==9],["已完成",o=>isDone(o)],["已取消",o=>o.st===9]];
  const list=orders.filter(F[ordTab][1]);
  return `<div class="blk first tabbar2">
    <div class="ptabs">${F.map((f,i)=>{const n=orders.filter(f[1]).length;
      return `<button data-ordt="${i}" aria-pressed="${ordTab===i}"><span class="tl">${f[0]}${n?`<span class="cnt">${n}</span>`:""}</span></button>`}).join("")}</div></div>
  ${list.length?`<div class="olist">${list.map(o=>{const a=art(o.k,o.cid,o.img),S=stepsOf(o);
    return `<div class="ocard">
      <div class="ohd"><span>${o.type==="b2c"?"吉吉比官方旗艦店":esc(o.s)}</span>
        <span style="margin-left:auto" class="ost">${stName(o)}${o.late?" · 逾時":""}</span></div>
      <button class="orow" data-ord="${o.no}"><div class="th" style="background:${a.bg}">${a.s}</div>
        <div style="flex:1;min-width:0"><div class="ptitle">${esc(oItems(o)[0].t)}</div>
          <div style="font-size:11.5px;color:var(--sub);margin-top:3px">${oItems(o).length>1?`共 ${oItems(o).length} 件商品`:(oItems(o)[0].spec?esc(oItems(o)[0].spec)+" · ":"")+"數量 "+oItems(o)[0].qty}</div>
          <div style="font-size:11.5px;color:var(--sub);margin-top:2px">${o.no}</div></div>
        <div class="pprice dark" style="display:block"><i>NT$</i><b style="font-size:17px">${nt(o.p)}</b></div>
      </button>
      </div>`}).join("")}</div>`:`<div class="empty">沒有${F[ordTab][0]}的訂單</div>`}`;
}
function vMe(){
  const t=tierOf(ME);
  const cnt=f=>orders.filter(f).length;
  const cells=[["待付款",o=>o.st===0,1],["待確認收款",o=>o.st===1,2],["待出貨",o=>o.st===2,2],["待收貨",o=>(o.type==="b2c"?o.st===2:o.st===3),2]];
  return `<div class="mehd">
    <div class="metopbar">
      <button class="hicon" data-go="cart" aria-label="購物車"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 4h2.2l2.3 11h10l2.2-8H6"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>${cart.length?`<span class="hicn">${cart.length}</span>`:""}</button>
      <button class="hicon" data-go="chats" aria-label="聊聊"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M20 12a7.5 7.5 0 01-11 6.6L4 20l1.4-4.2A7.5 7.5 0 1120 12z"/></svg>${Object.keys(UNREAD).length?`<span class="hicn">${Object.values(UNREAD).reduce((a,b)=>a+b,0)}</span>`:""}</button>
    </div>
    <div class="meid"><div class="meav">${ME.avatar?`<img src="${esc(ME.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`:ME.name[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0"><b>${ME.name}</b>
      <div class="mebadges"><button class="bdg gold" data-go="rep">${t.n}賣家 ›</button><span class="bdg verify">實名認證</span>
      ${pro?'<span class="bdg gold">官方認證商家</span>':""}<span class="bdg">完成 ${nt(ME.done)} 單</span></div></div>
    </div></div>
  <div class="mecard">
    <div><div class="n r">${ME.rate}%</div><div class="c">成交率</div></div>
    <div><div class="n">${ME.rel} 分</div><div class="c">平均出貨</div></div>
    <div><div class="n">${ME.good}%</div><div class="c">好評率</div></div>
    <div><div class="n">${nt(locked)}</div><div class="c">保證金鎖定</div></div>
  </div>
  ${pro?"":`<div class="upsell"><b>升級官方認證商家</b><p>店鋪頁 · 認證徽章 · 自家商品置頂 · 單件售價上限提高一級</p>
    <button class="go" data-go="pro">1,200G／月　立即升級</button></div>`}
  <div class="mecard block">
    <div class="mchd"><b>購買清單</b><button class="ar" data-orders="0">全部 ›</button></div>
    <div class="mcells">
      ${cells.map(([n,f,tabi])=>`<button data-orders="${tabi}"><div class="n${cnt(f)?" r":""}">${cnt(f)}</div><div class="c">${n}</div></button>`).join("")}
    </div>
  </div>
  <div class="mlist">
    <button class="mrow" data-go="sell">我要上架<span class="ar">上架不扣 ›</span></button>
    <button class="mrow" data-go="sorders">賣家訂單<span class="hot">${sellOrders.filter(o=>o.st>=1&&o.st<=2).length} 待處理</span><span class="ar">›</span></button>
    <button class="mrow" data-go="ads">廣告中心<span class="hot">6 種版位</span><span class="ar">›</span></button>
    <button class="mrow" data-go="dep">保證金規則<span class="ar">賣出才收 ›</span></button>
    <button class="mrow" data-go="admin">後台 · 檢舉判定<span class="hot">demo</span><span class="ar">${appeals.length} 待處理 ›</span></button>
    <button class="mrow" data-go="paycfg">收款設定<span class="ar">${myPays.join("、")} ›</span></button>
    <button class="mrow" data-go="addr">收貨地址<span class="ar">已設定 2 筆 ›</span></button>
    <button class="mrow" data-go="settings">設定<span class="ar">›</span></button>
  </div>
  ${myList.length?`<div class="mine">
    <div class="minehd"><b>我的商品</b><span class="ar">${myList.filter(m=>m.st==="active").length} 上架中 · ${myList.filter(m=>m.st==="pending").length} 待審${myList.filter(m=>m.st==="off").length?` · ${myList.filter(m=>m.st==="off").length} 已下架`:""}</span></div>
    ${myList.map((m,i)=>({m,i})).sort((a,b)=>(a.m.st==="off"?1:0)-(b.m.st==="off"?1:0)).map(({m,i})=>{const a=art(m.k,m.id,m.img);
      return `<div class="mrowi${m.st==="off"||m.st==="pending"?" dim":""}">
      <div class="mth" style="background:${a.bg}">${a.s}</div>
      <div class="mmeta"><div class="mt">${esc(m.t)}</div>
        <div class="mp">NT$${nt(m.p)}</div>
        <div class="ms">${m.specs?(m.specs.o.length>1||m.specs.o[0].v?`${esc(m.specs.n)} ${m.specs.o.length} 組／`:"")+`${m.specs.o.reduce((n,o)=>n+o.items.length,0)} 品項 · `:""}${m.ship?`運費 ${nt(m.ship)}`:"免運費"} · 庫存 ${m.q} · 瀏覽 ${m.views}</div>
        ${m.ads&&m.ads.length?`<div class="promoline">${m.ads.map(x=>`<span class="promoing">${esc(x.n)}，剩 ${x.left} 天</span>`).join("")}</div>`:""}
        <div class="ms" style="color:${m.locked?"var(--red)":"var(--sub)"}">${ST[m.st][0]} · ${m.locked?`保證金 ${nt(m.need)}G 鎖定中`:`賣出收 ${nt(m.need)}G`}</div></div>
      <button class="mdots" data-menu="${i}" aria-label="更多操作">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg></button>
      <div class="mact">
        ${m.st==="pending"?`<button class="mdis" disabled>審核中</button>`
          :`<button class="${m.ads&&m.ads.length?"mgold":"mprimary"}" data-promo="${i}">${m.ads&&m.ads.length?"加購推廣":"推廣"}</button>`}
      </div></div>`}).join("")}</div>`:`<div class="mine"><div class="minehd"><b>我的商品</b></div>
    <p class="hint" style="padding:14px 0 18px;text-align:center">還沒有上架的商品</p></div>`}`;
}
function repSheet(){
  const t=tierOf(ME),gap=t.k===3?0:(t.k===2?100-ME.done:10-ME.done);
  sheet("賣家信譽",`<div class="blk first">
    <div class="donebox" style="padding:6px 0 14px">
      <span class="bdg gold" style="font-size:12px;padding:4px 12px;border:1px solid #F5C24B">${t.n}賣家</span>
      <div class="donet" style="font-size:32px;margin-top:12px;font-family:'Oswald'">${ME.good}<span style="font-size:14px;color:var(--sub)"> / 100</span></div>
      <div style="font-size:12px;color:var(--sub);margin-top:2px">信譽分數</div>
      <div class="track" style="background:#EEE;margin:14px 0 0;height:6px;border-radius:4px;overflow:hidden"><div style="width:${ME.good}%;height:100%;background:linear-gradient(90deg,var(--tao1),var(--tao2))"></div></div>
      <div style="font-size:11.5px;color:var(--sub);margin-top:8px">${t.k===3?"已達最高等級":`再完成 ${gap} 單升級`}</div></div>
    <div class="kv"><span>成交率</span><span>${ME.rate}%</span></div>
    <div class="kv"><span>平均出貨</span><span>${ME.rel} 分</span></div>
    <div class="kv"><span>好評率</span><span>${ME.good}%</span></div>
    <div class="kv"><span>完成單數</span><span>${nt(ME.done)} 單</span></div>
    <div class="kv noline"><span>保證金比例</span><span>售價 ${t.ratio*100}%</span></div></div>
  <div class="blk"><div class="secttl">等級與比例</div>
    <table class="t"><tr><th>等級</th><th>條件</th><th>保證金</th><th>單件最高賣</th></tr>
    ${TIERS.slice().reverse().map(x=>`<tr class="${x.k===t.k?"me":""}"><td>${x.n}</td><td style="color:var(--sub)">${x.cond}</td><td>售價 ${x.ratio*100}%</td><td>${nt(x.max)}</td></tr>`).join("")}</table></div>`);
}
const SELLER_INFO={"阿凱の抽物間":{n:"高大偉",p:"0910 543 328"},"卡神小林":{n:"林建志",p:"0922 118 776"},"小布丁玩具舖":{n:"陳怡君",p:"0937 220 415"},"潮流倉庫 TW":{n:"吳承翰",p:"0988 337 021"},"轉蛋控 Ken":{n:"王凱文",p:"0955 602 913"},"我的賣場":{n:"bacon",p:"0912 345 678"}};
const sellerInfo=n=>SELLER_INFO[n]||{n:"賣家",p:"—"};
const maskName=n=>n.length<=1?n:n.length===2?n[0]+"○":n[0]+"○".repeat(n.length-2)+n[n.length-1];
const shopOf=c=>{const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);
  return !it?"":(c.kind==="b2c"?"吉吉比官方旗艦店":it.s)};
const selShop=()=>{const f=cart.find(c=>c.sel);return f?shopOf(f):""};
function selectOnly(idx){
  const g=shopOf(cart[idx]);
  let cross=false;
  cart.forEach((c,i)=>{if(shopOf(c)!==g){if(c.sel)cross=true;c.sel=false}});
  cart[idx].sel=true;
  if(cross)toast("一次只能結帳一個賣場");
}
function cartSheet(){sheetFull("購物車",vCart(),{noHead:false})}
function vCart(){
  if(!cart.length)return `<div class="empty">購物車是空的<br><br>去找物或商城逛逛吧</div>`;
  const groups={};
  cart.forEach((c,i)=>{const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);if(!it)return;
    const key=c.kind==="b2c"?"吉吉比官方旗艦店":it.s;(groups[key]=groups[key]||[]).push({c,i,it})});
  const sel=cart.filter(c=>c.sel);
  const sum=sel.reduce((n,c)=>{const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);if(!it)return n;
    const sk=it.specs?it.specs.o[c.oi].items[c.ii]:{p:it.p};return n+sk.p*c.qty},0);
  return `<div class="olist" style="padding-bottom:80px">${Object.keys(groups).map(g=>{
    const idx=groups[g].map(x=>x.i), allsel=idx.every(i=>cart[i].sel);
    const gname=shopOf(cart[idx[0]]),act=!selShop()||selShop()===gname;
    return `<div class="ocard${act?"":" dimgrp"}">
    <div class="ohd" style="align-items:center">
      <button class="cbox${allsel?" on":""}" style="margin:0 8px 0 0" data-cgrp="${idx.join(",")}"></button>
      <span style="font-weight:700;color:var(--txt)">${esc(g)}</span></div>
    ${groups[g].map(({c,i,it})=>{const sk=it.specs?it.specs.o[c.oi].items[c.ii]:{n:"",p:it.p,q:it.q,k:it.k};
      const a=art(sk.k||it.k,it.id+c.oi+c.ii,sk.img||it.img);
      return `<div class="cartrow" data-csel="${i}">
        <span class="cbox${c.sel?" on":""}"></span>
        <div class="th" style="background:${a.bg}">${a.s}</div>
        <div style="flex:1;min-width:0">
          <div class="ptitle" style="height:auto">${esc(it.t)}</div>
          ${it.specs?`<button class="cspec" data-stop="1" data-cspec="${i}">${esc(it.specs.o[c.oi].v?it.specs.o[c.oi].v+" · ":"")}${esc(sk.n)}<svg class="cspec-ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>`:""}
          <div class="cbot"><div class="pprice"><i>NT$</i><b style="font-size:17px">${nt(sk.p)}</b></div>
            <div class="qty small"><button data-stop="1" data-cq="${i}:-1">－</button><span>${c.qty}</span><button data-stop="1" data-cq="${i}:1">＋</button></div>
          </div></div>
      </div>`}).join("")}
    </div>`}).join("")}
  </div>
  <div class="cartbar">
    <button class="cbox${(()=>{const g=selShop();if(!g)return false;const idx=cart.filter(c=>shopOf(c)===g);return idx.every(c=>c.sel)})()?" on":""}" data-callall="1"></button>
    <span style="font-size:12.5px">全選<br><span style="font-size:10px;color:var(--sub)">單一賣場</span></span>
    <div style="margin-left:auto;text-align:right"><div style="font-size:11px;color:var(--sub)">已選 ${sel.length} 件 · 未含運費</div>
      <div class="pprice" style="justify-content:flex-end"><i>NT$</i><b style="font-size:20px">${nt(sum)}</b></div></div>
    <button class="buy" style="flex:0 0 auto;padding:12px 22px" data-checkout="1">去買單</button>
  </div>`;
}
function specPicker(i){
  const c=cart[i],it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);
  if(!it.specs)return;
  const rows=[];
  it.specs.o.forEach((o,oi)=>o.items.forEach((m,ii)=>rows.push({oi,ii,o,m})));
  sheet("更換品項",`<div class="blk first">
    ${rows.map(r=>{const a=art(r.m.k||it.k,it.id+r.oi+r.ii,r.m.img||it.img);
      return `<button class="skurow" data-cpick="${i}:${r.oi}:${r.ii}" ${r.m.q<=0?"disabled":""} aria-pressed="${r.oi===c.oi&&r.ii===c.ii}">
        <span class="sth" style="background:${a.bg}">${a.s}</span>
        <span class="stx"><b>${esc(r.o.v?r.o.v+" · ":"")}${esc(r.m.n)}</b><span>庫存 ${r.m.q}${r.m.q<=0?" · 售完":""}</span></span>
        <span class="spr">NT$${nt(r.m.p)}</span></button>`}).join("")}</div>`);
}
function askCancel(no){
  const o=sellOrders.find(x=>x.no===no);
  if(!o){toast("這筆訂單已經結束了");return}
  $("dlg").innerHTML=`<div class="dlgbox" style="text-align:left">
    <div class="dlgt" style="text-align:center">確定沒收到這筆款項？</div>
    <div class="dlgs" style="text-align:left;margin-top:12px">
      取消前請先確認：<br>
      · 已核對銀行／LINE Pay 入帳紀錄<br>
      · 已用聊聊向買家 ${esc(o.buyer)} 確認過<br>
      · 買家回報的末五碼 ${esc(o.last5)} 與你的紀錄不符</div>
    <div class="dlgs" style="text-align:left;color:#C4342F;margin-top:10px">
      取消後你的保證金 ${nt(o.dep)}G 會進入 72 小時申訴保留期，買家提出憑證且判定成立時將賠付給買家。</div>
    <div class="dlgb" style="flex-direction:column;gap:8px">
      <button class="warn" data-socancelyes="${no}">確定取消訂單</button>
      <button data-dlgchat="${esc(o.buyer)}|${no}">先跟買家聊聊</button>
      <button data-dlgno="1">返回</button></div></div>`;
  $("dlg").classList.add("on");
}
function askDel(i){
  const c=cart[i],it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);
  $("dlg").innerHTML=`<div class="dlgbox"><div class="dlgt">要刪除這件商品嗎？</div>
    <div class="dlgs">${esc(it?it.t:"")}</div>
    <div class="dlgb"><button data-dlgno="1">取消</button><button class="warn" data-dlgyes="${i}">刪除</button></div></div>`;
  $("dlg").classList.add("on");
}
let layers=[],uidSeq=0;
const topL=()=>layers[layers.length-1];
const $$=sel=>{const L=topL();return L?L.el.querySelector(sel):null};

/* ═══ 宿主適配：網址同步 ═══
   老闆（2026-08-15）：商城每個頁面連結後面都要帶字串，重新整理／分享要能回到同一頁。
   - 分頁：/sell?tab=official|notis|me（找物就是首頁 /sell；找物的分類篩選帶 ?c=類別）
   - 頁面級彈層：?v=<名稱>[&參數]，對照見 ROUTES／openRoute
   - 商品詳情：獨立路徑 /sell/<id>（不是彈層），子彈層一樣接在後面（/sell/<id>?v=cart）
   歷史堆疊：頁面級彈層「點開」推一格（pushState），瀏覽器返回鍵就能關掉；
   程式自己關（送出成功、切分頁）同樣把那一格 pop 掉（history.back），DOM 先同步收、
   popstate 到了只對齊網址（expectPop）。子對話框（選規格、優惠券、備註…）不進網址、不推格。
   history.state 記 {mkL:最上層有網址的彈層 uid, mkP:這一格是不是我們推的}，換頁再回來還讀得到，
   所以從商品頁返回商城時重開的彈層，知道自己能不能用返回鍵關。 */
const TABS=["market","official","notis","me"];
/* 彈層標題（= layers 的 key）→ 網址參數。動態的（訂單號、店名、搜尋詞）由呼叫端 opt.route 帶 */
const ROUTES={
  "購買清單":()=>({v:"orders",t:ordTab||undefined}),
  "賣家訂單":()=>({v:"sorders",t:soTab||undefined}),
  "購物車":()=>({v:"cart"}),
  "聊聊":()=>({v:"chats"}),
  "設定":()=>({v:"settings"}),
  "收貨地址":()=>({v:"addr"}),
  "廣告中心":()=>({v:"ads"}),
  "官方認證商家":()=>({v:"pro"}),
  "保證金規則":()=>({v:"deposit"}),
  "收款設定":()=>({v:"paycfg"}),
  "賣家信譽":()=>({v:"rep"}),
  "後台 · 檢舉判定":()=>({v:"admin"}),
  "我要上架":()=>({v:"new"}),
  "結帳":()=>({v:"checkout"}),
  "本週一番賞精選":()=>({v:"more",k:"topic"}),
  "熱賣排行":()=>({v:"more",k:"hot"}),
  "新品首發":()=>({v:"more",k:"new"}),
};
/* 從別的彈層退回來時要重畫的清單頁（底下那層的狀態可能已經變了） */
const REFRESH={"購買清單":()=>ordersSheet(),"賣家訂單":()=>sellOrdersSheet()};
let popping=false,restoring=false,pendingRoute=null,expectPop=0,expectT=0;
const hstate=()=>history.state||{};
const topRouted=()=>{for(let i=layers.length-1;i>=0;i--)if(layers[i].route)return layers[i];return null};
const routeFor=(t,opt)=>opt.route||(ROUTES[t]?ROUTES[t]():null);
const hereUrl=()=>location.pathname+location.search;
function urlNow(){
  const q=new URLSearchParams();
  if(!ITEM_MODE){if(tab!=="market")q.set("tab",tab);else if(seg!=="all")q.set("c",seg)}
  const R=topRouted();
  if(R)Object.keys(R.route).forEach(k=>{const v=R.route[k];if(v!==undefined&&v!==null&&v!=="")q.set(k,String(v))});
  const s=q.toString();return BASE+(s?"?"+s:"");
}
const stateOf=pushed=>({mkL:(topRouted()||{}).uid||0,mkP:pushed!==undefined?(pushed?1:0):(hstate().mkP?1:0)});
/* 對齊網址（replace）：網址沒變只更新 state */
function syncUrl(){
  if(popping||location.pathname!==BASE)return;
  const u=urlNow();
  if(u===hereUrl())history.replaceState(stateOf(),"");else history.replaceState(stateOf(),"",u);
}
/* 新開了一個有網址的彈層 */
function openedRoute(L){
  if(location.pathname!==BASE)return;
  if(popping){L.pushed=true;history.replaceState(stateOf(),"",urlNow());return}            // 往前回到這一格：那一格本來就在
  if(restoring){L.pushed=!!hstate().mkP;history.replaceState(stateOf(),"",urlNow());return} // 重新整理／換頁回來：這格若是我們推的，返回鍵一樣能關
  const u=urlNow();
  if(u!==hereUrl()){L.pushed=true;history.pushState(stateOf(true),"",u)}
  else history.replaceState(stateOf(),"");                                                    // 同網址再疊一層（回廣告中心之類）：不推格
}
const armExpect=()=>{clearTimeout(expectT);expectT=setTimeout(()=>{expectPop=0},800)};
const routeMatch=(r,q)=>Object.keys(r).every(k=>String(r[k]===undefined||r[k]===null?"":r[k])===(q.get(k)||""));
/* 瀏覽器返回／前進：把引擎狀態對齊到網址 */
function onPop(){
  if(location.pathname!==BASE)return;   // 離開商城了，Next 自己處理
  if(expectPop>0){expectPop--;if(!expectPop)clearTimeout(expectT);syncUrl();return}   // 我們自己 pop 的：DOM 早收好了，只對齊
  const q=new URLSearchParams(location.search);
  popping=true;
  try{
    let keep=-1;
    if(q.get("v"))for(let i=layers.length-1;i>=0;i--){const r=layers[i].route;if(r&&routeMatch(r,q)){keep=i;break}}
    let closed=false;
    while(layers.length>keep+1){closeRaw();closed=true}
    if(!ITEM_MODE){
      const t=q.get("tab")||"market",c=q.get("c")||"all",segOk=c==="all"||CATS.includes(c);
      if(TABS.includes(t)&&(t!==tab||(t==="market"&&segOk&&c!==seg))){tab=t;if(t==="market"&&segOk)seg=c;syncTabs();render()}
    }
    if(q.get("v")&&keep<0)openRoute(q);
    else if(closed){const T=topL();const f=T&&REFRESH[T.key];if(f)f()}
  }finally{popping=false}
  syncUrl();
}
/* 網址上的 ?v= → 開對應彈層；開不起來（要靠記憶體狀態的結帳、還沒載到的訂單）回 false */
function openRoute(q){
  const v=q.get("v"),s=q.get("s")||"",no=q.get("no")||"",t=Math.max(0,+(q.get("t")||0)||0);
  switch(v){
    case "orders":ordTab=Math.min(t,4);ordersSheet();return true;
    case "sorders":soTab=Math.min(t,6);sellOrdersSheet();return true;
    case "order":if(!orders.find(x=>x.no===no))return false;openOrder(no);return true;
    case "sorder":if(!sellOrders.find(x=>x.no===no))return false;sellOrderDetail(no);return true;
    case "cart":cartSheet();return true;
    case "shop":if(!s)return false;shopSheet(s);return true;
    case "chats":chatList();return true;
    case "chat":if(!s)return false;chatSheet(s,null);return true;
    case "search":searchSheet(q.get("q")||"");return true;
    case "more":{const k=q.get("k");if(k!=="topic"&&k!=="hot"&&k!=="new")return false;moreSheet(k);return true}
    case "settings":settingsSheet();return true;
    case "addr":addrSheet();return true;
    case "ads":fromPromo=false;adCenter();return true;
    case "pro":goPro();return true;
    case "deposit":depInfo();return true;
    case "paycfg":payCfg();return true;
    case "rep":repSheet();return true;
    case "admin":adminPanel();return true;
    case "new":editIdx=null;useSpec=false;sCat="";specTree=[{v:"",items:[{n:"",p:0,q:1}]}];sellForm();return true;
    default:return false;
  }
}
/* 進站：先讀分頁／分類，殼畫好之後再開 ?v= 的彈層。
   進站的網址要先抄一份 —— syncTabs()/render() 中途會 replace 網址（把 ?v= 洗掉），
   restoreLayers 讀的是這份抄本，不是當下的 location */
const INIT_Q=new URLSearchParams(location.search);
function readUrl(){
  if(ITEM_MODE)return;
  const q=INIT_Q;
  const t=q.get("tab");if(TABS.includes(t))tab=t;
  const c=q.get("c");if(c&&CATS.includes(c))seg=c;
}
function restoreLayers(){
  const q=INIT_Q,v=q.get("v");
  if(!v)return;
  restoring=true;
  try{if(!openRoute(q))pendingRoute=((v==="order"||v==="sorder")&&DB)?q:null}   // 訂單要等 pull() 拉到才開得起來
  finally{restoring=false}
}

function sheet(t,h,opt){
  opt=opt||{};
  const cur=topL();
  if(cur&&cur.key===t){                       // 同一層重繪
    cur.el.querySelector(".sbd").innerHTML=h;
    const sh=cur.el.querySelector(".sheet");
    sh.classList.toggle("tall",!!opt.tall);sh.classList.toggle("nohead",!!opt.noHead);sh.classList.toggle("full",!!opt.full);
    const bk=cur.el.querySelector(".back");bk.style.display=opt.back?"grid":"none";bk.dataset.back=opt.back||"";
    cur.opt=opt;cur.route=routeFor(t,opt);syncUrl();return;
  }
  const L=document.createElement("div");
  L.className="layer";
  L.innerHTML=`<div class="scrim"></div>
    <div class="sheet${opt.tall?" tall":""}${opt.full?" full":""}${opt.noHead?" nohead":""}" role="dialog" aria-modal="true">
      <div class="shd">
        <button class="x back" style="display:${opt.back?"grid":"none"}" data-back="${opt.back||""}" aria-label="返回"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h3>${esc(t)}</h3>
        <button class="x sclose" aria-label="關閉"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
      </div><div class="sbd">${h}</div></div>`;
  $("sheets").appendChild(L);
  const rec={el:L,key:t,opt,uid:++uidSeq,route:routeFor(t,opt),pushed:false};
  layers.push(rec);
  requestAnimationFrame(()=>{L.querySelector(".scrim").classList.add("on");L.querySelector(".sheet").classList.add("on")});
  if(rec.route)openedRoute(rec);
}
function closeRaw(){
  const L=layers.pop();if(!L)return;
  L.el.querySelector(".sheet").classList.remove("on");
  L.el.querySelector(".scrim").classList.remove("on");
  setTimeout(()=>L.el.remove(),300);
  if(tick){clearInterval(tick);tick=null}
}
/* 關最上層。這層若是我們為它推的那一格（返回鍵能關的），順便把那格 pop 掉，
   不然歷史裡會留一格「按返回沒反應」的空格。DOM 一律先同步收掉，後面的程式接著畫不受影響。 */
function close(){
  const L=topL();if(!L)return;
  const own=!!(L.pushed&&L.route&&hstate().mkL===L.uid&&location.pathname===BASE);
  closeRaw();
  if(own){expectPop++;armExpect();history.back()}else syncUrl();
}
function closeAll(){
  const T=topL();let n=0;
  if(T&&T.pushed&&T.route&&hstate().mkL===T.uid&&location.pathname===BASE)n=layers.filter(l=>l.pushed).length;
  while(layers.length)closeRaw();
  if(n>0){expectPop++;armExpect();history.go(-n)}else syncUrl();
}
$("sheets").addEventListener("click",e=>{
  if(e.target.classList.contains("scrim")||e.target.closest(".sclose")){close();return}
  const bk=e.target.closest(".back");
  if(bk){const t=bk.dataset.back;if(t==="sorders"){close();sellOrdersSheet()}else if(t==="orders"){close();ordersSheet()}else close();return}
});
$("dlg").addEventListener("click",e=>{
  const b=e.target.closest("[data-dlgno],[data-dlgyes],[data-socancelyes],[data-dlgchat]");
  if(!b){if(e.target.id==="dlg")$("dlg").classList.remove("on");return}
  const d=b.dataset;
  if(d.dlgyes!==undefined){cart.splice(+d.dlgyes,1);toast("已刪除");cartSheet()}
  else if(d.socancelyes){const o=sellOrders.find(x=>x.no===d.socancelyes);
    if(!o){$("dlg").classList.remove("on");toast("這筆訂單已經結束了");close();render();return}
    o.st=5;o.holdLeft=72;
    toast("已取消，保證金進入 72 小時申訴保留期");sellOrderDetail(o.no);render()}
  else if(d.dlgchat){const p=d.dlgchat.split("|");$("dlg").classList.remove("on");
    chatSheet(p[0],Object.assign({kind:"order"},sellOrders.find(x=>x.no===p[1])||{}));return}
  $("dlg").classList.remove("on");
});
/* 搜尋 —— 版型照抽獎那邊的搜尋頁：膠囊搜尋框＋搜尋紀錄＋「熱門搜尋」整行主題色列。
   熱門關鍵字推**商城自己的內容**（上架中商品標題去重前 12 個），不是寫死的詞。 */
const HISTKEY="mallSearchHistory";
const hist={
  get(){try{const a=JSON.parse(localStorage.getItem(HISTKEY)||"[]");return Array.isArray(a)?a.slice(0,10):[]}catch(e){return[]}},
  add(t){if(!t)return;const a=this.get().filter(x=>x!==t);a.unshift(t);try{localStorage.setItem(HISTKEY,JSON.stringify(a.slice(0,10)))}catch(e){}},
  del(t){try{localStorage.setItem(HISTKEY,JSON.stringify(this.get().filter(x=>x!==t)))}catch(e){}}
};
const hotKws=()=>{const seen={},out=[];for(const it of C2C){const t=String(it.t||"").trim();
  if(t&&!seen[t]){seen[t]=1;out.push(t)}if(out.length>=12)break}return out};
function searchSheet(q){
  const kw=q||"";
  if(kw)hist.add(kw);
  const hits=kw?C2C.filter(x=>x.t.includes(kw)||x.s.includes(kw)):[];
  const top=kw?C2C.filter(x=>x.feat&&!hits.includes(x)).concat(C2C.filter(x=>x.feat))[0]:null;
  const row=it=>`<div class="orow" data-c2c="${it.id}" style="padding:10px 0;border-bottom:1px solid var(--line)">
      <div class="th" style="background:${art(it.k,it.id,it.img).bg}">${art(it.k,it.id,it.img).s}</div>
      <div style="flex:1;min-width:0"><div class="ptitle">${esc(it.t)}</div>
      <div class="pprice" style="margin-top:4px"><i>NT$</i><b style="font-size:17px">${nt(it.p)}</b></div></div></div>`;
  const h=hist.get();
  sheet("搜尋",`
  <div class="msrchbar"><div class="msrch">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input id="qIn" placeholder="搜尋商品名稱、賣家…" value="${esc(kw)}">
    <button class="sgo2" data-qgo="1">搜尋</button></div></div>
  ${kw?`<div class="blk first"><div class="secttl">搜尋結果 ${hits.length} 件</div>
    ${top?`<div style="font-size:11px;color:var(--sub);margin:2px 0 6px">關鍵字置頂 · 廣告</div>${row(top)}`:""}
    ${hits.length?hits.map(row).join(""):`<p class="hint">找不到符合的商品，換個關鍵字試試。</p>`}</div>`
  :`<div class="blk first">
    ${h.map(t=>`<div class="mhist"><button class="w" data-qs="${esc(t)}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BFBFBF" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>${esc(t)}</button>
      <button class="del" data-qdel="${esc(t)}">清除</button></div>`).join("")}
    ${hotKws().length?`<div class="kwsec">熱門搜尋</div>`:""}
    ${hotKws().map(k=>`<button class="kwrow" data-qs="${esc(k)}">${esc(k)}</button>`).join("")}
  </div>`}`,{tall:true,route:{v:"search",q:kw||undefined}});
  const el=$("qIn");el.addEventListener("keydown",e=>{if(e.key==="Enter")searchSheet(el.value.trim())});
}
function moreSheet(kind){
  const CFG={
    topic:{t:"本週一番賞精選",sub:"編輯策展 · 專題位",list:C2C.filter(x=>x.t.includes("一番賞")||x.k==="fig"),kindAttr:"c2c",lbl:"專題"},
    hot:{t:"熱賣排行",sub:"官方旗艦店",list:B2C.slice().sort((a,b)=>b.sold-a.sold),kindAttr:"b2c",lbl:"熱賣"},
    new:{t:"新品首發",sub:"供應商推廣 · 廣告",list:B2C.slice(),kindAttr:"b2c",lbl:"首發"}
  }[kind];
  sheet(CFG.t,`<div class="blk first"><div class="secttl">${CFG.sub}</div>
    ${CFG.list.map((it,i)=>{const a=art(it.k,it.id,it.img);
      return `<div class="orow" data-${CFG.kindAttr}="${it.id}" style="padding:11px 0;border-bottom:1px solid var(--line)">
      <div class="th" style="background:${a.bg};position:relative">${a.s}${kind==="hot"?`<span class="mini rank">${i+1}</span>`:""}</div>
      <div style="flex:1;min-width:0"><div class="ptitle">${esc(it.t)}</div>
      <div class="pprice" style="margin-top:4px"><i>NT$</i><b style="font-size:17px">${nt(it.p)}</b>
        <span class="dep${CFG.kindAttr==="b2c"?" off":""}">${CFG.kindAttr==="b2c"?"官方出貨":"保證金 "+nt(guard(it).need)+"G"}</span></div>
      <div style="font-size:11px;color:var(--sub);margin-top:3px">${CFG.kindAttr==="b2c"?`已售 ${nt(it.sold)} · ${it.ship?"運費 "+it.ship:"免運費"}`:`${esc(it.s)} · ${it.ship?"運費 "+it.ship:"免運費"}`}</div></div></div>`}).join("")}
    ${kind==="topic"?``:""}
    </div>`);
}
/* ── 設定 ── */
function settingsSheet(){
  const G=[["我的帳戶",[["我的地址","已設定 2 筆","addr"],["銀行帳號 / 信用卡","已綁定 1 張",""],["音效",SND?"開啟":"關閉","snd"]]],
           ["我的小幫手",[["幫助中心","",""],["吉吉比規範","",""],["使用規則","",""],["關於","v1.0.0",""]]]];
  sheetFull("設定",G.map(([t,rows])=>`
    <div class="setgrp">${esc(t)}</div>
    <div class="mlist" style="margin-top:0">
      ${rows.map(([n,v,go])=>`<button class="mrow" ${go?`data-go="${go}"`:""}>${esc(n)}<span class="ar">${esc(v)} ›</span></button>`).join("")}
    </div>`).join(""),{back:"close"});
}
function addrSheet(){
  const A=[{n:"bacon",p:"0912-345-678",a:"台北市大安區忠孝東路四段 100 號 5 樓",d:1},
           {n:"bacon（公司）",p:"0912-345-678",a:"新北市板橋區文化路一段 88 號",d:0}];
  sheetFull("收貨地址",`${A.map(x=>`<div class="blk" style="margin-bottom:8px">
    <div class="kv" style="border:0;padding:0 0 6px"><span style="color:var(--txt);font-weight:700">${esc(x.n)}</span>
      <span>${x.d?'<span class="tg tg--dep">預設</span>':""}</span></div>
    <div style="font-size:12.5px;color:var(--sub)">${esc(x.p)}</div>
    <div style="font-size:13px;margin-top:3px">${esc(x.a)}</div></div>`).join("")}
    <div class="blk"><button class="btn">＋ 新增地址</button></div>`,{back:"close"});
}
/* ── 申訴 ── */
function appealForm(no){
  const o=orders.find(x=>x.no===no);
  if(!o){toast("這筆訂單已經結束了");close();render();return}
  sheet("已匯款申訴",`
  <div class="blk first"><div class="secttl">訂單資訊</div>
    <div class="kv"><span>訂單編號</span><span>${o.no}</span></div>
    <div class="kv"><span>賣家</span><span>${esc(o.s)}</span></div>
    <div class="kv"><span>應付金額</span><span>NT$${nt(o.p)}</span></div>
    <div class="kv"><span>可獲補償</span><span style="color:var(--red)">${nt(o.dep)}G（賣家保證金）</span></div></div>
  <div class="blk"><div class="secttl">轉帳憑證</div>
    <button class="irimg" style="width:100%;height:96px;margin-bottom:12px"><span>＋<br>上傳轉帳截圖</span></button>
    <label class="f">轉出帳號末五碼</label><input class="fin" id="apLast5" placeholder="48213">
    <div class="two" style="margin-top:12px">
      <div><label class="f">轉帳時間</label><input class="fin" id="apTime" placeholder="8/13 21:40"></div>
      <div><label class="f">轉帳金額</label><input class="fin" id="apAmt" type="number" placeholder="${o.p}"></div></div>
    <button class="btn" data-apsend="${o.no}">送出申訴</button></div>`);
}
/* ── 後台檢舉判定（demo） ── */
function adminPanel(){
  sheet("後台 · 檢舉判定",appeals.length?`
  ${appeals.map((ap,i)=>`<div class="blk${i===0?" first":""}">
    <div class="secttl">${esc(ap.no)}</div>
    <div class="kv"><span>買家</span><span>${esc(ap.buyer)}</span></div>
    <div class="kv"><span>賣家</span><span>${esc(ap.seller)}</span></div>
    <div class="kv"><span>爭議金額</span><span>NT$${nt(ap.amt)}</span></div>
    <div class="kv"><span>保留中保證金</span><span style="color:var(--red)">${nt(ap.dep)}G</span></div>
    <div class="kv"><span>買家憑證</span><span>截圖 · 末五碼 ${esc(ap.last5||"—")}</span></div>
    <div class="kv"><span>剩餘保留期</span><span>${ap.holdLeft} 小時</span></div>
    <button class="btn" data-adjudge="${i}">判買家有理 · 保證金賠付並停權賣家</button>
    <button class="btn2" data-adreject="${i}">判賣家有理 · 解鎖保證金結案</button></div>`).join("")}`
  :`<div class="empty">目前沒有待判定的申訴</div>`,{tall:true});
}
/* ── 商品更多操作 ── */
function listMenu(i){
  const m=myList[i];
  sheet("商品操作",`
  <div class="blk first" style="padding:6px 16px 10px">
    <div class="mrowi" style="border-bottom:1px solid var(--line);padding-bottom:12px">
      <div class="mth" style="background:${art(m.k,m.id,m.img).bg}">${art(m.k,m.id,m.img).s}</div>
      <div class="mmeta"><div class="mt">${esc(m.t)}</div><div class="mp">NT$${nt(m.p)}</div></div></div>
    <button class="menurow" data-edit="${i}"><span class="mi">編輯商品</span><span class="ms2">修改名稱、價格、規格</span></button>
    ${m.st==="off"
      ? `<button class="menurow" data-relist="${i}"><span class="mi">重新上架</span><span class="ms2">重新出現在市集</span></button>`
      : `<button class="menurow" data-off="${i}"><span class="mi">下架商品</span><span class="ms2">${m.locked?"交易進行中，無法下架":"買家將看不到此商品"}</span></button>`}
    <button class="menurow danger" data-del="${i}"><span class="mi">刪除商品</span><span class="ms2">不可復原</span></button>
  </div>`);
}
/* ── 系統通知 ── */
function vNoti(){
  const F=[["最新消息",n=>n.w==="news"],["買家",n=>n.w==="buyer"],["賣家",n=>n.w==="seller"]];
  const list=NOTIS.filter(F[ntTab][1]);
  const html=`<div class="blk first tabbar2">
    <div class="ptabs">${F.map((f,i)=>{const un=NOTIS.filter(x=>f[1](x)&&x.un).length;
      return `<button data-ntt="${i}" aria-pressed="${ntTab===i}"><span class="tl">${f[0]}${un?`<span class="cnt">${un}</span>`:""}</span></button>`}).join("")}</div></div>
  ${list.length?`<div class="blk" style="padding:0 16px">
    ${list.map(n=>{const i=NOTIS.indexOf(n);const c=NIC[n.ic];
      return `<button class="ntrow" data-noti="${i}">
        <span class="ntic" style="background:${c[0]}"><svg viewBox="0 0 24 24" fill="none" stroke="${c[1]}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${c[2]}"/></svg></span>
        <span class="nttx"><b>${esc(n.t)}${n.un?'<i class="ntdot"></i>':""}</b><span>${esc(n.d)}</span><em>${esc(n.tm)}</em></span></button>`}).join("")}
  </div>`:`<div class="empty">目前沒有${F[ntTab][0]}通知</div>`}`;
  setTimeout(()=>{list.forEach(n=>n.un=0);const d=$("ordDot");if(d)d.style.display=NOTIS.filter(n=>n.un).length?"block":"none"},600);
  return html;
}
function notiSheet(){tab="notis";syncTabs();render();}
/* ── 對話列表 ── */
function chatList(){
  const names=Object.keys(CHATS);
  sheet("聊聊",names.length?`<div class="blk first" style="padding:0 16px">
    ${names.map(n=>{const ms=CHATS[n].filter(m=>!m.card),last=ms[ms.length-1]||{t:""};
      return `<button class="clrow" data-chat="${esc(n)}">
        <span class="uav">${avatar(n)}</span>
        <span class="cltx"><b>${esc(n)}</b><span>${esc(last.me?"我："+last.t:last.t)}</span></span>
        ${UNREAD[n]?`<span class="unread">${UNREAD[n]}</span>`:""}</button>`}).join("")}
    </div>`:`<div class="empty">還沒有對話</div>`);
}
/* ── 賣家訂單管理 ── */
let soTab=0;
const sheetFull=(t,h,opt)=>sheet(t,h,Object.assign({tall:true},opt||{}));
function sellOrdersSheet(){
  const F=[["全部",o=>true],["待付款",o=>o.st===0],["待確認收款",o=>o.st===1],["待出貨",o=>o.st===2],["待收貨",o=>o.st===3],["已完成",o=>o.st===4],["已取消",o=>o.st===5]];
  const list=sellOrders.filter(F[soTab][1]);
  sheetFull("賣家訂單",`
  <div class="blk first tabbar2">
    <div class="ptabs">${F.map((f,i)=>{const n=sellOrders.filter(f[1]).length;
      return `<button data-sot="${i}" aria-pressed="${soTab===i}"><span class="tl">${f[0]}${n?`<span class="cnt">${n}</span>`:""}</span></button>`}).join("")}</div></div>
  ${list.length?`<div class="olist">${list.map(o=>{const a=art(o.k,o.cid,o.img);
    return `<div class="ocard">
      <div class="ohd"><span>買家 ${esc(o.buyer)}</span>
        <span style="margin-left:auto" class="ost">${SO_ST[o.st]}${o.late?" · 逾時":""}</span></div>
      <button class="orow" data-sod="${o.no}"><div class="th" style="background:${a.bg}">${a.s}</div>
        <div style="flex:1;min-width:0"><div class="ptitle">${esc(o.t)}</div>
          <div style="font-size:11.5px;color:var(--sub);margin-top:3px">${o.spec?esc(o.spec)+" · ":""}數量 ${o.qty}</div>
          <div style="font-size:11.5px;color:var(--sub);margin-top:2px">付款方式 ${esc(o.way)}</div>
          <div style="font-size:11.5px;color:var(--mute);margin-top:2px">${o.no}</div></div>
        <div class="pprice dark" style="display:block"><i>NT$</i><b style="font-size:17px">${nt(o.p)}</b></div>
      </button>
      </div>`}).join("")}</div>`:`<div class="empty">沒有${F[soTab][0]}的訂單</div>`}`,{back:"close"});
}
/* ── 賣家訂單詳情 ── */
const SHIPWAYS=["7-11 交貨便","全家店到店","黑貓宅配","面交自取"];
let soWay=0;
function sellOrderDetail(no){
  const o=sellOrders.find(x=>x.no===no);
  // 付款倒數歸零時整筆從 sellOrders 移除（見 startCD 的 callback），
  // 但畫面上那顆 data-sod 還在 —— 再點就會對 undefined 取值而整頁當掉
  if(!o){toast("這筆訂單已經結束了");close();render();return}
  const a=art(o.k,o.cid,o.img);
  const paid=o.st>=2&&o.st<=4;
  const steps=o.st===5?"":`<div class="blk first"><div class="steps">${SO_ST.slice(0,5).map((n,i)=>`<div class="stp ${i<o.st?"dn":i===o.st?"nw":""}">${n}</div>`).join("")}</div></div>`;
  const banner=o.st===2?`<div class="blk okban"><span class="okic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5.2 5.2L19.5 7.5"/></svg></span>
      <div><b>已確認收款</b><span>請於 72 小時內完成出貨</span></div></div>`
    :o.st===3?`<div class="blk okban ship"><span class="okic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg></span>
      <div><b>已出貨</b><span>等待買家確認收貨，保證金隨後退還</span></div></div>`
    :o.st===4?`<div class="blk okban"><span class="okic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5.2 5.2L19.5 7.5"/></svg></span>
      <div><b>交易完成</b><span>保證金 ${nt(o.dep)}G 已退還，完成單數 +1</span></div></div>`:"";
  const soName=SHIPWAYS[soWay]||SHIPWAYS[0];
  const head=`<div class="blk">
    <div class="cogrp"><span class="uav sm">${avatar(o.buyer)}</span><b>${esc(o.buyer)}</b>
      <button class="ghostbtn" style="margin-left:auto;padding:5px 12px;font-size:12px" data-chat="${esc(o.buyer)}" data-sord2="${o.no}">聊聊</button></div>
    <div class="coitem">
      <div class="th" style="background:${a.bg}">${a.s}</div>
      <div style="flex:1;min-width:0"><div class="ptitle" style="height:auto">${esc(o.t)}</div>
        ${o.spec?`<div class="cspec" style="pointer-events:none">${esc(o.spec)}</div>`:""}
        <div class="cbot"><span style="font-size:12px;color:var(--sub)">×${o.qty}</span>
          ${paid?"":`<div class="pprice" style="margin-left:auto"><i>NT$</i><b style="font-size:16px">${nt(o.p)}</b></div>`}</div></div></div>
    ${paid?`<button class="kv payex" data-amtex="1"><span class="exlabel">金額明細<svg class="cspec-ar amtar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span><span style="color:var(--sub)">已收款</span></button>
      <div class="payexbox" id="amtBox" style="display:none">
        <div class="kv"><span>訂單金額</span><span>NT$${nt(o.p)}（含運）</span></div>
        <div class="kv"><span>收款方式</span><span>${esc(o.way)}</span></div>
        <div class="kv"><span>帳號末五碼</span><span>${esc(o.last5)}</span></div>
        <div class="kv noline"><span>我的保證金</span><span style="color:${o.st===4?"var(--sub)":"var(--red)"}">${o.st===4?"已退還":"鎖定中 "+nt(o.dep)+"G"}</span></div></div>`
      :`<div class="kv"><span>訂單金額</span><span>NT$${nt(o.p)}（含運）</span></div>
        <div class="kv"><span>收款方式</span><span>${esc(o.way)}</span></div>
        <div class="kv"><span>買家回報匯款</span><span>${esc(o.payAt)}</span></div>
        <div class="kv"><span>款項狀態</span><span style="color:${o.st<=1?"var(--red)":"var(--green)"}">${o.st===0?"買家尚未回報":o.st===1?"待你確認":"已確認收款"}</span></div>
        <div class="kv"><span>我的保證金</span><span style="color:var(--red)">${o.st===5?"保留 "+nt(o.dep)+"G":"鎖定中 "+nt(o.dep)+"G"}</span></div>`}
    <button class="kv payex noline" data-shipex="1"><span class="exlabel">配送方式<svg class="cspec-ar shipar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span><span>${esc(soName)}</span></button>
    <div class="payexbox" id="shipExBox" style="display:none">
      <div class="kv"><span>寄件方式</span><span>${esc(soName)}</span></div>
      <div class="kv"><span>買家取貨門市</span><span style="max-width:64%;text-align:right">7-11 敦南門市－台北市大安區敦化南路一段 233 號</span></div>
      <div class="kv noline"><span>收件人</span><span>${esc(o.buyer)}　+886 910 223 431</span></div>
    </div>
  </div>`;
  let top="",body="";
  if(o.st===0){
    top=`<div class="blk"><div class="secttl">付款倒數</div>
      <div class="cdblk"><div class="cdt" id="cdBig">15:00</div>
        <div class="cdnote">等待買家匯款並回報</div></div>
      <div class="kv noline"><span>逾時處理</span><span>訂單取消，保證金原額解鎖</span></div>
      <p class="autonote">買家逾時未回報，系統自動取消並解鎖保證金</p></div>`;
  }else if(o.st===1){
    top=`<div class="blk"><div class="secttl">對帳與收款</div>
      <div class="cdblk"><div class="cdt" id="cdBig">15:00</div>
        <div class="cdnote">請盡快核對入帳並確認收款</div></div>
      <div class="kv"><span>應收金額</span><span style="color:var(--red);font-weight:700">NT$${nt(o.p)}</span></div>
      <div class="kv"><span>入帳帳戶</span><span>${o.way==="LINE Pay"?"@ggb_user":"國泰世華 ****4821"}</span></div>
      <div class="kv"><span>買家回報匯款</span><span>${esc(o.payAt)}</span></div>
      <div class="kv noline"><span>帳號末五碼</span><span>${esc(o.last5)}</span></div>
      <p class="autonote">逾 15 分鐘未處理，系統視同已收款，自動進待出貨</p></div>`;
    body=`<div class="blk"><button class="btn2" style="color:var(--red)" data-socancel="${o.no}">未收到款項，取消訂單</button></div>
    <div class="abar"><button class="buy hold" id="holdPaidS"><span class="fill"></span><span class="hlab">按住確認收款</span></button></div>`;
  }else if(o.st===2){
    top=`${o.late?`<div class="blk" style="background:#FFF4F5"><div class="kv" style="border:0;padding:2px 0"><span style="color:var(--red);font-weight:700">已逾時 72 小時</span><span>買家可申訴沒收 ${nt(o.dep)}G</span></div></div>`:""}
    <div class="blk"><div class="secttl">出貨作業</div>
      <div class="two" id="soWay">${SHIPWAYS.map((w,i)=>`<button class="pick" data-soway="${i}" aria-pressed="${soWay===i}"><span class="ck"></span>${w}</button>`).join("")}</div>
      <label class="f" style="margin-top:14px">物流單號</label>
      <input class="fin" id="soTrack" placeholder="填寫或留空自動產生">
      <p class="autonote">請於 72 小時內出貨，逾時買家可申訴沒收保證金</p></div>`;
    body=`<div class="abar"><button class="buy hold" id="holdShip"><span class="fill"></span><span class="hlab">按住確認出貨</span></button></div>`;
  }else if(o.st===3){
    top=`<div class="blk"><div class="secttl">物流狀態</div>
      <div class="kv"><span>物流單號</span><a class="tracklink" href="https://eservice.7-11.com.tw/E-Tracking/search.aspx" target="_blank" rel="noopener">${esc(o.track)}</a></div>
      <div class="kv"><span>買家確認</span><span>簽收後 7 天自動完成</span></div>
      <div class="kv noline"><span>保證金</span><span>買家確認收貨後退還</span></div></div>`;
    body=`<div class="blk"><button class="btn2" data-sorecv="${o.no}">［模擬］買家確認收貨</button></div>`;
  }else if(o.st===5){
    top=`<div class="blk" style="background:#FFF4F5"><div class="secttl">已取消 · 保證金保留中</div>
      <div class="kv"><span>取消原因</span><span>賣家表示未收到款項</span></div>
      <div class="kv"><span>保留金額</span><span style="color:var(--red);font-weight:700">${nt(o.dep)}G</span></div>
      <div class="kv"><span>保留期限</span><span>72 小時（剩 ${o.holdLeft||72} 小時）</span></div>
      <div class="kv"><span>買家申訴成立</span><span style="color:var(--red)">保證金賠付買家</span></div>
      <div class="kv noline"><span>期限內無人申訴</span><span style="color:var(--green)">保證金自動解鎖</span></div></div>`;
  }else{
    top=`<div class="blk donebox" style="padding:22px 18px 18px">
      <div class="donet" style="font-size:15px">買家評價</div>
      <div class="stars ro" style="margin-top:12px">${[1,2,3,4,5].map(i=>`<span class="star on"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21.1l1.3-6.8-5-4.7 6.8-.8z"/></svg></span>`).join("")}</div>
      <p class="revtx">優質賣家！商品優！寄貨快！</p></div>`;
    body=`<div class="blk"><div class="kv"><span>物流單號</span><span>${esc(o.track)}</span></div>
      <div class="kv noline"><span>保證金</span><span style="color:var(--green)">已退還 ${nt(o.dep)}G</span></div></div>`;
  }
  sheet("訂單 "+o.no,steps+banner+top+head+body,{tall:true,back:"sorders",route:{v:"sorder",no:o.no}});
  if(o.st===0&&o.due)startCD(o,()=>{sellOrders=sellOrders.filter(x=>x.no!==o.no);toast("買家逾時未付款，保證金已解鎖");close();render()});
  if(o.st===1){
    if(!o.cdue)o.cdue=Date.now()+15*60000;
    startCD({due:o.cdue},()=>{o.st=2;toast("逾時未處理，視同已收款");sellOrderDetail(o.no);render()});
    bindHold($$("#holdPaidS"),()=>{o.st=2;toast("已確認收款，請於 72 小時內出貨");sellOrderDetail(o.no);render()});
  }
  if(o.st===2)bindHold($$("#holdShip"),()=>{
    o.st=3;o.late=false;o.track=($$("#soTrack")&&$$("#soTrack").value.trim())||"F"+String(Math.random()).slice(2,11);
    toast("已出貨，單號 "+o.track);sellOrderDetail(o.no);render();
  });
}
/* ── 店舖頁 ── */
function shopSheet(name){
  const list=C2C.filter(x=>x.s===name);
  const ref=list[0]||{rate:100,rel:0,done:0,v:0};
  const t=tierOf(ref);
  const sold=list.reduce((n,x)=>n+(x.sold||0),0);
  sheet("店舖",`
  <div class="shophero">
    <div class="shophero-in"><span class="uav big">${avatar(name)}</span>
      <div style="flex:1;min-width:0"><div class="unm"><b style="font-size:16px">${esc(name)}</b><span class="lvl g${t.k}">${t.n}賣家</span></div>
        <div class="shopsub">${ref.v?"已完成手機實名":"尚未實名"} · 在售 ${list.length} 件</div></div>
      <button class="ghostbtn" data-chat="${esc(name)}">聊聊</button></div>
    <div class="shopstat">
      <div><b>${ref.rate}%</b><span>成交率</span></div>
      <div><b>${ref.rel} 分</b><span>平均出貨</span></div>
      <div><b>${nt(ref.done)}</b><span>完成單數</span></div>
      <div><b>${nt(sold)}</b><span>本店已售</span></div>
    </div></div>
  <div class="blk" style="margin-top:8px"><div class="secttl">全部商品 ${list.length}</div></div>
  <div class="grid" style="padding-top:0">${list.map(it=>cardC2C(it,false)).join("")}</div>
  <div style="height:14px"></div>`,{route:{v:"shop",s:name}});
}

/* ── 聊聊 ── */
const CHATS={
 "小海豹":[{me:false,t:"你好，我下單的盒玩什麼時候會寄呀？"},{me:false,t:"已經匯款兩天了想確認一下"}],
 "阿May":[{me:false,t:"收到了，超可愛！謝謝"},{me:true,t:"謝謝支持～有需要再找我"}],
 "卡神小林":[{ctx:"i2",card:{kind:"item",id:2,t:"寶可夢 黑炎的支配者 皮卡丘 SAR 中文版",p:5400,k:"card",cid:2,specs:false}},{me:true,t:"請問這張還有貨嗎？"},{me:false,t:"還有一張，未過膠直接寄"}]
};
const UNREAD={"小海豹":2,"卡神小林":1};
const REPLY=["好的，稍等我確認一下庫存～","可以喔，今天下午就能寄出","這件是未拆的，照片是實拍","收到，我這邊先幫你保留"];
function chatSheet(name,ctx){
  if(!CHATS[name])CHATS[name]=[{me:false,t:"哈囉～有什麼想問的都可以問我"}];
  if(ctx){
    const key=ctx.kind==="item"?"i"+ctx.id:"o"+ctx.no;
    if(!CHATS[name].some(m=>m.ctx===key))CHATS[name].push({ctx:key,card:ctx});
  }
  drawChat(name,ctx&&ctx.kind==="item");
}
function chatCard(c){
  const a=art(c.k,c.cid||c.id,c.img);
  return c.kind==="item"
    ? `<div class="chatctx item"><div class="cchd">商品諮詢</div>
        <div class="orow"><div class="th" style="background:${a.bg}">${a.s}</div>
          <div style="flex:1;min-width:0"><div class="ptitle">${esc(c.t)}</div>
            <div class="pprice" style="margin-top:4px"><i>NT$</i><b style="font-size:16px">${nt(c.p)}</b>${c.specs?'<span class="from">起</span>':""}</div></div>
          <button class="ghostbtn" data-c2c="${c.id}">看商品</button></div></div>`
    : `<div class="chatctx"><div class="cchd">訂單諮詢</div>
        <div class="orow"><div class="th" style="background:${a.bg}">${a.s}</div>
          <div style="flex:1;min-width:0"><div class="ptitle">${esc(c.items?c.items[0].t:c.t)}${c.items&&c.items.length>1?` 等 ${c.items.length} 件`:""}</div>
            <div style="font-size:11px;color:var(--sub);margin-top:3px">${c.no} · NT$${nt(c.p)}</div></div>
          <button class="ghostbtn" data-ord="${c.no}">看訂單</button></div></div>`;
}
function drawChat(name,itemMode){
  lastItemMode=!!itemMode;
  delete UNREAD[name];
  const ms=CHATS[name];
  const QK=itemMode?["這個還有貨嗎？","可以小議嗎？","可以合併運費嗎？","有實拍照嗎？"]
                   :["請問還有貨嗎？","可以便宜一點嗎？","什麼時候出貨？","我已經匯款了"];
  sheet(esc(name),`
  <div class="chatbox" id="chatBox">${ms.map(m=>m.card?chatCard(m.card)
    : `<div class="bub ${m.me?"me":"you"}">${m.me?"":`<span class="uav sm">${avatar(name)}</span>`}<span class="tx">${esc(m.t)}</span></div>`).join("")}</div>
  <div class="quick">${QK.map(q=>`<button class="qk" data-say="${esc(q)}">${q}</button>`).join("")}</div>
  <div class="chatbar"><input class="fin" id="chatIn" placeholder="輸入訊息…"><button class="sendbtn" data-send="${esc(name)}">送出</button></div>`,{route:{v:"chat",s:name}});
  const box=$("chatBox");if(box)box.scrollTop=box.scrollHeight;
  const inp=$("chatIn");
  if(inp)inp.addEventListener("keydown",e=>{if(e.key==="Enter")say(name,inp.value)});
}
let lastItemMode=false;
function say(name,txt){
  txt=(txt||"").trim();if(!txt)return;
  CHATS[name].push({me:true,t:txt});
  drawChat(name,lastItemMode);
  setTimeout(()=>{
    CHATS[name].push({me:false,t:REPLY[Math.floor(Math.random()*REPLY.length)]});
    if($("chatBox"))drawChat(name,lastItemMode);
  },900);
}
function adCenter(){
  const cur=fromPromo?myList[promoFor]:null;
  sheet("廣告中心",`
  ${cur?`<div class="blk first" style="padding:12px 16px"><div class="orow">
    <div class="th" style="background:${art(cur.k,cur.id,cur.img).bg};width:44px;height:44px">${art(cur.k,cur.id,cur.img).s}</div>
    <div style="flex:1;min-width:0"><div class="ptitle" style="height:auto">${esc(cur.t)}</div>
      ${cur.ads&&cur.ads.length?`<div class="promoline">${cur.ads.map(x=>`<span class="promoing">${esc(x.n)}，剩 ${x.left} 天</span>`).join("")}</div>`:""}</div></div></div>`:""}
  <div class="blk${cur?"":" first"}"><div class="secttl">可購買版位</div>
    ${SLOT_TYPES.map(t=>{const on=cur&&cur.ads?cur.ads.find(x=>x.id===t.id):null,busy=!!on;
      return `<button class="slotrow${busy?" busy":""}" ${busy?`data-busy="${on.left}"`:`data-slot="${t.id}"`}>
      <span class="ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="1.8" stroke-linecap="round"><path d="${t.ic}"/></svg></span>
      <span style="flex:1;min-width:0"><b>${t.n}</b><small>${t.d}</small></span>
      <span class="pr">${busy?`<span class="busytag">推廣中</span><span class="s">剩 ${on.left} 天</span>`
        :`<span class="n">${nt(t.price)}G</span><span class="s">／天 · 每日 ${t.seats} 席</span>`}</span></button>`}).join("")}
    </div>
  <div class="blk"><div class="secttl">官方頁版位 · 供應商</div>
    ${SUP_SLOTS.map(t=>`<button class="slotrow" data-slot="${t.id}">
      <span class="ic" style="background:#F3EEE6"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#8A6A3B" stroke-width="1.8" stroke-linecap="round"><path d="${t.ic}"/></svg></span>
      <span style="flex:1;min-width:0"><b>${t.n}</b><small>${t.d}</small></span>
      <span class="pr"><span class="n" style="color:#8A6A3B">${nt(t.price)}G</span><span class="s">／天 · 每日 ${t.seats} 席</span></span></button>`).join("")}
    </div>
  ${pro?"":`<div class="blk"><div class="secttl">賣場升級</div>
    <button class="btn gold" data-go="pro">升級官方認證商家 · 1,200G／月</button></div>`}`);
}
function adUpd(){
  const el=$("adCost");if(!el)return;
  el.textContent=nt(adCost())+" G";
  $("adSum").textContent=`${DATES[adStart]} 起連續 ${adDays} 天${adSlot==="kw"?`　關鍵字「${adKw}」`:""}`;
  root.querySelectorAll("#adDays .day").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.ad===adStart));
  root.querySelectorAll("#adLen .pick").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.adlen===adDays));
}
function adBuy(id){
  adSlot=id;const t=slotOf(id);const sup=id.indexOf("b_")===0;
  if(t.seats-used[id][adStart]<=0){const f=DATES.findIndex((_,i)=>t.seats-used[id][i]>0);if(f>=0)adStart=f}
  sheet(t.n,`
  <div class="blk first"><div class="secttl">${t.n}</div>
    <p class="hint" style="margin:0 0 12px">${t.d}　${nt(t.price)}G／天　每日 ${t.seats} 席</p>
    ${sup?`<div class="admin"><b>後台代客開單</b>供應商版位不開放前台自助購買。以下為後台操作畫面：選定供應商、檔期與素材後建立排程。</div>
    <label class="f" style="margin-top:12px">供應商</label>
    <select class="fin" id="supPick">${BRANDS.map(b=>`<option>${esc(b.n)}</option>`).join("")}</select>`:""}
    <div class="secttl">選擇檔期</div>
    <div class="days" id="adDays">${DATES.map((d,i)=>{const left=t.seats-used[id][i];
      return `<button class="day" data-ad="${i}" ${left<=0?"disabled":""} aria-pressed="${i===adStart}">
      <div class="dd">${d.split(" ")[0]}</div><div class="ds">${left<=0?"已額滿":"剩 "+left+" 席"}</div></button>`}).join("")}</div>
    <div class="two" style="margin-top:10px" id="adLen">
      ${[1,3,7].map(n=>`<button class="pick" data-adlen="${n}" aria-pressed="${adDays===n}"><span class="ck"></span>${n} 天${n>1?`<small>${n===3?"9 折":"8 折"}</small>`:""}</button>`).join("")}</div>
    ${id==="kw"?`<div style="margin-top:14px"><div class="secttl">綁定關鍵字</div>
      <div class="kwchips" id="kwPick">${KEYWORDS.map(k=>`<button class="kw" data-kw="${esc(k)}" aria-pressed="${adKw===k}">${k}</button>`).join("")}</div></div>`:""}
    <div class="calcbox"><div class="l">應付</div><div class="v" id="adCost">—</div><div class="s" id="adSum">—</div></div>
    <button class="btn" data-adbuy="${id}">${sup?"建立排程":"確認購買"}</button>
    <button class="btn2" data-go="ads">回廣告中心</button></div>`);
  adUpd();
}
function goPro(){
  sheet("官方認證商家",`
  <div class="blk first"><div class="secttl">升級後解鎖</div>
    <div class="kv"><span>認證徽章</span><span>個人頁與商品卡</span></div>
    <div class="kv"><span>店鋪頁</span><span>集中展示你的商品</span></div>
    <div class="kv"><span>自家商品置頂</span><span>店鋪頁排序</span></div>
    <div class="kv"><span>單件售價上限</span><span style="color:var(--red)">提高一級</span></div>
    <div class="kv"><span>保證金比例</span><span>不變</span></div>
    <button class="btn gold" data-prob="1">1,200G／月　立即升級</button>
    <button class="btn2" data-x="1">再想想</button></div>`);
}
function recoStrip(){
  return `<div class="strip" style="margin:0 0 8px"><div class="striphd"><b>猜你喜歡</b></div>
    <div class="srow">${scards(C2C.filter(x=>x.feat).slice(0,4),"推薦")}</div></div>`;
}
/* ── 商品詳情（獨立頁 /sell/<id>）──
   老闆 2026-08-15：商品頁要是獨立頁面不是彈層，網址帶商品編號；返回鍵在左、分享鍵在右
   （分享同抽獎商品：手機系統分享面板／桌機複製連結）。點任何商品卡一律換頁（goItem）；
   版面沿用原型的商品詳情彈層內容，套在 #screen 裡當一頁，操作列固定在底部。 */
const goItem=id=>{
  if(ITEM_MODE&&+id===+opts.item){closeAll();return}   // 已經在這件商品的頁上（店舖／猜你喜歡點回自己）
  if(opts.nav)opts.nav("/sell/"+id);else location.href="/sell/"+id;
};
function itemC2C(id){goItem(id)}
function itemB2C(id){goItem(id)}
const floatNav=()=>`<div class="floatnav">
  <button class="floatback" data-iback="1" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
  <button class="floatshare" data-share="1" aria-label="分享"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></button></div>`;
function vItem(){
  const id=+opts.item;
  const c=C2C.find(x=>x.id===id),b=c?null:B2C.find(x=>x.id===id);
  if(!c&&!b)return floatNav()+`<div class="empty" style="padding-top:38vh">商品不存在或已下架</div>`;
  return floatNav()+(c?itemC2CHTML(c):itemB2CHTML(b));
}
function itemC2CHTML(it){
  const a=art(it.k,it.id,it.img),g=guard(it);
  return `  <div class="hero" style="background:${a.bg}">${a.s}</div>
  <div class="pricebar"><span class="s">NT$</span><span class="n">${nt(minP(it))}</span>${it.specs?'<span class="s">起</span>':""}
    <span class="r">${shipTxt(it.ship)}<br>已售 ${it.sold} 件</span></div>
  <div class="blk"><div class="ttl">${esc(it.t)}</div></div>
  <div class="blk">
    <div class="shoprow"><span class="uav">${avatar(it.s)}</span>
      <div style="flex:1;min-width:0"><div class="unm"><b>${esc(it.s)}</b><span class="lvl g${g.tier.k}">${g.tier.n}</span></div>
      <div style="font-size:11.5px;color:var(--sub);margin-top:2px">${it.v?"已完成手機實名":"尚未實名"}</div></div>
      <button class="ghostbtn" data-shop="${esc(it.s)}">店舖</button>
      <button class="ghostbtn" data-chat="${esc(it.s)}" data-itm2="${it.id}">聊聊</button></div>
    <div class="mstat"><div>成交率<b>${it.rate}%</b></div><div>平均出貨<b>${it.rel} 分</b></div><div>完成單數<b>${nt(it.done)}</b></div></div>
  </div>
  <div class="blk">
    <div class="kv"><span>商品狀態</span><span>${esc(it.cond)}</span></div>
    ${it.specs?(it.specs.o.length>1||it.specs.o[0].v?`<div class="kv"><span>${esc(it.specs.n)}</span><span>${it.specs.o.map(o=>esc(o.v)).join(" / ")}</span></div>`:"")+`<div class="kv"><span>可選品項</span><span>${skus(it).length} 種</span></div>`:""}
    <div class="kv"><span>收款方式</span><span>${it.pays.join(" / ")}</span></div>
    <div class="kv"><span>運送</span><span>7-11 交貨便 · ${it.ship?"買家付 "+nt(it.ship):"賣家吸收"}</span></div>
    <div class="kv"><span>買家保障</span><span style="color:var(--red)">賣家保證金 ${nt(g.need)}G</span></div>
  </div>
  <div class="abar"><button class="aicon" data-chat="${esc(it.s)}" data-itm2="${it.id}"><span class="ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M20 12a7.5 7.5 0 01-11 6.6L4 20l1.4-4.2A7.5 7.5 0 1120 12z"/></svg></span><span>私聊</span></button><button class="aicon" data-cart="${it.id}"><span class="ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 4h2.2l2.3 11h10l2.2-8H6"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg></span><span>購物車</span></button><button class="buy" data-buy="${it.id}">直接購買 · NT$${nt(g.total)}</button></div>`;
}
function itemB2CHTML(it){
  const a=art(it.k,it.id,it.img);
  return `  <div class="hero" style="background:${a.bg}">${a.s}</div>
  <div class="pricebar" style="background:linear-gradient(100deg,#333,#111)"><span class="s">NT$</span><span class="n">${nt(minP(it))}</span>${it.specs?'<span class="s">起</span>':""}
    <span class="r">${shipTxt(it.ship)}<br>已售 ${it.sold} 件</span></div>
  <div class="blk"><div class="ttl">${esc(it.t)}</div></div>
  <div class="blk">
    <div class="shoprow"><span class="dot" style="background:#111"></span>
      <div style="flex:1"><b>吉吉比官方旗艦店</b><div style="font-size:11.5px;color:var(--sub);margin-top:2px">平台自營 · 開立電子發票</div></div>
      <span class="tg tg--off">官方</span></div>
  </div>
  <div class="blk">
    <div class="kv"><span>庫存</span><span>${nt(totQ(it))} 件</span></div>
    <div class="kv"><span>出貨</span><span>48 小時內</span></div>
    <div class="kv"><span>付款</span><span>信用卡 / 分期</span></div>
    <div class="kv"><span>退換</span><span>7 天鑑賞期，原路退刷</span></div>
  </div>
  <div class="abar"><button class="aicon" data-chat="吉吉比官方客服"><span class="ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M20 12a7.5 7.5 0 01-11 6.6L4 20l1.4-4.2A7.5 7.5 0 1120 12z"/></svg></span><span>私聊</span></button><button class="aicon" data-cartb="${it.id}"><span class="ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 4h2.2l2.3 11h10l2.2-8H6"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg></span><span>購物車</span></button><button class="buy dark" data-cbuy="${it.id}">直接購買 · NT$${nt(it.p+it.ship)}</button></div>`;
}
function goBack(){if(opts.onBack)opts.onBack();else history.back()}
async function shareItem(){
  const id=+opts.item,it=C2C.find(x=>x.id===id)||B2C.find(x=>x.id===id);
  const url=location.origin+BASE,title=it?`【吉吉比商城】${it.t}`:"吉吉比商城";
  const mobile=/Mobile|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent)&&matchMedia("(pointer: coarse)").matches;
  try{
    if(mobile&&navigator.share){await navigator.share({title,url});return}   // 手機：系統分享面板（同抽獎商品）
    try{await navigator.clipboard.writeText(url)}
    catch(e){const el=document.createElement("textarea");el.value=url;document.body.appendChild(el);el.select();document.execCommand("copy");el.remove()}
    toast("連結已複製");
  }catch(e){/* 使用者取消分享，不處理 */}
}
function cardPay(id,spec,qty,tot){
  const it=B2C.find(x=>x.id===id);spec=spec||"";qty=qty||1;tot=tot||(it.p+it.ship);
  sheet("收銀台",`
  <div class="blk first" style="text-align:center;padding:22px 16px">
    <div style="font-size:12px;color:var(--sub)">應付金額</div>
    <div class="pprice" style="justify-content:center;margin-top:4px"><i>NT$</i><b style="font-size:34px">${nt(tot)}</b></div>
    <div style="font-size:11.5px;color:var(--sub);margin-top:5px">${esc(it.t)}${spec?" · "+esc(spec):""} × ${qty}</div>
    <div style="font-size:11.5px;color:var(--sub);margin-top:2px">收款方 吉吉比國際有限公司</div></div>
  <div class="blk"><div class="secttl">付款方式</div>
    <div class="two"><button class="pick" aria-pressed="true"><span class="ck"></span>一次付清<small>VISA / Master / JCB</small></button>
    <button class="pick"><span class="ck"></span>分期 3 / 6 / 12 期<small>滿 3,000 可用</small></button></div>
    </div>
  <div class="blk"><button class="btn" data-ecpay="${it.id}" data-tot="${tot}" data-spec="${esc(spec)}" data-qty="${qty}">確認付款</button>
  <button class="btn2" data-x="1">取消</button></div>`);
}

let buyCtx=null;
const curSku=()=>{
  const it=(buyCtx.kind==="c2c"?C2C:B2C).find(x=>x.id===buyCtx.id);
  if(!it.specs)return{n:"",p:it.p,q:it.q,k:it.k};
  return it.specs.o[buyCtx.oi].items[buyCtx.ii];
};
function specSheet(kind,id,mode){
  const it=(kind==="c2c"?C2C:B2C).find(x=>x.id===id);
  buyCtx={kind,id,oi:0,ii:0,qty:1};
  mode=mode||"buy";
  sheet("選擇規格",`
  <div class="blk first"><div class="orow">
    <div class="th" id="spArt" style="width:76px;height:76px"></div>
    <div style="flex:1;min-width:0">
      <div class="pprice"><i>NT$</i><b id="spPrice">0</b></div>
      <div class="spmeta" id="spPick">—</div>
      <div class="spmeta" id="spStock">—</div>
    </div></div></div>
  ${it.specs?`<div class="blk">
    ${it.specs.o.length>1||it.specs.o[0].v?`<div class="secttl">${esc(it.specs.n)}</div>
      <div class="opts" id="spOpts">${it.specs.o.map((o,i)=>`<button class="opt" data-opt="${i}" aria-pressed="${i===0}">${esc(o.v)}</button>`).join("")}</div>
      <div class="secttl" style="margin:16px 0 8px">品項</div>`:`<div class="secttl">選擇品項</div>`}
    <div id="spItems"></div></div>`:""}
  <div class="blk"><div class="secttl">數量</div>
    <div class="qty"><button data-q="-1">－</button><span id="spQty">1</span><button data-q="1">＋</button>
      <span class="qmax" id="spMax"></span></div></div>
  ${kind==="c2c"?`<div class="blk"><div class="kv"><span>賣家保證金</span><span id="spDep">—</span></div></div>`:""}
  <div class="abar">${mode==="cart"?`<button class="buy${kind==="b2c"?" dark":""}" data-addcart="1">加入購物車</button>`:`<button class="buy${kind==="b2c"?" dark":""}" data-confirm="1">前往結帳</button>`}</div>`);
  spUpd();
}
function spUpd(){
  if(!buyCtx)return;
  const it=(buyCtx.kind==="c2c"?C2C:B2C).find(x=>x.id===buyCtx.id);
  const sk=curSku(), a=art(sk.k||it.k,it.id+(buyCtx.oi*3)+buyCtx.ii);
  const sub=sk.p*buyCtx.qty, tot=sub+it.ship;
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
  const art_=$("spArt");if(art_){art_.style.background=a.bg;art_.innerHTML=a.s}
  set("spPrice",nt(sk.p));
  const gvv=it.specs?it.specs.o[buyCtx.oi].v:"";
  set("spPick",it.specs?(gvv?`${it.specs.n}：${gvv}　${sk.n}`:sk.n):esc(it.t));
  set("spStock","庫存 "+sk.q);set("spQty",buyCtx.qty);set("spMax","最多 "+sk.q);
  set("spSub","NT$"+nt(sub));set("spTotal","NT$"+nt(tot));
  if(buyCtx.kind==="c2c")set("spDep",nt(Math.ceil(sub*tierOf(it).ratio))+"G");
  root.querySelectorAll("#spOpts .opt").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.opt===buyCtx.oi));
  const box=$("spItems");
  if(box&&it.specs){
    box.innerHTML=it.specs.o[buyCtx.oi].items.map((m,i)=>{const ma=art(m.k||it.k,it.id+(buyCtx.oi*3)+i);
      return `<button class="skurow" data-sku="${i}" ${m.q<=0?"disabled":""} aria-pressed="${i===buyCtx.ii}">
        <span class="sth" style="background:${ma.bg}">${ma.s}</span>
        <span class="stx"><b>${esc(m.n)}</b><span>庫存 ${m.q}${m.q<=0?" · 售完":""}</span></span>
        <span class="spr">NT$${nt(m.p)}</span></button>`}).join("");
  }
}
function confirmBuy(){
  const c=buyCtx;if(!c)return;
  const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);
  const sk=curSku(), sub=sk.p*c.qty, tot=sub+it.ship;
  if(c.kind==="c2c"){
    const need=Math.ceil(sub*tierOf(it).ratio);
    if(it.gfree!==undefined&&need>it.gfree){toast("賣家目前無法接單（保證金不足）");return}
  }
  const gv=it.specs?it.specs.o[c.oi].v:"";
  const spec=it.specs?(gv?`${it.specs.n}：${gv} · ${sk.n}`:sk.n):"";
  checkoutSheet([{kind:c.kind,id:c.id,oi:c.oi,ii:c.ii,qty:c.qty}]);
}
let coItems=[],coPay={},coCoupon={n:"",amt:0};
const SHIP_OPTS=[
 {n:"7-11 交貨便",brand:"7-ELEVEN",fee:60,kind:"store",d:"取貨門市"},
 {n:"全家店到店",brand:"FamilyMart",fee:60,kind:"store",d:"取貨門市"},
 {n:"黑貓宅配",brand:"黑貓宅急便",fee:80,kind:"home",d:"收件地址"},
 {n:"面交自取",brand:"面交自取",fee:0,kind:"meet",d:"面交地點"}
];
const ADDR={home:"台北市大安區忠孝東路四段 100 號 5 樓",store:"7-11 敦南門市－台北市大安區敦化南路一段 233 號",meet:"地點與時間與賣家私訊約定"};
let coShip={},coShopCpn={},coNote={};
const SHOP_COUPONS={_default:[{n:"賣場滿千折 80",amt:80,min:1000,exp:"8/31 到期"},{n:"回購券 30",amt:30,min:300,exp:"9/10 到期"}],"吉吉比官方旗艦店":[{n:"官方限定 100",amt:100,min:1500,exp:"8/25 到期"}]};
const COUPONS=[{n:"新客折抵",amt:50,min:500,exp:"8/31 到期"},{n:"一番賞專場",amt:100,min:2000,exp:"8/20 到期"},{n:"免運金",amt:60,min:0,exp:"9/15 到期"}];
function checkoutSheet(items){
  coItems=items;
  const groups={};
  coItems.forEach((c,idx)=>{const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);if(!it)return;
    const key=c.kind==="b2c"?"吉吉比官方旗艦店":it.s;(groups[key]=groups[key]||[]).push({c,idx,it})});
  let goods=0,ship=0,shopOff=0;
  const gsum={},gcnt={};
  Object.keys(groups).forEach(g=>{
    const it0=groups[g][0].it;
    if(!coShip[g]){const base=SHIP_OPTS[0];coShip[g]={n:base.n,fee:it0.ship?base.fee:0}}
    ship+=coShip[g].fee;
    let sub=0,cnt=0;
    groups[g].forEach(({c,it})=>{const sk=it.specs?it.specs.o[c.oi].items[c.ii]:{p:it.p};sub+=sk.p*c.qty;cnt+=c.qty});
    goods+=sub;gsum[g]=sub+coShip[g].fee-((coShopCpn[g]&&coShopCpn[g].amt)||0);gcnt[g]=cnt;
    shopOff+=(coShopCpn[g]&&coShopCpn[g].amt)||0;
    if(it0.pays&&!coPay[g])coPay[g]=it0.pays[0];
  });
  const total=Math.max(0,goods+ship-shopOff-coCoupon.amt);
  const payNames=Object.keys(groups).map(g=>{const it0=groups[g][0].it;return it0.pays?coPay[g]:"信用卡"});
  const payLabel=[...new Set(payNames)].join(" / ");
  sheet("結帳",`
  ${Object.keys(groups).map((g,gi)=>{const it0=groups[g][0].it,so=SHIP_OPTS.find(x=>x.n===coShip[g].n);
    return `<div class="blk${gi===0?" first":""}">
      <div class="cogrp"><span class="uav sm">${avatar(g)}</span><b>${esc(g)}</b>
        <button class="ghostbtn" style="margin-left:auto;padding:5px 12px;font-size:12px" data-chat="${esc(g==="吉吉比官方旗艦店"?"吉吉比官方客服":g)}">聊聊</button></div>
      ${groups[g].map(({c,it})=>{const sk=it.specs?it.specs.o[c.oi].items[c.ii]:{n:"",p:it.p,k:it.k};
        const a=art(sk.k||it.k,it.id+c.oi+c.ii,sk.img||it.img);
        return `<div class="coitem">
          <div class="th" style="background:${a.bg}">${a.s}</div>
          <div style="flex:1;min-width:0"><div class="ptitle" style="height:auto">${esc(it.t)}</div>
            ${sk.n?`<div class="cspec" style="pointer-events:none">${esc(it.specs.o[c.oi].v?it.specs.o[c.oi].v+" · ":"")}${esc(sk.n)}</div>`:""}
            <div class="cbot"><div class="pprice"><i>NT$</i><b style="font-size:16px">${nt(sk.p)}</b></div>
              <span style="margin-left:auto;font-size:12px;color:var(--sub)">×${c.qty}</span></div></div></div>`}).join("")}
      <button class="corow gline" data-shopcpn="${esc(g)}"><span class="gl">賣場優惠券</span>
        <span class="coar" style="color:${coShopCpn[g]?"var(--red)":"var(--mute)"}">${coShopCpn[g]?esc(coShopCpn[g].n)+" −NT$"+nt(coShopCpn[g].amt):"選擇"} ›</span></button>
      <button class="corow gline" data-note="${esc(g)}"><span class="gl">備註</span>
        <span class="coar" style="color:${coNote[g]?"var(--txt)":"var(--mute)"};max-width:64%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${coNote[g]?esc(coNote[g]):"留言給賣家"} ›</span></button>
      <button class="corow gline" data-shipsel="${esc(g)}"><span class="gl">配送方式</span>
        <span class="coar" style="color:var(--txt);font-weight:500">${esc(coShip[g].n)} ›</span></button>
      <button class="shipbox" data-addr="1">
        <div class="shiptop"><b>${esc(so.brand)}</b><span>${coShip[g].fee?"NT$"+nt(coShip[g].fee):"免運費"}</span></div>
        <div class="shipaddr">${esc(ADDR[so.kind])}</div>
        <div class="shipwho">王小明　+886 910 223 431</div>
      </button>
      <div class="gtotal"><span>${gcnt[g]} 個商品</span><span>NT$${nt(gsum[g])}</span></div>
    </div>`}).join("")}
  <div class="blk"><button class="corow" data-coupon="1"><span style="flex:1;font-weight:700;font-size:14px">吉吉比優惠券</span>
    <span class="coar" style="color:${coCoupon.amt?"var(--red)":"var(--mute)"}">${coCoupon.amt?esc(coCoupon.n)+" −NT$"+nt(coCoupon.amt):"選擇優惠券"} ›</span></button></div>
  <div class="blk"><button class="corow" data-paysel="1"><span style="flex:1;font-weight:700;font-size:14px">付款方式</span>
    <span class="coar">${esc(payLabel)} ›</span></button></div>
  <div class="blk"><div class="secttl">付款詳情</div>
    <div class="kv"><span>商品總金額</span><span>NT$${nt(goods)}</span></div>
    <div class="kv"><span>運費總金額</span><span>NT$${nt(ship)}</span></div>
    <div class="kv"><span>賣場優惠券</span><span style="color:${shopOff?"var(--red)":"var(--sub)"}">${shopOff?"−NT$"+nt(shopOff):"—"}</span></div>
    <div class="kv noline"><span>吉吉比優惠券</span><span style="color:${coCoupon.amt?"var(--red)":"var(--sub)"}">${coCoupon.amt?"−NT$"+nt(coCoupon.amt):"—"}</span></div>
    <div class="kv cototal"><span>總付款金額</span><span>NT$${nt(total)}</span></div></div>
  <div style="height:72px"></div>
  <div class="cartbar"><button class="buy hold" id="holdOrder"><span class="fill"></span>
    <span class="hlab">按住送出訂單・NT$${nt(total)}</span></button></div>`,{tall:true});
  bindHold($$("#holdOrder"),placeOrder);
}
function shopCpnSheet(g){
  const list=SHOP_COUPONS[g]||SHOP_COUPONS._default;
  sheet("賣場優惠券",`<div class="blk first"><div class="secttl">${esc(g)}</div>
    ${list.map((c,i)=>`<button class="cpn${coShopCpn[g]&&coShopCpn[g].n===c.n?" on":""}" data-shopcpnpick="${esc(g)}|${i}">
      <span class="cpnl"><b>NT$${nt(c.amt)}</b><span>滿 ${nt(c.min)} 可用</span></span>
      <span class="cpnr"><b>${esc(c.n)}</b><span>${esc(c.exp)}</span></span></button>`).join("")}
    <button class="btn2" data-shopcpnpick="${esc(g)}|-1">不使用</button></div>`);
}
function noteSheet(g){
  sheet("備註",`<div class="blk first"><div class="secttl">${esc(g)}</div>
    <input class="fin" id="noteIn" placeholder="想跟賣家說的話（選填）" value="${esc(coNote[g]||"")}">
    <button class="btn" data-notesave="${esc(g)}">儲存</button></div>`);
}
function shipSelSheet(g){
  const it0=(()=>{for(const c of coItems){const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);
    if(it&&(c.kind==="b2c"?"吉吉比官方旗艦店":it.s)===g)return it}})();
  const free=!it0.ship;
  const opts=it0&&it0.pays?SHIP_OPTS:SHIP_OPTS.filter(x=>x.kind!=="meet");
  sheet("配送方式",`<div class="blk first"><div class="secttl">${esc(g)}</div>
    ${opts.map(o=>`<button class="skurow" data-coship="${esc(g)}|${esc(o.n)}" aria-pressed="${coShip[g]&&coShip[g].n===o.n}">
      <span class="stx"><b>${esc(o.n)}</b><span>${esc(o.d)}${o.kind==="meet"?" · 與賣家約定":""}</span></span>
      <span class="spr">${free||!o.fee?"免運費":"NT$"+nt(o.fee)}</span></button>`).join("")}
    ${free?`<p class="hint">此賣家已設定免運費，運費由賣家吸收。</p>`:""}
    </div>`);
}
function couponSheet(){
  sheet("選擇優惠券",`<div class="blk first">
    ${COUPONS.map((c,i)=>`<button class="cpn${coCoupon.n===c.n?" on":""}" data-cpn="${i}" ${c.min>0?"":""}>
      <span class="cpnl"><b>NT$${nt(c.amt)}</b><span>滿 ${nt(c.min)} 可用</span></span>
      <span class="cpnr"><b>${esc(c.n)}</b><span>${esc(c.exp)}</span></span></button>`).join("")}
    <button class="btn2" data-cpn="-1">不使用優惠券</button></div>`);
}
function paySelSheet(){
  const groups={};
  coItems.forEach(c=>{const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);if(!it)return;
    const key=c.kind==="b2c"?"吉吉比官方旗艦店":it.s;(groups[key]=groups[key]||[]).push(it)});
  sheet("付款方式",`${Object.keys(groups).map(g=>{const it0=groups[g][0];
    return `<div class="blk first"><div class="secttl">${esc(g)}</div>
      ${it0.pays?it0.pays.map(p=>`<button class="skurow" data-copay="${esc(g)}|${esc(p)}" aria-pressed="${coPay[g]===p}">
        <span class="stx"><b>${esc(p)}</b><span>${p==="LINE Pay"?"轉帳給賣家 LINE Pay":"轉帳到賣家銀行帳戶"}</span></span></button>`).join("")
        :`<button class="skurow" aria-pressed="true"><span class="stx"><b>信用卡 / 分期</b><span>綠界代收，平台出貨</span></span></button>`}
    </div>`}).join("")}
  <div class="blk"><button class="btn" data-x="1">確定</button></div>`);
}
function checkout(){
  const sel=cart.filter(c=>c.sel);
  if(!sel.length){toast("請先選擇商品");return}
  const shops=[...new Set(sel.map(shopOf))];
  if(shops.length>1){toast("一次只能結帳一個賣場");return}
  checkoutSheet(sel.map(c=>({kind:c.kind,id:c.id,oi:c.oi,ii:c.ii,qty:c.qty,fromCart:true})));
}
function placeOrder(){
  const sel=coItems;if(!sel.length)return;
  const first=sel[0], it0=(first.kind==="c2c"?C2C:B2C).find(x=>x.id===first.id);
  const gkey=first.kind==="b2c"?"吉吉比官方旗艦店":it0.s;
  const fee=coShip[gkey]?coShip[gkey].fee:it0.ship;
  const items=[];let sub=0,dep=0;
  sel.forEach(c=>{
    const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);if(!it)return;
    const sk=it.specs?it.specs.o[c.oi].items[c.ii]:{n:"",p:it.p,k:it.k};
    const spec=it.specs?(it.specs.o[c.oi].v?`${it.specs.o[c.oi].v} / ${sk.n}`:sk.n):"";
    items.push({t:it.t,spec,qty:c.qty,p:sk.p,k:sk.k||it.k,cid:it.id});
    sub+=sk.p*c.qty;
    if(c.kind==="c2c")dep+=Math.ceil(sk.p*c.qty*tierOf(it).ratio);
  });
  // 真資料模式：金額、保證金、庫存全部由 sell_create_order 決定，
  // 本機只負責把「買哪幾個規格」送過去。官方 B2C 還沒接綠界，維持原型行為。
  if(DB&&first.kind==="c2c"){
    const payload=sel.map(c=>({listing_id:c.id,g:c.oi,i:c.ii,qty:c.qty}));
    const pay=payCode(coPay[gkey]||it0.pays[0]);
    const note=coNote[gkey]||"";
    closeAll();
    push(async()=>{
      const r=await DB.createOrder(payload,pay,note);
      // 建單成功才清購物車：失敗時東西要留著，不然買家得重挑一次
      if(r&&r.success)for(const c of sel){if(c.fromCart)await DB.cartSetQty(c.id,c.oi,c.ii,0)}
      return r;
    },"訂單已成立，請於 15 分鐘內付款",()=>{
      coItems=[];coCoupon={n:"",amt:0};coShip={};coShopCpn={};coNote={};
      ordTab=0;render();
      if(orders[0])setTimeout(()=>openOrder(orders[0].no),200);
    });
    return;
  }
  const off=((coShopCpn[gkey]&&coShopCpn[gkey].amt)||0)+coCoupon.amt;
  const tot=Math.max(0,sub+fee-off);
  if(first.kind==="c2c"&&it0.gfree!==undefined&&dep>it0.gfree){toast(`${it0.s} 目前無法接單`);return}
  const no=(first.kind==="c2c"?"P":"O")+String(Date.now()).slice(-8);
  mkOrder(first.kind==="c2c"
    ?{no,type:"c2c",dep,items,sub,fee,off,p:tot,k:items[0].k,cid:items[0].cid,s:it0.s,note:coNote[gkey]||"",
      pays:it0.pays.slice(),pay:coPay[gkey]||it0.pays[0],ship:SHIP_OPTS.find(x=>x.n===(coShip[gkey]||{}).n)||SHIP_OPTS[0],
      st:0,due:Date.now()+15*60000,late:false,track:null}
    :{no,type:"b2c",items,sub,fee,off,p:tot,k:items[0].k,cid:items[0].cid,pay:"信用卡",
      ship:SHIP_OPTS.find(x=>x.n===(coShip[gkey]||{}).n)||SHIP_OPTS[0],st:0,track:null});
  cart=cart.filter(c=>!c.sel);
  coItems=[];coCoupon={n:"",amt:0};coShip={};coShopCpn={};coNote={};
  toast("訂單已成立，請於 15 分鐘內付款");
  ordTab=0;closeAll();render();
  setTimeout(()=>openOrder(no),200);
}
const oItems=o=>o.items||[{t:o.t,spec:o.spec||"",qty:o.qty||1,p:o.p,k:o.k,cid:o.cid}];
function mkOrder(o){orders.unshift(o)}
function buyC2C(id){
  const it=C2C.find(x=>x.id===id),g=guard(it);
  mkOrder({no:"P"+String(Date.now()).slice(-8),type:"c2c",dep:g.need,t:it.t,p:g.total,k:it.k,cid:it.id,s:it.s,pays:it.pays.slice(),pay:it.pays[0],st:0,due:Date.now()+15*60000,late:false,track:null});
  toast("下單成功");openOrder(orders[0].no);
}
function buyB2C(id,spec,qty,tot){
  const it=B2C.find(x=>x.id===id);
  mkOrder({no:"O"+String(Date.now()).slice(-8),type:"b2c",t:it.t,spec:spec||"",qty:qty||1,p:tot||(it.p+it.ship),k:it.k,cid:it.id,st:0,track:null});
  toast("付款成功");openOrder(orders[0].no);
}
function payBox(o){
  const sw=`<div class="kv"><span>付款方式</span><span>${esc(o.pay)}</span></div>`;
  const rows=o.pay==="LINE Pay"
    ?`<div class="kv"><span>收款帳號</span><span>@ggb_${o.cid}s</span></div><div class="kv"><span>備註</span><span>${o.no}</span></div>`
    :`<div class="kv"><span>銀行</span><span>國泰世華 (013)</span></div><div class="kv"><span>帳號</span><span>8123-4567-${String(o.cid).padStart(4,"0")}</span></div><div class="kv"><span>戶名</span><span>${esc(maskName(sellerInfo(o.s).n))}</span></div>`;
  return `<div class="blk"><div class="secttl">匯款資訊</div>
   <div class="cdblk"><div class="cdt" id="cdBig">15:00</div>
     <div class="cdnote">請於時間內完成匯款，並點擊「我已完成匯款」</div>
     <div id="cdWarn" class="cdwarn" style="display:none">剩不到 3 分鐘，若已轉帳請立即按下回報</div></div>
   ${sw}${rows}
   <button class="kv payex noline" data-payex="1"><span class="exlabel">應付金額<svg class="cspec-ar exar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span><span style="color:var(--red);font-weight:700">NT$${nt(o.p)}</span></button>
   <div class="payexbox" id="payExBox" style="display:none">
     <div class="kv"><span>商品總金額</span><span>NT$${nt(o.sub!==undefined?o.sub:o.p)}</span></div>
     <div class="kv"><span>運費總金額</span><span>${o.fee?"NT$"+nt(o.fee):"免運費"}</span></div>
     <div class="kv noline"><span>優惠折抵</span><span style="color:${o.off?"var(--red)":"var(--sub)"}">${o.off?"−NT$"+nt(o.off):"—"}</span></div>
     <div class="kv cototal"><span>總付款金額</span><span>NT$${nt(o.p)}</span></div>
   </div></div>`;
}
function openOrder(no){
  const o=orders.find(x=>x.no===no),S=stepsOf(o);
  const who=o.type==="b2c"?"吉吉比官方旗艦店":o.s;
  const its=oItems(o);
  const steps=o.st===9?"":`<div class="blk first"><div class="steps">${S.map((s,i)=>`<div class="stp ${i<o.st?"dn":i===o.st?"nw":""}">${s}</div>`).join("")}</div></div>`;
  const okban=(o.type==="c2c"&&o.st>=2&&o.st<=3)?(o.st===2
    ?`<div class="blk okban">
      <span class="okic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5.2 5.2L19.5 7.5"/></svg></span>
      <div><b>付款已完成</b><span>賣家確認收款，正在準備出貨</span></div></div>`
    :`<div class="blk okban ship">
      <span class="okic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg></span>
      <div><b>商品配送中</b><span>賣家已出貨，預計 1~2 個工作天</span></div></div>`):"";
  const conf=(o.type==="c2c"&&o.st===1)?`<div class="blk"><div class="secttl">付款狀態</div>
    <div class="cdblk"><div class="cdt" id="cdBig">15:00</div>
      <div class="cdnote">賣家對帳中，請稍候</div></div>
    <div class="kv"><span>買家付款方式</span><span>${esc(o.pay)}</span></div>
    <div class="kv"><span>已付金額</span><span style="font-weight:700">NT$${nt(o.p)}</span></div>
    <div class="kv noline"><span>狀態</span><span style="color:var(--red)">等待賣家對帳確認</span></div>
    <p class="autonote">逾 15 分鐘未處理，系統視同已收款，自動進待出貨</p></div>`:"";
  const pay=(o.type==="c2c"&&o.st===0)?payBox(o)+`
    <div class="blk"><div class="secttl">賣家聯絡資訊</div>
      <div class="corow"><span style="font-weight:700;font-size:14px">${esc(maskName(sellerInfo(o.s).n))}</span>
        <span class="coar" style="color:var(--txt);font-weight:500">${esc(sellerInfo(o.s).p)}</span></div>
      <p class="hint" style="margin-top:8px">聯絡資訊僅於交易期間提供，請勿用於交易以外用途。</p></div>`:"";
  const goods=`<div class="blk${o.st===9&&!pay?" first":""}">
    <div class="cogrp"><span class="uav sm">${avatar(who)}</span><b>${esc(who)}</b>
      <button class="ghostbtn" style="margin-left:auto;padding:5px 12px;font-size:12px" data-chat="${esc(o.type==="b2c"?"吉吉比官方客服":o.s)}" data-ord2="${o.no}">聊聊</button></div>
    ${its.map(m=>{const a=art(m.k,m.cid,m.img);
      return `<div class="coitem">
        <div class="th" style="background:${a.bg}">${a.s}</div>
        <div style="flex:1;min-width:0"><div class="ptitle" style="height:auto">${esc(m.t)}</div>
          ${m.spec?`<div class="cspec" style="pointer-events:none">${esc(m.spec)}</div>`:""}
          <div class="cbot"><span style="font-size:12px;color:var(--sub)">×${m.qty}</span>
            ${o.st>=2&&o.st<=4?"":`<div class="pprice" style="margin-left:auto"><i>NT$</i><b style="font-size:16px">${nt(m.p*m.qty)}</b></div>`}</div></div></div>`}).join("")}
    ${o.st>=2&&o.st<=4?`<button class="kv payex" data-amtex="1"><span class="exlabel">金額明細<svg class="cspec-ar amtar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span><span style="color:var(--sub)">已付款</span></button>
      <div class="payexbox" id="amtBox" style="display:none">
        <div class="kv"><span>商品總金額</span><span>NT$${nt(o.sub!==undefined?o.sub:o.p)}</span></div>
        <div class="kv"><span>運費</span><span>${o.fee?"NT$"+nt(o.fee):"免運費"}</span></div>
        <div class="kv"><span>實付金額</span><span style="font-weight:700">NT$${nt(o.p)}</span></div>
        <div class="kv noline"><span>賣家保證金</span><span style="color:${o.st===4?"var(--sub)":"var(--red)"}">${o.st===4?"已退還":"鎖定中 "+nt(o.dep)+"G"}</span></div></div>`:""}
    ${o.ship?`<button class="kv payex" data-shipex="1"><span class="exlabel">配送方式<svg class="cspec-ar shipar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span><span>${esc(o.ship.n)}</span></button>
    <div class="payexbox" id="shipExBox" style="display:none">
      <div class="kv"><span>${esc(o.ship.brand||o.ship.n)}</span><span>${o.fee?"NT$"+nt(o.fee):"免運費"}</span></div>
      <div class="kv"><span>${esc(o.ship.d)}</span><span style="max-width:66%;text-align:right">${esc(ADDR[o.ship.kind])}</span></div>
      <div class="kv noline"><span>收件人</span><span>王小明　+886 910 223 431</span></div>
    </div>`:""}
    ${(o.st<2||o.st===9)?`<div class="kv"><span>商品總金額</span><span style="font-weight:700">NT$${nt(o.sub!==undefined?o.sub:o.p)}</span></div>`:""}
    ${o.type==="c2c"&&(o.st<2||o.st===9)?`<div class="kv"><span>賣家保證金</span><span style="color:${o.st===4?"var(--sub)":"var(--red)"}">${o.st===4?"已退還 "+nt(o.dep)+"G":(o.st===9?"保留中 ":"鎖定中 ")+nt(o.dep)+"G"}</span></div>`:""}
    ${o.note?`<div class="kv"><span>備註</span><span>${esc(o.note)}</span></div>`:""}
  </div>`;
  let b="";
  if(o.type==="b2c"){
    if(o.st===0)b=`<div class="blk"><div class="kv"><span>付款</span><span style="color:var(--green)">已完成</span></div>
      <div class="kv"><span>發票</span><span>電子發票已開立</span></div></div>
      <div class="blk"><button class="btn" data-pack="${o.no}">［模擬］官方備貨完成</button><button class="btn2" data-refund="${o.no}">申請退款</button></div>`;
    else if(o.st===1)b=`<div class="blk"><div class="kv"><span>狀態</span><span>倉庫備貨中</span></div></div>
      <div class="blk"><button class="btn" data-oship="${o.no}">［模擬］官方已出貨</button><button class="btn2" data-refund="${o.no}">申請退款</button></div>`;
    else if(o.st===2)b=`<div class="blk"><div class="kv"><span>物流單號</span><span>${esc(o.track)}</span></div></div>
      <div class="blk"><button class="btn" data-recv="${o.no}">確認收貨</button><button class="btn2" data-refund="${o.no}">鑑賞期退貨</button></div>`;
    else b=`<div class="blk"><div class="kv"><span>狀態</span><span style="color:var(--green)">交易完成</span></div></div>`+recoStrip();
  }else{
    if(o.st===0)b=`<div class="abar"><button class="buy hold" id="holdPaid"><span class="fill"></span>
          <span class="hlab">按住確認已匯款</span></button></div>`;
    else if(o.st===1)b=`<div class="blk"><button class="btn2" data-chat="${esc(o.s)}" data-ord2="${o.no}">聊聊催一下</button>
        <button class="btn2" data-sconfirm="${o.no}">［模擬］賣家已確認收款</button></div>`;
    else if(o.st===2)b=o.late
      ?`<div class="blk"><div class="kv"><span>狀態</span><span style="color:var(--red)">賣家逾時未出貨</span></div>
        <div class="kv"><span>可獲補償</span><span>${nt(o.dep)}G（賣家保證金）</span></div></div>
        <div class="blk"><button class="btn" data-claim="${o.no}">申訴並請求補償</button>
        <button class="btn2" data-ship="${o.no}">［模擬］賣家終於出貨</button></div>`
      :`<div class="blk"><div class="kv"><span>賣家出貨期限</span><span>72 小時內</span></div>
        <div class="kv noline"><span>預計到貨</span><span>出貨後 1-2 個工作天</span></div></div>
        <div class="blk"><button class="btn2" data-ship="${o.no}">［模擬］賣家已出貨</button>
        <button class="btn2" data-late="${o.no}">［模擬］逾時 72 小時</button></div>`;
    else if(o.st===3)b=`<div class="blk"><div class="kv"><span>物流單號</span>
        <a class="tracklink" href="https://eservice.7-11.com.tw/E-Tracking/search.aspx" target="_blank" rel="noopener">${esc(o.track)}</a></div>
      <div class="kv"><span>物流狀態</span><span>已由 ${esc((o.ship&&o.ship.brand)||"物流")} 收件，配送中</span></div>
      <div class="kv noline"><span>自動完成</span><span>簽收後 7 天</span></div></div>
      <div class="abar"><button class="buy hold" id="holdRecv"><span class="fill"></span><span class="hlab">按住確認收貨</span></button></div>`;
    else if(o.st===9)b=`<div class="blk" style="background:#FFF4F5">
        <div class="secttl">訂單已取消</div>
        <div class="kv" style="border:0;padding:2px 0"><span>原因</span><span>賣家表示未收到款項</span></div>
        <p class="hint" style="color:#C4342F">若你已完成轉帳，請於 ${o.holdLeft||72} 小時內附憑證申訴，賣家保證金 ${nt(o.dep)}G 仍在保留中。</p>
        <button class="btn" data-appeal="${o.no}">我已匯款，提出申訴</button>
        <button class="btn2" data-chat="${esc(o.s)}" data-ord2="${o.no}">先跟賣家聊聊</button></div>`;
    else b=(o.rated
      ?`<div class="blk donebox">
          <span class="doneic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5.2 5.2L19.5 7.5"/></svg></span>
          <div class="donet">訂單已完成</div>
          <div class="stars ro">${[1,2,3,4,5].map(i=>`<span class="star${i<=o.stars?" on":""}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21.1l1.3-6.8-5-4.7 6.8-.8z"/></svg></span>`).join("")}</div>
          ${o.review?`<p class="revtx">${esc(o.review)}</p>`:""}
          <p class="autonote">已送出評價，感謝你的回饋</p></div>`
      :`<div class="blk donebox">
          <span class="doneic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5.2 5.2L19.5 7.5"/></svg></span>
          <div class="donet">訂單已完成</div>
          <div class="stars">${[1,2,3,4,5].map(i=>`<button class="star${i<=(o.stars||4)?" on":""}" data-star="${o.no}|${i}"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21.1l1.3-6.8-5-4.7 6.8-.8z"/></svg></button>`).join("")}</div>
          <input class="fin revin" id="revIn" value="優質賣家！商品優！寄貨快！" placeholder="這次交易還順利嗎？">
          <p class="autonote">請給賣家一點鼓勵唷！</p></div>
        <div class="abar"><button class="buy" data-rate="${o.no}">送出評價</button></div>`);
  }
  const doneCard=(o.type==="c2c"&&o.st===4)?b:"";
  sheet("訂單 "+o.no,steps+(doneCard?doneCard+goods:okban+pay+conf+goods+b),{tall:true,back:layers.length&&layers[layers.length-1].key==="購買清單"?"orders":"close",route:{v:"order",no:o.no}});
  if(o.type==="c2c"&&o.st===0){startCD(o);bindHold($$("#holdPaid"),()=>{
    o.st=1;o.cdue=Date.now()+15*60000;toast("已回報匯款，等待賣家確認");openOrder(o.no);render();
  });}
  if(o.type==="c2c"&&o.st===3)bindHold($$("#holdRecv"),()=>{
    o.st=4;toast("已確認收貨，保證金退還賣家");openOrder(o.no);render();
  });
  if(o.type==="c2c"&&o.st===1){
    if(!o.cdue)o.cdue=Date.now()+15*60000;
    startCD({due:o.cdue},()=>{o.st=2;toast("賣家未處理，系統視同已收款");openOrder(o.no);render()});
  }
}
function bindHold(b,fn){
  if(!b)return;
  const f=b.querySelector(".fill");let t0,tm;
  const start=()=>{t0=Date.now();f.style.transition="width .8s linear";f.style.width="100%";
    if(navigator.vibrate)navigator.vibrate(8);
    holdSound(true);
    tm=setTimeout(()=>{f.style.transition="none";f.style.width="0";
      holdSound(false);SFX.done();
      if(navigator.vibrate)navigator.vibrate([12,40,18]);fn()},800)};
  const stop=()=>{clearTimeout(tm);f.style.transition="width .15s";f.style.width="0";
    holdSound(false);
    if(t0&&Date.now()-t0<780){SFX.cancel();toast("請按住直到光條走完");t0=0}};
  ["mousedown","touchstart"].forEach(ev=>b.addEventListener(ev,e=>{e.preventDefault();start()},{passive:false}));
  ["mouseup","mouseleave","touchend","touchcancel"].forEach(ev=>b.addEventListener(ev,stop));
}
function startCD(o,onExpire){
  if(tick)clearInterval(tick);
  tick=setInterval(()=>{
    const big=$$("#cdBig");if(!big){clearInterval(tick);tick=null;return}
    const s=Math.max(0,Math.round((o.due-Date.now())/1000));
    big.textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
    const warn=$$("#cdWarn");
    if(warn&&s<=180&&s>0){warn.style.display="block";if(!o._warned){o._warned=1;toast("剩 3 分鐘：已轉帳請立即按下回報")}}
    if(s<=0){clearInterval(tick);tick=null;
      if(onExpire)onExpire();
      else{orders=orders.filter(x=>x.no!==o.no);toast("逾時未付款，訂單已取消");close();render()}}
  },500);
}

const payChips=(sel,attr)=>`<div class="two">${["銀行轉帳","LINE Pay"].map(p=>`<button class="pick" ${attr}="${esc(p)}" aria-pressed="${sel.includes(p)}"><span class="ck"></span>${esc(p)}<small>${p==="LINE Pay"?"@ggb_user":"國泰世華 ****4821"}</small></button>`).join("")}</div>`;

function sellForm(){
  const t=tierOf(ME);
  const ed=editIdx!==null?myList[editIdx]:null;
  if(ed){
    myShip=ed.ship;
    useSpec=!!(ed.specs&&(ed.specs.o.length>1||ed.specs.o[0].v));
    specTree=ed.specs?ed.specs.o.map(o=>({v:o.v,items:o.items.map(m=>({n:m.n,p:m.p,q:m.q,k:m.k}))}))
                     :[{v:"",items:[{n:"",p:0,q:1}]}];
  }
  if(ed)sCat=ed.category||sCat;
  sheet(ed?"編輯商品":"我要上架",`
  <div class="blk first"><div class="secttl">類別（必選）</div>
    <select class="fin selcat" id="sCatSel" required><option value=""${sCat?"":" selected"} disabled>請選擇類別</option>${CATS.map(c=>`<option value="${esc(c)}"${sCat===c?" selected":""}>${esc(c)}</option>`).join("")}</select>
    <p class="hint" style="margin:9px 0 0">只能上架平台開放的類別，選好才能送審</p></div>
  <div class="blk"><label class="f">商品名稱</label><input class="fin" id="sT" placeholder="例：航海王 一番賞 B賞 魯夫 五檔" value="${ed?esc(ed.t):""}">
  <div class="two" style="margin-top:14px"><div><label class="f">售價 NT$</label><input class="fin" id="sP" type="number" inputmode="numeric" placeholder="3200" value="${ed?ed.p:""}"></div>
  <div><label class="f">數量</label><input class="fin" id="sQ" type="number" inputmode="numeric" value="${ed?ed.q:1}"></div></div></div>
  <div class="blk"><div class="secttl">運費</div>
    <div class="two" id="shPick">
      <button class="pick" data-sh="60" aria-pressed="${myShip===60}"><span class="ck"></span>交貨便 60<small>買家付</small></button>
      <button class="pick" data-sh="80" aria-pressed="${myShip===80}"><span class="ck"></span>宅配 80<small>買家付</small></button>
      <button class="pick" data-sh="0" aria-pressed="${myShip===0}"><span class="ck"></span>免運費<small>你自己吸收</small></button>
      <button class="pick" data-sh="-1" aria-pressed="${myShip!==0&&myShip!==60&&myShip!==80}"><span class="ck"></span>自訂金額<small>下方輸入</small></button>
    </div>
    <input class="fin" id="sSh" type="number" inputmode="numeric" placeholder="自訂運費金額" style="margin-top:9px;display:${(myShip!==0&&myShip!==60&&myShip!==80)?"block":"none"}" value="${(myShip!==0&&myShip!==60&&myShip!==80)?myShip:""}">
    <p class="sumline" id="shSum">買家結帳金額 = 售價 + 運費</p></div>
  <div class="blk"><div class="secttl">商品規格</div>
    <div class="two" id="spMode">
      <button class="pick" data-spm="0" aria-pressed="${!useSpec}"><span class="ck"></span>選項<small>直接列出可買的品項</small></button>
      <button class="pick" data-spm="1" aria-pressed="${useSpec}"><span class="ck"></span>分規格<small>先分規格，各自列選項</small></button>
    </div>
    <div id="spChips" style="display:${useSpec?"block":"none"};margin-top:14px"></div>
    <div id="spRows" style="margin-top:14px"></div>
    <button class="addbtn" id="spAdd"></button>
  </div>
  <div class="blk"><div class="secttl">收款方式</div>
  ${payChips(myPays,"data-p")}</div>
  <div class="blk"><div class="secttl">保證金</div>
    <div class="calcbox"><div class="l">賣出時收取</div><div class="v" id="gv">填售價後顯示</div>
    <div class="s" id="gs">你是「${t.n}」賣家，保證金為售價 ${t.ratio*100}%</div></div></div>
  <div class="blk"><div class="secttl">推廣（選填）</div>
    <button class="btn2" data-go="ads" style="margin-top:0">前往廣告中心 ›</button>
    <button class="btn" data-submit="1">${ed?"儲存變更":"送出審核"}</button></div>`);
  const upd=()=>{
    const p=+$("sP").value||0,need=Math.ceil(p*t.ratio),v=$("gv"),sh=curShip();
    $("shSum").textContent=p?`買家結帳 NT$${nt(p+sh)}（售價 ${nt(p)}${sh?" + 運費 "+nt(sh):"，免運費"}）`:"買家結帳金額 = 售價 + 運費";
    if(!p){v.textContent="填售價後顯示";v.style.color="var(--orange)";$("gs").textContent=`你是「${t.n}」賣家，保證金為售價 ${t.ratio*100}%`;return}
    if(p>t.max){v.textContent="超過可賣價格";v.style.color="var(--red)";$("gs").textContent=`「${t.n}」單件最高賣 ${nt(t.max)}，多賣幾單升級後解鎖`}
    else{v.textContent=nt(need)+" G";v.style.color="var(--orange)";$("gs").textContent="運費不計入保證金。買家確認收貨後全額退還"}
  };
  const itemRow=(m,i,j)=>{
    const key=i+"."+j;
    return `<div class="ir">
      <button class="irimg" data-img="${key}">${m.k?art(m.k,(i+1)*7+j).s:'<span>＋<br>圖</span>'}</button>
      <div class="irf">
        <input class="fin" data-in="${key}" placeholder="品項名稱，例：索隆 三刀流" value="${esc(m.n)}">
        <div class="irn">
          <label><span>價格 NT$</span><input class="fin" data-ip="${key}" type="number" inputmode="numeric" value="${m.p||""}" placeholder="0"></label>
          <label><span>庫存</span><input class="fin" data-iq="${key}" type="number" inputmode="numeric" value="${m.q}"></label>
        </div></div>
      <button class="irdel" data-idel="${key}">✕</button></div>`;
  };
  const drawRows=()=>{
    const chips=$("spChips");
    if(!useSpec){
      chips.style.display="none";
      $("spRows").innerHTML=`<div class="flatbox">${specTree[0].items.map((m,j)=>itemRow(m,0,j)).join("")}</div>`;
      $("spAdd").textContent="＋ 新增選項";
    }else{
      chips.style.display="block";
      chips.innerHTML=`<label class="f">規格</label><div class="gchips">
        ${specTree.map((o,i)=>`<span class="gchip${i===gSel?" on":""}" data-gsel="${i}">
          <b>${esc(o.v||"規格 "+(i+1))}</b>
          <button data-odel="${i}">✕</button></span>`).join("")}
        <button class="gadd" data-gadd="1">＋ 新增規格</button></div>`;
      $("spRows").innerHTML=specTree.map((o,i)=>`<div class="gsec">
        <div class="gsechd"><span class="gnum">${i+1}</span>
          <input class="gname" data-ov="${i}" placeholder="規格 ${i+1}" value="${esc(o.v)}">
          <span class="gcount">${o.items.length} 個選項</span></div>
        <div class="glist">${o.items.map((m,j)=>itemRow(m,i,j)).join("")}
          <button class="addsku" data-iadd="${i}">＋ 新增選項</button></div>
      </div>`).join("");
      $("spAdd").style.display="none";
    }
    if(!useSpec)$("spAdd").style.display="block";
  };
  drawRows();
  $("spMode").addEventListener("click",e=>{
    const b=e.target.closest("[data-spm]");if(!b)return;
    useSpec=b.dataset.spm==="1";
    root.querySelectorAll("#spMode .pick").forEach(x=>x.setAttribute("aria-pressed",(x.dataset.spm==="1")===useSpec));
    if(useSpec&&specTree.length<2&&!specTree[0].v)specTree[0].v="";
    drawRows();
  });
  $("spChips").addEventListener("click",e=>{
    const b=e.target.closest("[data-gadd],[data-odel],[data-gsel]");if(!b)return;
    const d=b.dataset;
    if(d.gadd){if(specTree.length>=8){toast("最多 8 個規格");return}specTree.push({v:"",items:[{n:"",p:0,q:1}]});gSel=specTree.length-1;}
    else if(d.odel!==undefined){
      if(specTree.length<=1){toast("至少保留一個規格");return}
      specTree.splice(+d.odel,1);gSel=0;
    }else if(d.gsel!==undefined){
      gSel=+d.gsel;drawRows();
      const sec=root.querySelectorAll(".gsec")[gSel];
      if(sec)sec.scrollIntoView({behavior:"smooth",block:"start"});
      return;
    }
    drawRows();
  });
  const KS=["fig","card","box","cap","plush"];
  $("spAdd").addEventListener("click",()=>{
    if(specTree[0].items.length>=12){toast("最多 12 個選項");return}
    specTree[0].items.push({n:"",p:0,q:1});
    drawRows();
  });
  $("spRows").addEventListener("click",e=>{
    const b=e.target.closest("[data-idel],[data-iadd],[data-img]");if(!b)return;
    const d=b.dataset;
    if(d.iadd!==undefined){
      const o=specTree[+d.iadd];if(o.items.length>=8){toast("單一規格最多 8 個選項");return}
      o.items.push({n:"",p:0,q:1});
    }else if(d.idel!==undefined){
      const [i,j]=d.idel.split(".").map(Number);
      if(specTree[i].items.length<=1){toast("至少保留一個選項");return}
      specTree[i].items.splice(j,1);
    }else if(d.img!==undefined){
      const [i,j]=d.img.split(".").map(Number),m=specTree[i].items[j];
      m.k=KS[(KS.indexOf(m.k)+1)%KS.length];
    }
    drawRows();
  });
  $("spRows").addEventListener("input",e=>{
    const d=e.target.dataset,v=e.target.value;
    if(d.ov!==undefined){
      specTree[+d.ov].v=v;
      const chip=root.querySelectorAll(".gchip b")[+d.ov];
      if(chip)chip.textContent=v||("規格 "+(+d.ov+1));
    }
    else if(d.in!==undefined){const [i,j]=d.in.split(".").map(Number);specTree[i].items[j].n=v}
    else if(d.ip!==undefined){const [i,j]=d.ip.split(".").map(Number);specTree[i].items[j].p=+v||0}
    else if(d.iq!==undefined){const [i,j]=d.iq.split(".").map(Number);specTree[i].items[j].q=+v||0}
  });

  $("sP").addEventListener("input",()=>{upd();if(useSpec)drawRows()});
  $("sSh").addEventListener("input",()=>{myShip=+$("sSh").value||0;upd()});
  $("shPick").addEventListener("click",e=>{
    const b=e.target.closest("[data-sh]");if(!b)return;
    const v=+b.dataset.sh;
    root.querySelectorAll("#shPick .pick").forEach(x=>x.setAttribute("aria-pressed",x===b));
    if(v===-1){$("sSh").style.display="block";myShip=+$("sSh").value||0;$("sSh").focus()}
    else{$("sSh").style.display="none";myShip=v}
    upd();
  });
}
const curShip=()=>myShip;
function depInfo(){
  const my=tierOf(ME);
  sheet("保證金規則",`
  <div class="blk first"><div class="secttl">怎麼運作</div>
    <div class="kv"><span>上架時</span><span style="color:#3FA34D">不扣</span></div>
    <div class="kv"><span>賣出時</span><span>依成交小計收一筆 G幣</span></div>
    <div class="kv"><span>計算基準</span><span>實際成交小計 × 等級比例</span></div>
    <div class="kv"><span>不計入</span><span>運費</span></div>
    <div class="kv"><span>G幣不足</span><span style="color:var(--red)">該筆訂單無法成立</span></div>
    <div class="kv"><span>買家確認收貨</span><span style="color:#3FA34D">全額退還</span></div>
    <div class="kv"><span>你沒出貨</span><span style="color:var(--red)">整筆保證金轉給買家</span></div>
    <div class="kv"><span>訂單取消</span><span>原額解鎖</span></div>
    </div>
  <div class="blk"><div class="secttl">等級與比例</div>
    <table class="t"><tr><th>等級</th><th>條件</th><th>保證金</th><th>單件最高賣</th></tr>
    ${TIERS.slice().reverse().map(t=>`<tr class="${t.k===my.k?"me":""}"><td>${t.n}</td><td style="color:var(--sub)">${t.cond}</td><td>售價 ${t.ratio*100}%</td><td>${nt(t.max)}</td></tr>`).join("")}</table>
    </div>`);
}
function payCfg(){
  sheet("收款設定",`<div class="blk first"><div class="secttl">可複選</div>
  ${payChips(myPays,"data-p2")}
  <button class="btn" data-x="1">儲存</button></div>`);
}

$("hdr").addEventListener("click",e=>{
  const b=e.target.closest("[data-search],[data-back],[data-go]");if(!b)return;
  const d=b.dataset;
  if(d.search!==undefined)searchSheet("");
  else if(d.back){if(tab==="official"){tab="market";syncTabs();render()}else toast("已在首頁")}
  else if(d.go==="cart")cartSheet();
  else if(d.go==="rep"){repSheet();return}
  else if(d.go==="chats")chatList();
});
$("screen").addEventListener("click",e=>{
  const b=e.target.closest("[data-seg],[data-c2c],[data-b2c],[data-ord],[data-go],[data-off],[data-relist],[data-promo],[data-menu],[data-more],[data-ordt],[data-ntt],[data-orders],[data-csel],[data-callall],[data-cq],[data-cgrp],[data-cspec],[data-cpick],[data-checkout],[data-placeorder],[data-copay],[data-coupon],[data-shopcpn],[data-shopcpnpick],[data-note],[data-notesave],[data-shipsel],[data-coship],[data-paysel],[data-cpn],[data-addr],[data-chat],[data-recv],[data-ord],[data-orders],[data-ntt],[data-noti],[data-more],[data-menu],[data-promo],[data-off],[data-relist],[data-seg]");if(!b)return;
  const d=b.dataset;
  if(d.seg){seg=d.seg;render();syncUrl()}
  else if(d.ordt!==undefined){ordTab=+d.ordt;render()}
  else if(d.orders!==undefined){ordTab=+d.orders;ordersSheet();return}
  else if(d.ntt!==undefined){ntTab=+d.ntt;render();return}
  else if(d.orders!==undefined){ordTab=+d.orders;ordersSheet();return}

  else if(d.more){moreSheet(d.more);return}
  else if(d.c2c)itemC2C(+d.c2c);
  else if(d.b2c)itemB2C(+d.b2c);
  else if(d.recv){const o=orders.find(x=>x.no===d.recv);
    if(DB&&o&&o.oid){push(()=>DB.confirmReceived(o.oid),"已確認收貨");return}
    o.st=o.type==="b2c"?3:4;toast("已確認收貨");render();return}
  else if(d.chat){let ctx=d.ord2?orders.find(x=>x.no===d.ord2):null;
    if(d.itm2){const it=C2C.find(x=>x.id===+d.itm2);if(it)ctx={kind:"item",id:it.id,t:it.t,p:minP(it),k:it.k,cid:it.id,specs:!!it.specs}}
    chatSheet(d.chat,ctx);return}
  else if(d.ord)openOrder(d.ord);
  else if(d.go==="sell"){editIdx=null;useSpec=false;sCat="";specTree=[{v:"",items:[{n:"",p:0,q:1}]}];sellForm();return}
  else if(d.go==="ads"){fromPromo=false;adCenter();return}
  else if(d.go==="rep"){repSheet();return}
  else if(d.go==="settings"){settingsSheet();return}
  else if(d.go==="cart"){cartSheet();return}
  else if(d.go==="addr"){addrSheet();return}
  else if(d.go==="snd"){SND=!SND;if(SND)SFX.tap();toast(SND?"音效已開啟":"音效已關閉");close();settingsSheet();return}
  else if(d.go==="rep"){repSheet();return}
  else if(d.go==="chats")chatList();
  else if(d.go==="notis"){notiSheet();return}
  else if(d.go==="sorders")sellOrdersSheet();
  else if(d.go==="pro")goPro();
  else if(d.go==="dep")depInfo();
  else if(d.go==="admin"){adminPanel();return}
  else if(d.go==="paycfg")payCfg();
  else if(d.menu!==undefined){listMenu(+d.menu);return}
  else if(d.off!==undefined){
    const m=myList[+d.off];
    if(m.locked){toast("交易進行中，無法下架");return}
    m.st="off";syncMine();toast("已下架");render();
  }
  else if(d.relist!==undefined){myList[+d.relist].st="active";syncMine();toast("已重新上架");render();}
  else if(d.promo!==undefined){promoFor=+d.promo;fromPromo=true;adCenter()}
});
/* 上架表單的類別下拉（老闆：膠囊改下拉選單）—— change 不走 click 委派，單獨接 */
$("sheets").addEventListener("change",e=>{
  if(e.target&&e.target.id==="sCatSel")sCat=e.target.value||"";
});
$("sheets").addEventListener("click",e=>{
  const b=e.target.closest("[data-buy],[data-cbuy],[data-ecpay],[data-paid],[data-ship],[data-late],[data-claim],[data-recv],[data-pack],[data-oship],[data-refund],[data-submit],[data-p],[data-p2],[data-pay],[data-sconfirm],[data-rate],[data-star],[data-appeal],[data-apsend],[data-adjudge],[data-adreject],[data-x],[data-c2c],[data-b2c],[data-q],[data-slot],[data-busy],[data-ad],[data-adlen],[data-kw],[data-adbuy],[data-go],[data-prob],[data-opt],[data-sku],[data-q],[data-confirm],[data-addcart],[data-cart],[data-cartb],[data-ordt],[data-csel],[data-callall],[data-cq],[data-cgrp],[data-cspec],[data-cpick],[data-checkout],[data-placeorder],[data-copay],[data-coupon],[data-shopcpn],[data-shopcpnpick],[data-note],[data-notesave],[data-shipsel],[data-coship],[data-paysel],[data-cpn],[data-addr],[data-shop],[data-chat],[data-itm2],[data-say],[data-send],[data-edit],[data-del],[data-off],[data-relist],[data-sot],[data-sod],[data-sopaid],[data-socancel],[data-soway],[data-soship],[data-sorecv],[data-noti],[data-go],[data-ord],[data-orders],[data-more],[data-menu],[data-promo],[data-payex],[data-shipex],[data-amtex],[data-qs],[data-qgo],[data-qdel],[data-scat]");
  if(!b)return;const d=b.dataset;
  if(d.amtex){const box=$$("#amtBox"),ar=b.querySelector(".amtar");
    if(box){const open=box.style.display!=="none";box.style.display=open?"none":"block";if(ar)ar.style.transform=open?"":"rotate(180deg)"}return}
  if(d.shipex){const box=$$("#shipExBox"),ar=b.querySelector(".shipar");
    if(box){const open=box.style.display!=="none";box.style.display=open?"none":"block";if(ar)ar.style.transform=open?"":"rotate(180deg)"}return}
  if(d.payex){const box=$$("#payExBox"),ar=b.querySelector(".exar");
    if(box){const open=box.style.display!=="none";box.style.display=open?"none":"block";if(ar)ar.style.transform=open?"":"rotate(180deg)"}return}
  if(d.ordt!==undefined){ordTab=+d.ordt;ordersSheet();return}
  if(d.orders!==undefined){ordTab=+d.orders;ordersSheet();return}
  if(d.ord){openOrder(d.ord);return}
  if(d.more){moreSheet(d.more);return}
  if(d.menu!==undefined){listMenu(+d.menu);return}
  if(d.promo!==undefined){promoFor=+d.promo;fromPromo=true;adCenter();return}
  const o=orders.find(x=>x.no===(d.paid||d.ship||d.late||d.claim||d.recv||d.pack||d.oship||d.refund));
  if(d.cart){specSheet("c2c",+d.cart,"cart");return}
  else if(d.cartb){specSheet("b2c",+d.cartb,"cart");return}
  else if(d.buy)specSheet("c2c",+d.buy,"buy");
  else if(d.cbuy)specSheet("b2c",+d.cbuy,"buy");
  else if(d.opt!==undefined&&!b.disabled){buyCtx.oi=+d.opt;buyCtx.ii=0;buyCtx.qty=1;spUpd()}
  else if(d.sku!==undefined&&!b.disabled){buyCtx.ii=+d.sku;buyCtx.qty=1;spUpd()}
  else if(d.q){const it=(buyCtx.kind==="c2c"?C2C:B2C).find(x=>x.id===buyCtx.id);const o=curSku();buyCtx.qty=Math.min(o.q,Math.max(1,buyCtx.qty+(+d.q)));spUpd()}
  else if(d.confirm)confirmBuy();
  else if(d.csel!==undefined&&!e.target.closest("[data-stop]")){SFX.tap();const i=+d.csel;
    if(cart[i].sel)cart[i].sel=false;else selectOnly(i);
    cartSheet();return}
  else if(d.callall){
    const g=selShop()||shopOf(cart[0]);
    const idx=cart.map((c,i)=>shopOf(c)===g?i:-1).filter(i=>i>=0);
    const all=idx.every(i=>cart[i].sel);
    cart.forEach(c=>c.sel=false);
    if(!all)idx.forEach(i=>cart[i].sel=true);
    cartSheet();return}
  else if(d.cq){const p=d.cq.split(":").map(Number);
    if(cart[p[0]].qty+p[1]<=0){askDel(p[0]);return}
    if(DB){const c=cart[p[0]];push(()=>DB.cartSetQty(...cartKey(c),c.qty+p[1]),"",()=>cartSheet());return}
    cart[p[0]].qty=cart[p[0]].qty+p[1];cartSheet();return}
  else if(d.cgrp){const idx=d.cgrp.split(",").map(Number);const all=idx.every(i=>cart[i].sel);
    if(all)idx.forEach(i=>cart[i].sel=false);
    else{const g=shopOf(cart[idx[0]]);let cross=false;
      cart.forEach(c=>{if(shopOf(c)!==g&&c.sel){cross=true;c.sel=false}});
      idx.forEach(i=>cart[i].sel=true);
      if(cross)toast("一次只能結帳一個賣場");}
    cartSheet();return}
  else if(d.cspec){specPicker(+d.cspec);return}
  else if(d.cpick){const p=d.cpick.split(":").map(Number);cart[p[0]].oi=p[1];cart[p[0]].ii=p[2];toast("已更換品項");cartSheet();return}
  else if(d.cdel!==undefined){
    if(DB){const c=cart[+d.cdel];push(()=>DB.cartSetQty(...cartKey(c),0),"已移除",()=>cartSheet());return}
    cart.splice(+d.cdel,1);toast("已移除");cartSheet();return}
  else if(d.checkout){checkout();return}
  else if(d.placeorder){placeOrder();return}
  else if(d.copay){const p=d.copay.split("|");coPay[p[0]]=p[1];close();checkoutSheet(coItems);return}
  else if(d.coupon){couponSheet();return}
  else if(d.shipsel){shipSelSheet(d.shipsel);return}
  else if(d.shopcpn){shopCpnSheet(d.shopcpn);return}
  else if(d.shopcpnpick){const p=d.shopcpnpick.split("|"),i=+p[1];
    const list=SHOP_COUPONS[p[0]]||SHOP_COUPONS._default;
    if(i<0)delete coShopCpn[p[0]];else coShopCpn[p[0]]=list[i];
    close();checkoutSheet(coItems);return}
  else if(d.note){noteSheet(d.note);return}
  else if(d.notesave){coNote[d.notesave]=($("noteIn")&&$("noteIn").value)||"";close();checkoutSheet(coItems);return}
  else if(d.coship){const p=d.coship.split("|");const o=SHIP_OPTS.find(x=>x.n===p[1]);
    const it0=(()=>{for(const c of coItems){const it=(c.kind==="c2c"?C2C:B2C).find(x=>x.id===c.id);
      if(it&&(c.kind==="b2c"?"吉吉比官方旗艦店":it.s)===p[0])return it}})();
    coShip[p[0]]={n:o.n,fee:it0&&!it0.ship?0:o.fee};close();checkoutSheet(coItems);return}
  else if(d.paysel){paySelSheet();return}
  else if(d.cpn){const i=+d.cpn;coCoupon=i<0?{n:"",amt:0}:{n:COUPONS[i].n,amt:COUPONS[i].amt};close();checkoutSheet(coItems);return}
  else if(d.addr){addrSheet();return}
  else if(d.addcart){
    const c=buyCtx;
    if(DB){SFX.add();close();push(()=>DB.cartAdd(c.id,c.oi,c.ii,c.qty),"已加入購物車");return}
    const ex=cart.find(x=>x.kind===c.kind&&x.id===c.id&&x.oi===c.oi&&x.ii===c.ii);
    if(ex)ex.qty+=c.qty;else cart.push({kind:c.kind,id:c.id,oi:c.oi,ii:c.ii,qty:c.qty,sel:true});
    SFX.add();toast("已加入購物車");close();render();return}
  else if(d.noti!==undefined){const n=NOTIS[+d.noti];if(n.go==="sorders")sellOrdersSheet();else if(n.go==="orders"){ordTab=0;ordersSheet()}else if(n.go==="ads")adCenter();else{close();render()}return}
  else if(d.edit!==undefined){editIdx=+d.edit;sellForm();return}
  else if(d.del!==undefined){
    const m=myList[+d.del];
    if(m.locked){toast("交易進行中，無法刪除");return}
    if(DB){close();push(()=>DB.deleteListing(m.id),"已刪除");return}
    myList.splice(+d.del,1);syncMine();toast("已刪除");close();render();return}
  else if(d.off!==undefined){
    const m=myList[+d.off];
    if(m.locked){toast("交易進行中，無法下架");return}
    if(DB){close();push(()=>DB.setListingStatus(m.id,"off"),"已下架");return}
    m.st="off";syncMine();toast("已下架");close();render();return}
  else if(d.relist!==undefined){const m=myList[+d.relist];
    // 重新上架一樣要重審（規則 7），所以回 pending 不是 active
    if(DB){close();push(()=>DB.setListingStatus(m.id,"pending"),"已送出重新上架，待審核");return}
    m.st="active";syncMine();toast("已重新上架");close();render();return}
  else if(d.noti!==undefined){const n=NOTIS[+d.noti];if(n.go==="sorders")sellOrdersSheet();else if(n.go==="orders"){ordTab=0;ordersSheet()}else if(n.go==="ads")adCenter();return}
  else if(d.shop){shopSheet(d.shop);return}
  else if(d.sot!==undefined){soTab=+d.sot;sellOrdersSheet();return}
  else if(d.sod){sellOrderDetail(d.sod);return}
  else if(d.socancel){askCancel(d.socancel);return}
  else if(d.socancelyes){const o=sellOrders.find(x=>x.no===d.socancelyes);
    $("dlg").classList.remove("on");
    if(DB&&o&&o.oid){push(()=>DB.cancelOrder(o.oid),"已取消，保證金進入 72 小時申訴保留期",()=>sellOrderDetail(o.no));return}
    o.st=5;o.holdLeft=72;
    toast("已取消，保證金進入 72 小時申訴保留期");sellOrderDetail(o.no);render();return}
  else if(d.sopaid){const o=sellOrders.find(x=>x.no===d.sopaid);
    if(DB&&o&&o.oid){push(()=>DB.confirmPayment(o.oid),"已確認收款，請於 72 小時內出貨",()=>sellOrderDetail(o.no));return}
    o.st=2;toast("已確認收款，請於 72 小時內出貨");sellOrderDetail(o.no);render();return}
  else if(d.soway!==undefined){soWay=+d.soway;root.querySelectorAll("#soWay .pick").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.soway===soWay));return}
  else if(d.soship){const o=sellOrders.find(x=>x.no===d.soship);
    const tk=($("soTrack")&&$("soTrack").value.trim())||"F"+String(Math.random()).slice(2,11);
    if(DB&&o&&o.oid){push(()=>DB.markShipped(o.oid,tk),"已出貨，單號 "+tk,()=>sellOrderDetail(o.no));return}
    o.st=3;o.late=false;o.track=tk;
    toast("已出貨，單號 "+o.track);sellOrderDetail(o.no);render();return}
  else if(d.sorecv){const o=sellOrders.find(x=>x.no===d.sorecv);o.st=4;toast(`保證金 ${nt(o.dep)}G 已退還`);sellOrderDetail(o.no);render();return}
  else if(d.chat){
    let ctx=null;
    if(d.itm2){const it=C2C.find(x=>x.id===+d.itm2);if(it)ctx={kind:"item",id:it.id,t:it.t,p:minP(it),k:it.k,cid:it.id,specs:!!it.specs}}
    else if(d.ord2)ctx=Object.assign({kind:"order"},orders.find(x=>x.no===d.ord2)||{});
    else if(d.sord2)ctx=Object.assign({kind:"order"},sellOrders.find(x=>x.no===d.sord2)||{});
    chatSheet(d.chat,ctx&&ctx.t?ctx:null);return}
  else if(d.say){const nm=$$("h3").textContent;say(nm,d.say);return}
  else if(d.send){
    // 聊聊的訊息還沒寫進 sell_messages（第四批）。本機顯示得出來但對方收不到，
    // 這種「以為講過了」比不能聊更糟。
    if(DB){toast("聊聊即將開放，急件請先用客服");return}
    say(d.send,$("chatIn").value);return}
  else if(d.c2c)itemC2C(+d.c2c);
  else if(d.b2c)itemB2C(+d.b2c);
  else if(d.qs!==undefined){searchSheet(d.qs);return}
  else if(d.qgo!==undefined){const el=$("qIn");searchSheet(el?el.value.trim():"");return}
  else if(d.qdel!==undefined){hist.del(d.qdel);searchSheet("");return}
  else if(d.scat!==undefined){sCat=d.scat;
    root.querySelectorAll("#catPick .opt").forEach(x=>x.setAttribute("aria-pressed",x.dataset.scat===sCat));return}
  else if(d.q)searchSheet(d.q);
  else if(d.busy){toast(`推廣中，剩 ${d.busy} 天結束後才能再購買`);return}
  else if(d.slot)adBuy(d.slot);
  else if(d.ad!==undefined&&!b.disabled){adStart=+d.ad;adUpd()}
  else if(d.adlen){adDays=+d.adlen;adUpd()}
  else if(d.kw){adKw=d.kw;root.querySelectorAll("#kwPick .kw").forEach(x=>x.setAttribute("aria-pressed",x.dataset.kw===adKw));adUpd()}
  else if(d.adbuy){
    const t=slotOf(d.adbuy),cost=adCost(),sup=d.adbuy.indexOf("b_")===0;
    // 廣告版位會扣 G 幣。sell_ad_purchase 有了但購買流程（檔期／關鍵字）還沒接完，
    // 先擋住 —— 扣了錢卻沒有真的排到版位是最不能發生的事。
    if(DB){toast("廣告版位購買整理中，稍後開放");return}
    if(!sup&&cost>gbal-locked){toast("G幣不足");return}
    for(let n=0;n<adDays&&adStart+n<DATES.length;n++)used[d.adbuy][adStart+n]=Math.min(t.seats,used[d.adbuy][adStart+n]+1);
    if(sup){
      const who=$("supPick")?$("supPick").value:"供應商";
      toast(`已為 ${who} 建立 ${t.n} ${adDays} 天排程`);close();tab="official";syncTabs();render();
    }else{
      gbal-=cost;
      if(myList[promoFor]){
      const m=myList[promoFor];
      m.ads=m.ads||[];
      const ex=m.ads.find(x=>x.id===t.id);
      if(ex)ex.left+=adDays;else m.ads.push({id:t.id,n:t.n,left:adDays});
      m.views=(m.views||0)+Math.round(adDays*38+Math.random()*40);
    }
      syncMine();
      toast(`已購買 ${t.n} ${adDays} 天`);close();tab="me";syncTabs();render();
    }
  }
  else if(d.prob){pro=true;toast("已升級官方認證商家");close();tab="me";syncTabs();render();}
  else if(d.go==="ads"){adCenter();return}
  else if(d.go==="chats"){chatList();return}
  else if(d.go==="notis"){notiSheet();return}
  else if(d.go==="sorders"){sellOrdersSheet();return}
  else if(d.go==="pro"){goPro();return}
  else if(d.ecpay){
    // 官方商城的金流（綠界）還沒接。先前這裡直接跳「付款成功」並開一張假訂單，
    // 玩家會以為錢付掉了 —— 寧可明說還沒開放。
    if(DB){toast("官方商城結帳即將開放，目前請先逛玩家商城");return}
    const sp=d.spec,q=+d.qty||1,tt=+d.tot||0;close();setTimeout(()=>buyB2C(+d.ecpay,sp,q,tt),260)}
  else if(d.pay){const cur=orders.find(x=>x.st===0&&x.pays&&x.pays.includes(d.pay));if(cur){cur.pay=d.pay;openOrder(cur.no)}}
  else if(d.paid){
    if(DB&&o.oid){push(()=>DB.markPaid(o.oid),"已回報匯款，等待賣家確認",()=>openOrder(o.no));return}
    o.st=1;toast("已回報匯款，等待賣家確認");openOrder(o.no)}
  else if(d.sconfirm){const x=orders.find(y=>y.no===d.sconfirm);x.st=2;toast("賣家已確認收款");openOrder(x.no)}
  else if(d.star){const p=d.star.split("|");const o=orders.find(x=>x.no===p[0]);o.stars=+p[1];SFX.tap();openOrder(o.no);return}
  else if(d.rate){const o=orders.find(x=>x.no===d.rate);
    const stars=o.stars||4, txt=($$("#revIn")&&$$("#revIn").value)||"";
    if(DB&&o.oid){SFX.done();closeAll();tab="market";syncTabs();
      push(()=>DB.review(o.oid,stars>=4,txt),"評價已送出");return}
    o.stars=stars;o.review=txt;o.rated=true;
    SFX.done();closeAll();tab="market";syncTabs();render();toast("評價已送出");return}
  else if(d.appeal){appealForm(d.appeal);return}
  else if(d.apsend){
    // 申訴的資料表與後台判定流程還沒做（第三批）。送出後沒有人收得到，
    // 不能顯示「後台審核中」讓買家乾等。
    if(DB){toast("申訴功能整理中，請先透過客服聯繫我們");return}
    const o=orders.find(x=>x.no===d.apsend);
    appeals.unshift({no:o.no,buyer:ME.name,seller:o.s,amt:o.p,dep:o.dep,last5:($("apLast5")&&$("apLast5").value)||"—",holdLeft:o.holdLeft||72});
    toast("申訴已送出，後台審核中");close();render();return}
  else if(d.adjudge!==undefined){const ap=appeals.splice(+d.adjudge,1)[0];gbal+=ap.dep;toast(`已賠付 ${nt(ap.dep)}G 給買家，賣家停權`);adminPanel();return}
  else if(d.adreject!==undefined){const ap=appeals.splice(+d.adreject,1)[0];toast("已解鎖保證金，申訴結案");adminPanel();return}
  else if(d.ship){o.st=3;o.late=false;o.track="F"+String(Math.random()).slice(2,11);toast("已出貨");openOrder(o.no)}
  else if(d.late){o.late=true;toast("賣家逾時，可申訴");openOrder(o.no)}
  else if(d.claim){
    if(DB&&o.oid){push(()=>DB.claimCompensation(o.oid),`已補償 ${nt(o.dep)}G`,()=>openOrder(o.no));return}
    o.st=4;gbal+=o.dep;toast(`已補償 ${nt(o.dep)}G`);openOrder(o.no)}
  else if(d.recv){
    if(DB&&o.oid){push(()=>DB.confirmReceived(o.oid),"交易完成",()=>openOrder(o.no));return}
    o.st=o.type==="b2c"?3:4;toast("交易完成");openOrder(o.no)}
  else if(d.pack){o.st=1;toast("備貨完成");openOrder(o.no)}
  else if(d.oship){o.st=2;o.track="F"+String(Math.random()).slice(2,11);toast("官方已出貨");openOrder(o.no)}
  else if(d.refund){
    if(DB){toast("退款申請即將開放，請先聯繫客服");return}
    o.st=3;toast("退款已送出");openOrder(o.no)}
  else if(d.p||d.p2){
    const v=d.p||d.p2,i=myPays.indexOf(v);
    if(i>-1){if(myPays.length===1){toast("至少保留一種收款方式");return}myPays.splice(i,1)}else myPays.push(v);
    root.querySelectorAll(`[${d.p?"data-p":"data-p2"}]`).forEach(x=>x.setAttribute("aria-pressed",myPays.includes(x.dataset.p||x.dataset.p2)));
  }
  else if(d.x){close();render()}
  else if(d.submit){
    const t=tierOf(ME),ti=$("sT").value.trim()||"未命名商品",p=+$("sP").value||0,q=+$("sQ").value||1;
    if($("sCatSel"))sCat=$("sCatSel").value||"";
    if(!sCat){toast("請先選擇商品類別");return}
    if(!p){toast("請輸入售價");return}
    if(p>t.max){toast(`「${t.n}」單件最高賣 ${nt(t.max)}`);return}
    const need=Math.ceil(p*t.ratio),sh=myShip;
    let sp=null,tq=q;
    const pack=r=>r.items.filter(m=>m.n.trim()).map(m=>({n:m.n.trim(),p:m.p||p,q:m.q,k:m.k||"fig"}));
    if(useSpec){
      const o=specTree.filter(r=>r.v.trim()).map(r=>({v:r.v.trim(),items:pack(r)})).filter(r=>r.items.length);
      if(!o.length){toast("請至少填一個規格與選項");return}
      sp={n:"規格",o};
      tq=o.reduce((n,x)=>n+x.items.reduce((a,m)=>a+m.q,0),0);
    }else{
      const items=pack(specTree[0]);
      if(items.length){sp={n:"品項",o:[{v:"",items}]};tq=items.reduce((a,m)=>a+m.q,0);}
    }
    if(DB){
      const m=editIdx!==null?myList[editIdx]:null;
      const wasEdit=editIdx!==null;editIdx=null;
      close();tab="me";syncTabs();
      push(()=>DB.saveListing({t:ti,p,ship:sh,specs:sp,category:sCat},m?m.id:undefined),
           wasEdit?"已儲存變更":"已送出審核");
      return;
    }
    if(editIdx!==null){
      const m=myList[editIdx];
      Object.assign(m,{t:ti,p,q:tq,need,ship:sh,specs:sp});
      editIdx=null;syncMine();toast("已儲存變更");
    }else{
      myList.unshift({id:Date.now()%100000,t:ti,p,q:tq,need,ship:sh,k:"fig",st:"pending",locked:false,ad:"",views:0,specs:sp,category:sCat});
      toast("已送出審核");
    }
    close();tab="me";syncTabs();render();
  }
  if(orders.length&&tab==="orders")render();
});
/* 商品頁（獨立頁）裡的按鈕：內容畫在 #screen，原型的彈層 handler 管不到，這裡接 */
if(ITEM_MODE)$("screen").addEventListener("click",e=>{
  const b=e.target.closest("[data-iback],[data-share],[data-shop],[data-cart],[data-cartb],[data-buy],[data-cbuy]");
  if(!b)return;const d=b.dataset;
  if(d.iback!==undefined)goBack();
  else if(d.share!==undefined)shareItem();
  else if(d.shop)shopSheet(d.shop);
  else if(d.cart)specSheet("c2c",+d.cart,"cart");
  else if(d.cartb)specSheet("b2c",+d.cartb,"cart");
  else if(d.buy)specSheet("c2c",+d.buy,"buy");
  else if(d.cbuy)specSheet("b2c",+d.cbuy,"buy");
});
root.querySelectorAll(".tabbar button").forEach(b=>b.onclick=()=>{tab=b.dataset.tab;syncTabs();render()});
function syncTabs(){root.querySelectorAll(".tabbar button").forEach(x=>x.setAttribute("aria-selected",x.dataset.tab===tab));syncUrl()}

if(opts.initialTab==="official"||opts.initialTab==="me"||opts.initialTab==="notis")tab=opts.initialTab;
readUrl();                       // ?tab= / ?c=（蓋過 initialTab）
syncMine();syncTabs();render();
restoreLayers();                 // ?v= 的彈層要等殼畫好才能開
if(!pendingRoute)syncUrl();      // 對齊網址（?tab=market 這種多餘的拿掉；開不回來的 ?v= 拿掉）
window.addEventListener("popstate",onPop);
// 先畫再拉：殼與列表已經有真資料了，訂單/購物車慢一步進來不影響第一眼
if(DB)pull();

return {
  destroy(){
    window.removeEventListener("popstate",onPop);
    clearTimeout(expectT);
    if(tick){clearInterval(tick);tick=null}
    if(heroT){clearInterval(heroT);heroT=null}
    try{if(AC&&AC.close)AC.close()}catch(e){}
  },
};

}

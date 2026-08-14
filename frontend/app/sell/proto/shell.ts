// 商城外殼靜態標記 —— 自原型 <body> 逐字移植，由 initMall 接手所有互動
export const MALL_SHELL = `

  <div id="hdr"></div>
  <div class="screen" id="screen"></div>
  <nav class="tabbar" role="tablist">
    <button role="tab" data-tab="market" aria-selected="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>找物</button>
    <button role="tab" data-tab="official" aria-selected="false"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l1.5-5h15L21 9M4.5 9v11h15V9M4.5 9h15"/><path d="M9.5 20v-6h5v6"/></svg>商城</button>
    <button role="tab" data-tab="notis" aria-selected="false"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 15V10a6 6 0 10-12 0v5l-1.6 2.4h15.2z"/><path d="M10 19.5a2.2 2.2 0 004 0"/></svg>通知<span class="nd" id="ordDot" style="display:none"></span></button>
    <button role="tab" data-tab="me" aria-selected="false"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0115 0"/></svg>我的</button>
  </nav>
  <div id="sheets"></div>
  <div class="dlg" id="dlg"></div>
  <div class="toast" id="toast"></div>

`;

import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await b.newPage();
await page.addInitScript(() => {
  window.__gains = [];
  const OrigCtx = window.AudioContext;
  window.AudioContext = class extends OrigCtx {
    constructor(...a) { super(...a); window.__ctx = this;
      const oc = this.createGain.bind(this);
      this.createGain = () => { const g = oc(); window.__gains.push(g); return g; }; }
  });

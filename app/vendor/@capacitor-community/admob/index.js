import { registerPlugin } from '../../@capacitor/core/index.js';
const AdMob = registerPlugin('AdMob', {
    web: () => import( './web.js').then((m) => new m.AdMobWeb()),
});
export * from './definitions.js';
export * from './banner/index.js';
export * from './interstitial/index.js';
export * from './reward-interstitial/index.js';
export * from './reward/index.js';
export * from './consent/index.js';
export * from './shared/index.js';
export * from './app-open/index.js';
export { AdMob };
//# sourceMappingURL=index.js.map
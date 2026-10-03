import { registerPlugin } from '../core/index.js';
const Haptics = registerPlugin('Haptics', {
    web: () => import('./web.js').then((m) => new m.HapticsWeb()),
});
export * from './definitions.js';
export { Haptics };
//# sourceMappingURL=index.js.map
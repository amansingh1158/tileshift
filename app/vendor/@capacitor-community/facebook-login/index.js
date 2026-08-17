import { registerPlugin } from '../../@capacitor/core/index.js';
const FacebookLogin = registerPlugin('FacebookLogin', {
    web: () => import('./web.js').then((m) => new m.FacebookLoginWeb()),
});
export * from './definitions.js';
export { FacebookLogin };
//# sourceMappingURL=index.js.map
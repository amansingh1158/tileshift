import { Capacitor } from '../vendor/@capacitor/core/index.js';
import { AdMob, BannerAdSize, BannerAdPosition } from '../vendor/@capacitor-community/admob/index.js';
import { adsConfig } from './ads-config.js';

export function adsEnabled() {
  return Capacitor.isNativePlatform() && Boolean(adsConfig.bannerAdId);
}

export async function showBanner() {
  if (!adsEnabled()) return;
  try {
    await AdMob.initialize();
    await AdMob.showBanner({
      adId: adsConfig.bannerAdId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 10,
    });
  } catch (err) {
    console.warn('banner failed', err);
  }
}
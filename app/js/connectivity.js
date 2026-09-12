// Deprecated: the internet gate was removed in 1.1.2. This stub exists so
// cached service-worker copies of the old code that still import this module
// continue to work without errors. All functions return the "online" state.
export function isOnline() { return true; }
export function showOffline() {}
export function hideOffline() {}
export async function hasInternet() { return true; }
export async function probeReachable() { return true; }
export async function gateOnline() { return true; }
export function gateOnlineSync() { return true; }

/** Executed inside the paired browser by Puppeteer; keep this function self-contained. */
export function installWwjsBrowserCompatibility(): void {
  const runtime = (globalThis as any).window;
  const utils = runtime?.WWebJS;
  if (!utils || typeof utils.processMediaData !== 'function' || typeof utils.getMessageModel !== 'function') {
    throw new Error('WhatsApp browser helpers are not ready');
  }

  // Current MsgKey exposes its canonical key through toString(), while wwjs
  // still reads _serialized when looking up a send receipt. Never invent a key.
  const MsgKey = runtime.require('WAWebMsgKey');
  if (!('_serialized' in MsgKey.prototype)) {
    Object.defineProperty(MsgKey.prototype, '_serialized', {
      configurable: true,
      get(this: { toString(): string }) { return this.toString(); },
    });
  }

  if (utils.processMediaData.qentryCompatibilityVersion !== 1) {
    const prepare = utils.processMediaData;
    const compatiblePrepare = async function (...args: any[]) {
      const media = await prepare.apply(utils, args);
      // Spreading a live MediaData model leaks __x_id (undefined) into Msg's
      // backing state. Use schema attributes only; media must never replace the
      // newly generated message identity, even if toJSON includes an empty id.
      const attributes = typeof media.toJSON === 'function' ? media.toJSON() : media;
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (key !== 'id' && !key.startsWith('_') && !['parent', 'collection', 'mirror'].includes(key)) {
          result[key] = value;
        }
      }
      return result;
    };
    compatiblePrepare.qentryCompatibilityVersion = 1;
    utils.processMediaData = compatiblePrepare;
  }

  if (utils.getMessageModel.qentryCompatibilityVersion !== 1) {
    const serialize = utils.getMessageModel;
    const compatibleSerialize = function (message: any) {
      const result = serialize.call(utils, message);
      // The SDK serializes MsgKey as a plain object, losing prototype getters.
      if (result?.id && typeof result.id === 'object' && !result.id._serialized) {
        const key = message?.id;
        if (key && typeof key.toString === 'function') {
          const canonical = key.toString();
          if (typeof canonical === 'string' && /^(true|false)_.+_.+/.test(canonical)) {
            result.id = { ...result.id, _serialized: canonical };
          }
        }
      }
      return result;
    };
    compatibleSerialize.qentryCompatibilityVersion = 1;
    utils.getMessageModel = compatibleSerialize;
  }
}

import { installWwjsBrowserCompatibility } from './wwjs-browser-compatibility';

describe('WhatsApp browser compatibility at the SDK boundary', () => {
  let runtime: any;
  let Key: any;
  beforeEach(() => {
    Key = class {
      constructor(public id = 'REAL', public remote = '100000001@lid') {}
      toString() { return `true_${this.remote}_${this.id}`; }
    };
    runtime = {
      require: jest.fn(() => Key),
      WWebJS: {
        processMediaData: jest.fn(async () => ({
          __x_id: undefined, __initialized: true, collection: {},
          toJSON: () => ({ id: undefined, type: 'image', mediaKey: 'encrypted-key', preview: 'preview', caption: 'caption', __x_id: undefined }),
        })),
        getMessageModel: jest.fn((message: any) => ({ id: { id: message.id.id, remote: message.id.remote }, ack: message.ack })),
      },
    };
    (globalThis as any).window = runtime;
  });
  afterEach(() => { delete (globalThis as any).window; });

  it('prevents media model internals and empty media identity from overwriting a new message', async () => {
    installWwjsBrowserCompatibility();
    const media = await runtime.WWebJS.processMediaData({ data: 'image' });
    const key = new Key();
    const message = { id: key, ...media };
    expect(message.id).toBe(key);
    expect(message).toEqual({ id: key, type: 'image', mediaKey: 'encrypted-key', preview: 'preview', caption: 'caption' });
    expect(Object.keys(media).some(k => k.startsWith('_'))).toBe(false);
  });
  it('bridges collection lookup and the plain-object send/ACK serialization using the real key', () => {
    installWwjsBrowserCompatibility();
    const key = new Key();
    const model = { id: key, ack: 2 };
    const collection = new Map([[key.toString(), model]]);
    expect(collection.get(key._serialized)).toBe(model);
    expect(runtime.WWebJS.getMessageModel(model).id._serialized).toBe(key.toString());
  });
  it('does not wrap helpers repeatedly or replace existing SDK receipt semantics', async () => {
    Object.defineProperty(Key.prototype, '_serialized', { get() { return 'true_100000001@lid_ORIGINAL'; } });
    runtime.WWebJS.getMessageModel = jest.fn(() => ({ id: { _serialized: 'true_100000001@lid_ORIGINAL' } }));
    const prepare = runtime.WWebJS.processMediaData;
    installWwjsBrowserCompatibility();
    const wrapped = runtime.WWebJS.processMediaData;
    installWwjsBrowserCompatibility();
    expect(runtime.WWebJS.processMediaData).toBe(wrapped);
    await wrapped({ data: 'image' });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(new Key()._serialized).toBe('true_100000001@lid_ORIGINAL');
    expect(runtime.WWebJS.getMessageModel({ id: new Key() }).id._serialized).toBe('true_100000001@lid_ORIGINAL');
  });
  it('rejects missing helpers before a send can start', () => {
    delete runtime.WWebJS;
    expect(installWwjsBrowserCompatibility).toThrow('helpers are not ready');
  });
});

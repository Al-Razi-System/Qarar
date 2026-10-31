import { Client } from 'whatsapp-web.js';
import { WhatsAppWebJsAdapter } from './whatsapp-web-js.adapter';

jest.mock('whatsapp-web.js', () => {
  const { EventEmitter } = jest.requireActual('events');
  return {
    Client: jest.fn(() => Object.assign(new EventEmitter(), {
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      pupPage: { evaluate: jest.fn().mockResolvedValue(undefined) },
    })),
    LocalAuth: jest.fn(),
    MessageMedia: jest.fn().mockImplementation((mimetype, data, filename) => ({ mimetype, data, filename })),
  };
});
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (code: string) => `data:image/png;base64,${code}`) }));

describe('WhatsApp pairing QR freshness', () => {
  let adapter: WhatsAppWebJsAdapter;
  let client: { emit: (event: string, value?: string) => void };
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T15:00:00Z'));
    adapter = new WhatsAppWebJsAdapter({ sessionId: 'unit-pairing', sessionDataPath: '/tmp/unit-pairing' });
    await adapter.initialize({});
    client = (Client as unknown as jest.Mock).mock.results[0].value;
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('does not expose QR before the provider emits it', () => {
    expect(adapter.getQRCode()).toBeNull();
  });
  it('rejects a cached image after its conservative display lease', async () => {
    client.emit('qr', 'first');
    await Promise.resolve();
    expect(adapter.getQRCode()).toBe('data:image/png;base64,first');
    jest.advanceTimersByTime(15000);
    expect(adapter.getQRCode()).toBeNull();
    // No event means no fresh QR, including a lengthy provider pause.
    jest.advanceTimersByTime(60000);
    expect(adapter.getQRCode()).toBeNull();
    client.emit('qr', 'second');
    await Promise.resolve();
    expect(adapter.getQRCode()).toBe('data:image/png;base64,second');
  });
  it('does not expose the previous QR after authentication begins', async () => {
    client.emit('qr', 'first');
    await Promise.resolve();
    client.emit('authenticated');
    expect(adapter.getQRCode()).toBeNull();
  });
  it('does not expose the previous QR after disconnection', async () => {
    client.emit('qr', 'first');
    await Promise.resolve();
    client.emit('disconnected', 'test');
    expect(adapter.getQRCode()).toBeNull();
  });
});


describe('Canonical WhatsApp destinations and real send receipts', () => {
  let adapter: WhatsAppWebJsAdapter;
  let client: any;
  beforeEach(async () => {
    jest.clearAllMocks();
    adapter = new WhatsAppWebJsAdapter({sessionId:'unit-media',sessionDataPath:'/tmp/unit-media'});
    await adapter.initialize({});
    client = (Client as unknown as jest.Mock).mock.results[0].value;
    client.emit('ready');
    await Promise.resolve();
    await Promise.resolve();
    client.getNumberId = jest.fn().mockResolvedValue({_serialized:'100000001@lid'});
    client.getContactLidAndPhone = jest.fn().mockResolvedValue([]);
    client.sendMessage = jest.fn().mockResolvedValue({id:{_serialized:'true_100000001@lid_TEST'},timestamp:1000});
  });
  it('resolves an explicit phone JID to the canonical LID for images', async () => {
    const result=await adapter.sendImageMessage('967700000001@c.us',{mimetype:'image/jpeg',data:'fake-base64',caption:'invitation'});
    expect(client.getNumberId).toHaveBeenCalledWith('967700000001');
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledWith('100000001@lid',expect.objectContaining({mimetype:'image/jpeg'}),{caption:'invitation',sendSeen:false,waitUntilMsgSent:true});
    expect(result.id).toBe('true_100000001@lid_TEST');
  });
  it('resolves plain numbers and s.whatsapp.net destinations for text', async () => {
    await adapter.sendTextMessage('967700000001','message');
    await adapter.sendTextMessage('967700000001@s.whatsapp.net','message');
    expect(client.sendMessage).toHaveBeenLastCalledWith('100000001@lid','message',{sendSeen:false,waitUntilMsgSent:true});
  });
  it('preserves an already canonical LID without a phone lookup', async () => {
    await adapter.sendTextMessage('100000001@lid','message');
    expect(client.getNumberId).not.toHaveBeenCalled();
  });
  it('supports a registered phone JID returned by the provider', async () => {
    client.getNumberId.mockResolvedValue({_serialized:'967700000001@c.us'});
    await adapter.sendTextMessage('967700000001@c.us','message');
    expect(client.sendMessage).toHaveBeenCalledWith('967700000001@c.us','message',{sendSeen:false,waitUntilMsgSent:true});
  });
  it('uses the existing phone-to-LID mapping when the remote number lookup cannot resolve a real chat', async () => {
    client.getContactLidAndPhone.mockResolvedValue([{lid:'100000001@lid',pn:'967700000001@c.us'}]);
    client.getNumberId.mockResolvedValue(null);
    await adapter.sendTextMessage('967700000001@c.us','message');
    expect(client.getContactLidAndPhone).toHaveBeenCalledWith(['967700000001@c.us']);
    expect(client.getNumberId).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith('100000001@lid','message',{sendSeen:false,waitUntilMsgSent:true});
  });
  it.each(['image','text'])('does not manufacture a success or retry a %s with missing receipt', async type => {
    client.sendMessage.mockResolvedValue(undefined);
    const send=type==='image'?adapter.sendImageMessage('967700000001@c.us',{mimetype:'image/jpeg',data:'fake'}):adapter.sendTextMessage('967700000001@c.us','text');
    await expect(send).rejects.toThrow('outcome requires review');
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });
  it('does not send to an unresolved recipient', async () => {
    client.getNumberId.mockResolvedValue(null);
    await expect(adapter.sendTextMessage('967700000001@c.us','message')).rejects.toThrow('could not be resolved');
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
  it('does not fall back to the old JID after a lookup error', async () => {
    client.getNumberId.mockRejectedValue(new Error('lookup failed'));
    await expect(adapter.sendTextMessage('967700000001@c.us','message')).rejects.toThrow('lookup failed');
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
  it('does not broadcast when browser compatibility preparation fails', async () => {
    client.pupPage.evaluate.mockRejectedValue(new Error('helpers missing'));
    await expect(adapter.sendTextMessage('967700000001', 'text')).rejects.toThrow('helpers missing');
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
  it('uses a real current-version key for receipts and acknowledgment callbacks', async () => {
    const ack = jest.fn();
    (adapter as any).callbacks = { onMessageAck: ack };
    client.sendMessage.mockResolvedValue({ id: { $1: 'true_100000001@lid_REAL' }, timestamp: 1000 });
    expect((await adapter.sendTextMessage('100000001@lid', 'text')).id).toBe('true_100000001@lid_REAL');
    client.emit('message_ack', { id: { $1: 'true_100000001@lid_REAL' } }, 2);
    client.emit('message_ack', { id: {} }, 2);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith('true_100000001@lid_REAL', 2);
  });
});

import { EventsGateway } from './events.gateway';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';

describe('EventsGateway session isolation', () => {
  const auth = { validateApiKey: jest.fn() };
  let gateway: EventsGateway;
  let socket: Socket;
  beforeEach(() => {
    auth.validateApiKey.mockReset();
    gateway = new EventsGateway(auth as unknown as AuthService, {} as ConfigService);
    socket = { data: { rawApiKey: 'restricted-key' }, handshake: { address: '127.0.0.1' },
      join: jest.fn(), rooms: new Set(), emit: jest.fn(), disconnect: jest.fn() } as unknown as Socket;
  });
  it('denies subscription when session authorization fails', async () => {
    auth.validateApiKey.mockRejectedValue(new Error('forbidden'));
    const result = await gateway.handleMessage(socket, { type: 'subscribe', sessionId: 'other', events: ['*'] });
    expect(result.type).toBe('error');
    expect(socket.join).not.toHaveBeenCalled();
    expect(auth.validateApiKey).toHaveBeenCalledWith('restricted-key', '127.0.0.1', 'other');
  });
  it('joins authorized session rooms', async () => {
    auth.validateApiKey.mockResolvedValue({});
    const result = await gateway.handleMessage(socket, { type: 'subscribe', sessionId: 'own', events: ['*'] });
    expect(result.type).toBe('subscribed');
    expect(socket.join).toHaveBeenCalledWith('session:own:*');
  });
  it('disconnects a subscriber revoked before an event is delivered', async () => {
    socket.rooms.add('session:own:*');
    gateway.server = { sockets: new Map([['test', socket]]) } as typeof gateway.server;
    auth.validateApiKey.mockRejectedValue(new Error('revoked'));
    gateway.emitMessage('own', { body: 'private' });
    await new Promise(resolve => setImmediate(resolve));
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

});

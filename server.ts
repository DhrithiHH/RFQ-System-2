import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { auctionStore, HttpError, type PostCommitBroadcast } from './server/auctionEngine.ts';
import type { UserProfile, UserRole } from './server/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthedRequest extends Request {
  user?: UserProfile;
}

interface SocketClient {
  ws: WebSocket;
  userId: string;
  role: UserRole;
}

class LiveAuctionWsManager {
  private rooms = new Map<string, Set<SocketClient>>();

  add(rfqId: string, client: SocketClient): void {
    if (!this.rooms.has(rfqId)) this.rooms.set(rfqId, new Set());
    this.rooms.get(rfqId)!.add(client);
  }

  remove(rfqId: string, client: SocketClient): void {
    const room = this.rooms.get(rfqId);
    if (!room) return;
    room.delete(client);
    if (room.size === 0) this.rooms.delete(rfqId);
  }

  broadcast(rfqId: string, type: string, payloadBuilder: (client: SocketClient) => unknown): void {
    const room = this.rooms.get(rfqId);
    if (!room) return;
    for (const client of Array.from(room)) {
      if (client.ws.readyState === client.ws.OPEN) {
        try {
          client.ws.send(JSON.stringify({ type, rfq_id: rfqId, data: payloadBuilder(client) }));
        } catch {
          this.remove(rfqId, client);
        }
      } else {
        this.remove(rfqId, client);
      }
    }
  }

  broadcastBidCommit(ctx: PostCommitBroadcast): void {
    this.broadcast(ctx.rfqId, 'NEW_BID', (client) => ({
      bid: auctionStore.serializeBid(ctx.bid, ctx.supplierName, client.role, client.userId, ctx.aliasMap),
      server_time: ctx.serverTime,
    }));

    this.broadcast(ctx.rfqId, 'RANKING_UPDATED', (client) => ({
      rankings: auctionStore.serializeRankings(ctx.rankingsAfter, client.role, client.userId, ctx.aliasMap),
      server_time: ctx.serverTime,
    }));

    if (ctx.extension.extended) {
      this.broadcast(ctx.rfqId, 'AUCTION_EXTENDED', () => ({
        previous_close_time: ctx.extension.previous_close_time,
        bid_close_time: ctx.rfq.bid_close_time,
        forced_close_time: ctx.rfq.forced_close_time,
        reasons: ctx.extension.reasons,
        capped_at_forced_close: ctx.extension.capped_at_forced_close,
        server_time: ctx.serverTime,
      }));
    }
  }
}

const wsManager = new LiveAuctionWsManager();

function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const user = auctionStore.resolveUserByToken(token);
  if (!user) {
    next(new HttpError(401, 'Missing or invalid authentication token.'));
    return;
  }
  req.user = user;
  next();
}

function requireBuyer(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'BUYER') {
    next(new HttpError(403, 'Buyer role required for this action.'));
    return;
  }
  next();
}

function requireSupplier(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'SUPPLIER') {
    next(new HttpError(403, 'Supplier role required for this action.'));
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', server_time: new Date().toISOString() });
  });

  // Auth endpoints (mirroring FastAPI + Supabase profile endpoints + interactive demo sign-in)
  app.get('/api/auth/demo-accounts', (_req, res) => {
    res.json(auctionStore.listDemoAccounts());
  });

  app.post('/api/auth/session', (req, res, next) => {
    try {
      const { email, name, role, mode } = req.body as {
        email?: string;
        name?: string;
        role?: UserRole;
        mode?: 'login' | 'signup';
      };
      if (!email) throw new HttpError(400, 'Email is required.');

      let user = auctionStore.findUserByEmail(email);
      if (mode === 'signup') {
        user = auctionStore.registerUser(name || email.split('@')[0], email, role || 'SUPPLIER');
      } else if (!user) {
        throw new HttpError(404, 'Account not found. Choose an existing account or register a new one.');
      }

      const access_token = auctionStore.issueToken(user.id);
      res.json({ access_token, user });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json(req.user);
  });

  app.get('/api/auth/profile', requireAuth, (req: AuthedRequest, res) => {
    res.json(req.user);
  });

  app.get('/api/auth/suppliers', requireAuth, requireBuyer, (_req, res) => {
    res.json(auctionStore.listSuppliers());
  });

  // RFQ endpoints
  app.post('/api/rfqs', requireAuth, requireBuyer, (req: AuthedRequest, res, next) => {
    try {
      const created = auctionStore.createRfq(req.user!, req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rfqs', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json(auctionStore.listRfqsForUser(req.user!));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rfqs/:rfqId', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json(auctionStore.getRfqDetail(req.params.rfqId, req.user!));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/rfqs/:rfqId/suppliers', requireAuth, requireBuyer, (req: AuthedRequest, res, next) => {
    try {
      const supplierIds = Array.isArray(req.body?.supplier_ids) ? req.body.supplier_ids : [];
      res.json(auctionStore.inviteSuppliers(req.params.rfqId, req.user!, supplierIds));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rfqs/:rfqId/auction', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json(auctionStore.getAuctionState(req.params.rfqId, req.user!));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rfqs/:rfqId/activity', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json(auctionStore.listActivityForUser(req.params.rfqId, req.user!));
    } catch (err) {
      next(err);
    }
  });

  // Bid & Ranking endpoints
  app.post('/api/rfqs/:rfqId/bids', requireAuth, requireSupplier, async (req: AuthedRequest, res, next) => {
    try {
      const { response, broadcast } = await auctionStore.submitBid(req.params.rfqId, req.user!, req.body);
      // Broadcast strictly after commit
      wsManager.broadcastBidCommit(broadcast);
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rfqs/:rfqId/bids', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json(auctionStore.listBidsForUser(req.params.rfqId, req.user!));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/rfqs/:rfqId/ranking', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json(auctionStore.getRankingsForUser(req.params.rfqId, req.user!));
    } catch (err) {
      next(err);
    }
  });

  // JSON Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ detail: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ detail: message });
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const match = url.pathname.match(/^\/ws\/auctions\/([^/]+)$/);
    if (!match) {
      return;
    }

    const rfqId = decodeURIComponent(match[1]);
    const token = url.searchParams.get('token') ?? undefined;
    const user = auctionStore.resolveUserByToken(token);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      auctionStore.verifyRfqAccess(rfqId, user);
    } catch {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const client: SocketClient = { ws, userId: user.id, role: user.role };
      wsManager.add(rfqId, client);

      ws.on('message', (raw) => {
        if (String(raw) === 'ping') {
          ws.send(JSON.stringify({ type: 'PONG', server_time: new Date().toISOString() }));
        }
      });

      ws.on('close', () => {
        wsManager.remove(rfqId, client);
      });
    });
  });

  // Server-side expiry sweeper (every 3 seconds)
  setInterval(() => {
    const closures = auctionStore.sweepExpiredAuctions();
    for (const c of closures) {
      wsManager.broadcast(c.rfqId, c.eventType, () => ({
        status: c.status,
        closed_at: c.closedAt,
        server_time: c.closedAt,
      }));
    }
  }, 3000);

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`GoComet British Auction RFQ server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

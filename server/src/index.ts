import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';

import authRoutes from './app/routes/auth';
import roomRoutes from './app/routes/rooms';
import executeRoutes from './app/routes/execute';
import { setupWebSocket } from './ws';

const app = express();
const httpServer = createServer(app);
const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: { origin: clientOrigin, credentials: true },
});

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/execute', executeRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

setupWebSocket(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

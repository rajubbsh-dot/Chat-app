const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Serve static files
const server = http.createServer((req, res) => {
  let filepath = req.url === '/' ? '/index.html' : req.url;
  filepath = path.join(__dirname, 'public', filepath);
  const ext = path.extname(filepath);
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
  fs.readFile(filepath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(data);
    }
  });
});

const wss = new WebSocketServer({ server });

// Room store: { roomCode: [ws1, ws2] }
const rooms = {};

wss.on('connection', (ws) => {
  let currentRoom = null;
  let userName = 'Unknown';

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === 'join') {
        const room = data.room?.trim();
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room code is required' }));
          return;
        }

        // Leave previous room
        if (currentRoom && rooms[currentRoom]) {
          rooms[currentRoom] = rooms[currentRoom].filter(w => w !== ws);
          if (rooms[currentRoom].length === 0) delete rooms[currentRoom];
          else if (rooms[currentRoom].length === 1) {
            rooms[currentRoom][0].send(JSON.stringify({ type: 'user-left' }));
          }
        }

        // Join new room
        if (!rooms[room]) rooms[room] = [];
        if (rooms[room].length >= 2) {
          ws.send(JSON.stringify({ type: 'room-full', message: 'Room is full (max 2 people)' }));
          return;
        }

        currentRoom = room;
        rooms[room].push(ws);
        userName = rooms[room].length === 1 ? 'User 1' : 'User 2';

        ws.send(JSON.stringify({
          type: 'joined',
          room,
          userName,
          userCount: rooms[room].length,
        }));

        // Notify others in room
        rooms[room].forEach(client => {
          if (client !== ws) {
            client.send(JSON.stringify({
              type: 'user-joined',
              userName,
              userCount: rooms[room].length,
            }));
          }
        });
        return;
      }

      if (data.type === 'message' && currentRoom && rooms[currentRoom]) {
        const msg = { type: 'message', text: data.text, from: userName };
        rooms[currentRoom].forEach(client => {
          if (client !== ws) {
            client.send(JSON.stringify(msg));
          }
        });
        // Echo back to sender with own name
        ws.send(JSON.stringify({ ...msg, from: userName, self: true }));
        return;
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom] = rooms[currentRoom].filter(w => w !== ws);
      if (rooms[currentRoom].length <= 1) {
        if (rooms[currentRoom].length === 1) {
          rooms[currentRoom][0].send(JSON.stringify({ type: 'user-left' }));
        }
        if (rooms[currentRoom].length === 0) delete rooms[currentRoom];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});

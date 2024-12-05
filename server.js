const express = require('express');
const app = express();

// 解析 JSON 请求体
app.use(express.json());

// 存储等待匹配的玩家
let waitingPlayer = null;
// 存储游戏房间
const gameRooms = new Map();

// 生成唯一房间ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 15);
}

// 处理WebSocket连接
app.post('/api/websocket', (req, res) => {
  const { action } = req.body;
  if (action === 'connect') {
    const connectionId = Math.random().toString(36).substring(2, 15);
    connections.set(connectionId, {
      send: (data) => {
        // 存储待发送的消息，等待客户端轮询
        connections.get(connectionId).messages.push(data);
      },
      messages: [],
      id: connectionId
    });
    res.json({ connectionId });
  }
});

// 处理开始匹配请求
function handleStartMatch(ws) {
  if (waitingPlayer === null) {
    // 如果没有等待的玩家，将当前玩家加入等待队列
    waitingPlayer = ws;
    ws.isWaiting = true;
  } else if (waitingPlayer !== ws) {
    // 如果有等待的玩家，创建新房间
    const roomId = generateRoomId();
    const seed = Date.now(); // 使用时间戳作为随机种子

    // 创建房间
    gameRooms.set(roomId, {
      player1: waitingPlayer,
      player2: ws,
      seed: seed,
      gameState: {
        player1: { score: 0, remaining: 64, completed: false },
        player2: { score: 0, remaining: 64, completed: false }
      }
    });

    // 发送匹配成功消息给双方
    waitingPlayer.send(JSON.stringify({
      type: 'matched',
      opponentName: `Player ${ws.id}`,
      seed: seed,
      isFirstPlayer: true
    }));

    ws.send(JSON.stringify({
      type: 'matched',
      opponentName: `Player ${waitingPlayer.id}`,
      seed: seed,
      isFirstPlayer: false
    }));

    // 保存房间ID
    waitingPlayer.roomId = roomId;
    ws.roomId = roomId;

    // 清空等待玩家
    waitingPlayer = null;
  }
}

// 处理取消匹配请求
function handleCancelMatch(ws) {
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    ws.isWaiting = false;
  }
}

// 处理游戏更新
function handleGameUpdate(ws, data) {
  const room = gameRooms.get(ws.roomId);
  if (!room) return;

  const isPlayer1 = room.player1 === ws;
  const opponent = isPlayer1 ? room.player2 : room.player1;
  
  // 更新游戏状态
  const playerState = isPlayer1 ? room.gameState.player1 : room.gameState.player2;
  playerState.score = data.score;
  playerState.remaining = data.remaining;

  // 发送更新给对手
  opponent.send(JSON.stringify({
    type: 'opponentUpdate',
    score: data.score,
    remaining: data.remaining
  }));
}

// 处理游戏完成
function handleGameComplete(ws, data) {
  const room = gameRooms.get(ws.roomId);
  if (!room) return;

  const isPlayer1 = room.player1 === ws;
  const opponent = isPlayer1 ? room.player2 : room.player1;
  
  // 标记该玩家完成游戏
  const playerState = isPlayer1 ? room.gameState.player1 : room.gameState.player2;
  playerState.completed = true;
  playerState.score = data.score;
  playerState.time = data.time;

  // 发送游戏结束消息给双方
  const gameOverMessage = {
    type: 'gameOver',
    winner: 'you',
    myScore: data.score,
    myTime: data.time,
    opponentScore: isPlayer1 ? room.gameState.player2.score : room.gameState.player1.score,
    opponentTime: null
  };

  const opponentMessage = {
    type: 'gameOver',
    winner: 'opponent',
    myScore: isPlayer1 ? room.gameState.player2.score : room.gameState.player1.score,
    myTime: null,
    opponentScore: data.score,
    opponentTime: data.time
  };

  ws.send(JSON.stringify(gameOverMessage));
  opponent.send(JSON.stringify(opponentMessage));

  // 清理房间
  gameRooms.delete(ws.roomId);
}

// 处理玩家断开连接
function handlePlayerDisconnect(ws) {
  // 如果是等待中的玩家断开连接
  if (waitingPlayer === ws) {
    waitingPlayer = null;
    return;
  }

  // 如果是游戏中的玩家断开连接
  const room = gameRooms.get(ws.roomId);
  if (room) {
    const opponent = room.player1 === ws ? room.player2 : room.player1;
    
    // 通知对手
    opponent.send(JSON.stringify({
      type: 'gameOver',
      winner: 'you',
      reason: 'opponent_disconnected'
    }));

    // 清理房间
    gameRooms.delete(ws.roomId);
  }
}

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
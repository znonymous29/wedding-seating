import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userNickname?: string;
}

export const setupSocketIO = (io: Server) => {
  // 认证中间件
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('未授权'));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret'
      ) as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, nickname: true },
      });

      if (!user) {
        return next(new Error('用户不存在'));
      }

      socket.userId = user.id;
      socket.userNickname = user.nickname;
      next();
    } catch (error) {
      next(new Error('认证失败'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`用户连接: ${socket.userNickname} (${socket.userId})`);

    // 加入项目房间
    socket.on('join:project', async (projectId: string) => {
      try {
        // 验证用户是否是项目成员
        const member = await prisma.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId,
              userId: socket.userId!,
            },
          },
        });

        if (!member) {
          socket.emit('error', { message: '您不是该项目的成员' });
          return;
        }

        // 加入房间
        socket.join(`project:${projectId}`);
        
        // 获取当前房间内所有在线成员
        const roomName = `project:${projectId}`;
        const socketsInRoom = await io.in(roomName).fetchSockets();
        
        const onlineMembers: Array<{ userId: string; nickname: string }> = [];
        for (const s of socketsInRoom) {
          const authenticatedSocket = s as unknown as AuthenticatedSocket;
          if (authenticatedSocket.userId && authenticatedSocket.userNickname) {
            // 避免重复（同一用户可能有多个连接）
            if (!onlineMembers.some(m => m.userId === authenticatedSocket.userId)) {
              onlineMembers.push({
                userId: authenticatedSocket.userId,
                nickname: authenticatedSocket.userNickname,
              });
            }
          }
        }
        
        // 发送当前在线成员列表给新加入的用户
        socket.emit('members:list', onlineMembers);
        
        // 通知其他成员有人上线
        socket.to(roomName).emit('member:online', {
          userId: socket.userId,
          nickname: socket.userNickname,
        });

        console.log(`${socket.userNickname} 加入项目: ${projectId}, 当前在线: ${onlineMembers.length} 人`);
      } catch (error) {
        console.error('加入项目失败:', error);
        socket.emit('error', { message: '加入项目失败' });
      }
    });

    // 离开项目房间
    socket.on('leave:project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
      
      // 通知其他成员有人离线
      socket.to(`project:${projectId}`).emit('member:offline', {
        userId: socket.userId,
        nickname: socket.userNickname,
      });

      console.log(`${socket.userNickname} 离开项目: ${projectId}`);
    });

    // 开始编辑某个资源（锁定）
    socket.on('editing:start', (data: { projectId: string; type: string; id: string }) => {
      socket.to(`project:${data.projectId}`).emit('editing:locked', {
        type: data.type,
        id: data.id,
        userId: socket.userId,
        userNickname: socket.userNickname,
      });
    });

    // 结束编辑某个资源（解锁）
    socket.on('editing:end', (data: { projectId: string; type: string; id: string }) => {
      socket.to(`project:${data.projectId}`).emit('editing:unlocked', {
        type: data.type,
        id: data.id,
      });
    });

    // 光标位置同步（用于实时协作）
    socket.on('cursor:move', (data: { projectId: string; x: number; y: number }) => {
      socket.to(`project:${data.projectId}`).emit('cursor:update', {
        userId: socket.userId,
        nickname: socket.userNickname,
        x: data.x,
        y: data.y,
      });
    });

    // 断开连接时通知所有相关项目
    socket.on('disconnect', async () => {
      console.log(`用户断开: ${socket.userNickname} (${socket.userId})`);
      
      // 获取该用户加入的所有房间并广播离线消息
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        if (room.startsWith('project:')) {
          socket.to(room).emit('member:offline', {
            userId: socket.userId,
            nickname: socket.userNickname,
          });
        }
      }
    });
  });
};

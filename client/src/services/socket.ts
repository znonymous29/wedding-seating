import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

let socket: Socket | null = null
let pendingProjectId: string | null = null

export const getSocket = (): Socket | null => socket

export const connectSocket = (): Socket => {
  if (socket?.connected) {
    return socket
  }

  const { accessToken } = useAuthStore.getState()

  socket = io(SOCKET_URL, {
    auth: {
      token: accessToken,
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id)
    // 连接成功后，如果有待加入的项目，立即加入
    if (pendingProjectId && socket) {
      socket.emit('join:project', pendingProjectId)
      console.log('Joined project after connect:', pendingProjectId)
    }
  })

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason)
  })

  socket.on('error', (error) => {
    console.error('Socket error:', error)
  })

  return socket
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  pendingProjectId = null
}

export const joinProject = (projectId: string) => {
  pendingProjectId = projectId
  if (socket?.connected) {
    socket.emit('join:project', projectId)
    console.log('Joined project immediately:', projectId)
  } else {
    console.log('Socket not connected yet, will join project on connect:', projectId)
  }
}

export const leaveProject = (projectId: string) => {
  if (socket?.connected) {
    socket.emit('leave:project', projectId)
  }
  if (pendingProjectId === projectId) {
    pendingProjectId = null
  }
}

export const startEditing = (projectId: string, type: string, id: string) => {
  if (socket?.connected) {
    socket.emit('editing:start', { projectId, type, id })
  }
}

export const endEditing = (projectId: string, type: string, id: string) => {
  if (socket?.connected) {
    socket.emit('editing:end', { projectId, type, id })
  }
}

export const moveCursor = (projectId: string, x: number, y: number) => {
  if (socket?.connected) {
    socket.emit('cursor:move', { projectId, x, y })
  }
}

// Socket 事件监听器类型
export interface SocketEventHandlers {
  onMembersList?: (members: Array<{ userId: string; nickname: string }>) => void
  onMemberOnline?: (data: { userId: string; nickname: string }) => void
  onMemberOffline?: (data: { userId: string; nickname: string }) => void
  onGuestCreated?: (guest: any) => void
  onGuestUpdated?: (guest: any) => void
  onGuestDeleted?: (data: { id: string }) => void
  onGuestsImported?: (data: { count: number }) => void
  onGuestsDeleted?: (data: { ids: string[] }) => void
  onTableCreated?: (table: any) => void
  onTableUpdated?: (table: any) => void
  onTableDeleted?: (data: { id: string }) => void
  onTablesCreated?: (data: { count: number }) => void
  onTablePositionsUpdated?: (positions: any[]) => void
  onSeatingAssigned?: (data: { assignment: any; tableId: string; guestId: string }) => void
  onSeatingUnassigned?: (data: { guestId: string; tableId: string }) => void
  onSeatingMoved?: (data: { guestId: string; oldTableId: string; newTableId: string }) => void
  onSeatingAutoAssigned?: (results: any) => void
  onEditingLocked?: (data: { type: string; id: string; userId: string; userNickname: string }) => void
  onEditingUnlocked?: (data: { type: string; id: string }) => void
  onCursorUpdate?: (data: { userId: string; nickname: string; x: number; y: number }) => void
}

export const setupSocketListeners = (handlers: SocketEventHandlers) => {
  if (!socket) return

  // 成员列表和上下线
  if (handlers.onMembersList) socket.on('members:list', handlers.onMembersList)
  if (handlers.onMemberOnline) socket.on('member:online', handlers.onMemberOnline)
  if (handlers.onMemberOffline) socket.on('member:offline', handlers.onMemberOffline)

  // 宾客事件
  if (handlers.onGuestCreated) socket.on('guest:created', handlers.onGuestCreated)
  if (handlers.onGuestUpdated) socket.on('guest:updated', handlers.onGuestUpdated)
  if (handlers.onGuestDeleted) socket.on('guest:deleted', handlers.onGuestDeleted)
  if (handlers.onGuestsImported) socket.on('guests:imported', handlers.onGuestsImported)
  if (handlers.onGuestsDeleted) socket.on('guests:deleted', handlers.onGuestsDeleted)

  // 桌位事件
  if (handlers.onTableCreated) socket.on('table:created', handlers.onTableCreated)
  if (handlers.onTableUpdated) socket.on('table:updated', handlers.onTableUpdated)
  if (handlers.onTableDeleted) socket.on('table:deleted', handlers.onTableDeleted)
  if (handlers.onTablesCreated) socket.on('tables:created', handlers.onTablesCreated)
  if (handlers.onTablePositionsUpdated) socket.on('tables:positions-updated', handlers.onTablePositionsUpdated)

  // 座位安排事件
  if (handlers.onSeatingAssigned) socket.on('seating:assigned', handlers.onSeatingAssigned)
  if (handlers.onSeatingUnassigned) socket.on('seating:unassigned', handlers.onSeatingUnassigned)
  if (handlers.onSeatingMoved) socket.on('seating:moved', handlers.onSeatingMoved)
  if (handlers.onSeatingAutoAssigned) socket.on('seating:auto-assigned', handlers.onSeatingAutoAssigned)

  // 编辑锁定事件
  if (handlers.onEditingLocked) socket.on('editing:locked', handlers.onEditingLocked)
  if (handlers.onEditingUnlocked) socket.on('editing:unlocked', handlers.onEditingUnlocked)

  // 光标同步
  if (handlers.onCursorUpdate) socket.on('cursor:update', handlers.onCursorUpdate)
}

export const removeSocketListeners = () => {
  if (!socket) return

  socket.off('members:list')
  socket.off('member:online')
  socket.off('member:offline')
  socket.off('guest:created')
  socket.off('guest:updated')
  socket.off('guest:deleted')
  socket.off('guests:imported')
  socket.off('guests:deleted')
  socket.off('table:created')
  socket.off('table:updated')
  socket.off('table:deleted')
  socket.off('tables:created')
  socket.off('tables:positions-updated')
  socket.off('seating:assigned')
  socket.off('seating:unassigned')
  socket.off('seating:moved')
  socket.off('seating:auto-assigned')
  socket.off('editing:locked')
  socket.off('editing:unlocked')
  socket.off('cursor:update')
}

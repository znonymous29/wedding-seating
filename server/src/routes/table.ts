import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, AuthRequest, isProjectMember, isProjectAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 获取项目的所有桌位
router.get(
  '/project/:projectId',
  authenticate,
  isProjectMember,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;

    const tables = await prisma.table.findMany({
      where: { projectId },
      include: {
        area: {
          select: { id: true, name: true, color: true },
        },
        assignments: {
          include: {
            guest: {
              select: { id: true, name: true, headCount: true, tags: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 计算每桌的已用座位数
    const tablesWithStats = tables.map(table => {
      const occupiedSeats = table.assignments.reduce(
        (sum, a) => sum + a.guest.headCount,
        0
      );
      return {
        ...table,
        occupiedSeats,
        availableSeats: table.capacity - occupiedSeats,
      };
    });

    res.json({
      success: true,
      data: tablesWithStats,
    });
  })
);

// 获取单个桌位详情
router.get(
  '/:tableId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { tableId } = req.params;

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        area: true,
        assignments: {
          include: {
            guest: {
              select: {
                id: true,
                name: true,
                headCount: true,
                tags: true,
                phone: true,
                relationship: true,
              },
            },
            assignedBy: {
              select: { id: true, nickname: true },
            },
          },
        },
      },
    });

    if (!table) {
      throw new AppError('桌位不存在', 404);
    }

    const occupiedSeats = table.assignments.reduce(
      (sum, a) => sum + a.guest.headCount,
      0
    );

    res.json({
      success: true,
      data: {
        ...table,
        occupiedSeats,
        availableSeats: table.capacity - occupiedSeats,
      },
    });
  })
);

// 创建桌位
router.post(
  '/',
  authenticate,
  [
    body('projectId').notEmpty().withMessage('请选择项目'),
    body('name').notEmpty().withMessage('请输入桌位名称'),
  ],
  asyncHandler(async (req: AuthRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array()[0].msg, 400);
    }

    const { projectId, name, capacity, positionX, positionY, tableType, tags, notes, areaId } = req.body;
    const userId = req.user!.id;

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有创建桌位的权限', 403);
    }

    // 获取项目默认座位数
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { defaultSeatsPerTable: true },
    });

    const table = await prisma.table.create({
      data: {
        projectId,
        name,
        capacity: capacity || project?.defaultSeatsPerTable || 10,
        positionX: positionX || 0,
        positionY: positionY || 0,
        tableType: tableType || 'ROUND',
        tags: tags || [],
        notes,
        areaId,
      },
      include: {
        area: true,
      },
    });

    // 记录活动日志
    await prisma.activityLog.create({
      data: {
        projectId,
        userId,
        action: 'CREATE_TABLE',
        targetType: 'table',
        targetId: table.id,
        details: { tableName: name },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${projectId}`).emit('table:created', table);

    res.status(201).json({
      success: true,
      message: '桌位创建成功',
      data: table,
    });
  })
);

// 批量创建桌位
router.post(
  '/batch',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId, count, namePrefix, capacity, areaId, startNumber = 1 } = req.body;
    const userId = req.user!.id;

    if (!count || count < 1 || count > 100) {
      throw new AppError('请输入有效的桌位数量（1-100）', 400);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有创建桌位的权限', 403);
    }

    // 获取项目默认座位数
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { defaultSeatsPerTable: true },
    });

    const tables = [];
    for (let i = 0; i < count; i++) {
      const tableNumber = startNumber + i;
      tables.push({
        projectId,
        name: namePrefix ? `${namePrefix}${tableNumber}` : `第${tableNumber}桌`,
        capacity: capacity || project?.defaultSeatsPerTable || 10,
        positionX: (i % 5) * 150,
        positionY: Math.floor(i / 5) * 150,
        areaId,
      });
    }

    await prisma.table.createMany({
      data: tables,
    });

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${projectId}`).emit('tables:created', { count });

    res.status(201).json({
      success: true,
      message: `成功创建 ${count} 个桌位`,
    });
  })
);

// 更新桌位
router.put(
  '/:tableId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { tableId } = req.params;
    const { name, capacity, positionX, positionY, tableType, tags, notes, areaId } = req.body;
    const userId = req.user!.id;

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        assignments: {
          include: {
            guest: { select: { headCount: true } },
          },
        },
      },
    });

    if (!table) {
      throw new AppError('桌位不存在', 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: table.projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有编辑权限', 403);
    }

    // 如果修改容量，检查是否会超员
    if (capacity !== undefined) {
      const currentOccupied = table.assignments.reduce(
        (sum, a) => sum + a.guest.headCount,
        0
      );
      if (capacity < currentOccupied) {
        throw new AppError(`该桌已有 ${currentOccupied} 人，容量不能少于此数`, 400);
      }
    }

    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data: {
        ...(name && { name }),
        ...(capacity !== undefined && { capacity }),
        ...(positionX !== undefined && { positionX }),
        ...(positionY !== undefined && { positionY }),
        ...(tableType && { tableType }),
        ...(tags !== undefined && { tags }),
        ...(notes !== undefined && { notes }),
        ...(areaId !== undefined && { areaId }),
      },
      include: {
        area: true,
        assignments: {
          include: {
            guest: {
              select: { id: true, name: true, headCount: true, tags: true },
            },
          },
        },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${table.projectId}`).emit('table:updated', updatedTable);

    res.json({
      success: true,
      message: '桌位信息已更新',
      data: updatedTable,
    });
  })
);

// 批量更新桌位位置
router.put(
  '/positions/batch',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId, positions } = req.body;
    const userId = req.user!.id;

    if (!positions || !Array.isArray(positions)) {
      throw new AppError('请提供位置信息', 400);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有编辑权限', 403);
    }

    // 批量更新位置
    await prisma.$transaction(
      positions.map((pos: { id: string; positionX: number; positionY: number }) =>
        prisma.table.update({
          where: { id: pos.id },
          data: {
            positionX: pos.positionX,
            positionY: pos.positionY,
          },
        })
      )
    );

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${projectId}`).emit('tables:positions-updated', positions);

    res.json({
      success: true,
      message: '桌位位置已更新',
    });
  })
);

// 删除桌位
router.delete(
  '/:tableId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { tableId } = req.params;
    const userId = req.user!.id;

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        _count: { select: { assignments: true } },
      },
    });

    if (!table) {
      throw new AppError('桌位不存在', 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: table.projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有删除权限', 403);
    }

    // 检查是否有宾客
    if (table._count.assignments > 0) {
      throw new AppError('该桌位已有宾客，请先移除宾客后再删除', 400);
    }

    await prisma.table.delete({
      where: { id: tableId },
    });

    // 记录活动日志
    await prisma.activityLog.create({
      data: {
        projectId: table.projectId,
        userId,
        action: 'DELETE_TABLE',
        targetType: 'table',
        targetId: tableId,
        details: { tableName: table.name },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${table.projectId}`).emit('table:deleted', { id: tableId });

    res.json({
      success: true,
      message: '桌位已删除',
    });
  })
);

export default router;


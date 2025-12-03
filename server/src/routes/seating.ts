import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, AuthRequest, isProjectMember, isProjectAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 安排座位（将宾客分配到桌位）
router.post(
  '/assign',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { guestId, tableId } = req.body;
    const userId = req.user!.id;

    if (!guestId || !tableId) {
      throw new AppError('请选择宾客和桌位', 400);
    }

    // 获取宾客信息
    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: { assignment: true },
    });

    if (!guest) {
      throw new AppError('宾客不存在', 404);
    }

    // 检查宾客是否已有座位
    if (guest.assignment) {
      throw new AppError('该宾客已有座位安排，请先移除原座位', 400);
    }

    // 获取桌位信息
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
        projectId_userId: { projectId: guest.projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有安排座位的权限', 403);
    }

    // 检查座位是否足够
    const currentOccupied = table.assignments.reduce(
      (sum, a) => sum + a.guest.headCount,
      0
    );
    if (currentOccupied + guest.headCount > table.capacity) {
      throw new AppError(
        `该桌剩余 ${table.capacity - currentOccupied} 个座位，无法容纳 ${guest.headCount} 人`,
        400
      );
    }

    // 检查排座约束
    const constraints = await prisma.seatingConstraint.findMany({
      where: {
        OR: [
          { guest1Id: guestId },
          { guest2Id: guestId },
        ],
      },
      include: {
        guest1: { select: { id: true, name: true } },
        guest2: { select: { id: true, name: true } },
      },
    });

    // 获取该桌已有宾客的ID
    const tableGuestIds = table.assignments.map(a => a.guest).map((g: any) => g.id);

    for (const constraint of constraints) {
      const otherGuestId = constraint.guest1Id === guestId 
        ? constraint.guest2Id 
        : constraint.guest1Id;
      const otherGuestName = constraint.guest1Id === guestId
        ? constraint.guest2.name
        : constraint.guest1.name;

      if (constraint.constraintType === 'MUST_APART') {
        // 不能同桌的人已在该桌
        if (tableGuestIds.includes(otherGuestId)) {
          throw new AppError(
            `"${guest.name}" 与 "${otherGuestName}" 设置了不能同桌`,
            400
          );
        }
      }
    }

    // 创建座位安排
    const assignment = await prisma.seatingAssignment.create({
      data: {
        tableId,
        guestId,
        assignedById: userId,
      },
      include: {
        guest: {
          select: { id: true, name: true, headCount: true, tags: true },
        },
        table: {
          select: { id: true, name: true },
        },
      },
    });

    // 记录活动日志
    await prisma.activityLog.create({
      data: {
        projectId: guest.projectId,
        userId,
        action: 'ASSIGN_SEAT',
        targetType: 'seating',
        targetId: assignment.id,
        details: {
          guestName: guest.name,
          tableName: table.name,
        },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${guest.projectId}`).emit('seating:assigned', {
      assignment,
      tableId,
      guestId,
    });

    res.status(201).json({
      success: true,
      message: `已将 "${guest.name}" 安排到 "${table.name}"`,
      data: assignment,
    });
  })
);

// 移除座位安排
router.delete(
  '/unassign/:guestId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { guestId } = req.params;
    const userId = req.user!.id;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: {
        assignment: {
          include: {
            table: { select: { name: true } },
          },
        },
      },
    });

    if (!guest) {
      throw new AppError('宾客不存在', 404);
    }

    if (!guest.assignment) {
      throw new AppError('该宾客尚未安排座位', 400);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: guest.projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有操作权限', 403);
    }

    const tableId = guest.assignment.tableId;
    const tableName = guest.assignment.table.name;

    await prisma.seatingAssignment.delete({
      where: { guestId },
    });

    // 记录活动日志
    await prisma.activityLog.create({
      data: {
        projectId: guest.projectId,
        userId,
        action: 'UNASSIGN_SEAT',
        targetType: 'seating',
        details: {
          guestName: guest.name,
          tableName,
        },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${guest.projectId}`).emit('seating:unassigned', {
      guestId,
      tableId,
    });

    res.json({
      success: true,
      message: `已将 "${guest.name}" 从 "${tableName}" 移除`,
    });
  })
);

// 移动宾客到另一桌
router.put(
  '/move',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { guestId, newTableId } = req.body;
    const userId = req.user!.id;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: {
        assignment: {
          include: { table: true },
        },
      },
    });

    if (!guest) {
      throw new AppError('宾客不存在', 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: guest.projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有操作权限', 403);
    }

    // 获取新桌位信息
    const newTable = await prisma.table.findUnique({
      where: { id: newTableId },
      include: {
        assignments: {
          include: {
            guest: { select: { id: true, headCount: true } },
          },
        },
      },
    });

    if (!newTable) {
      throw new AppError('目标桌位不存在', 404);
    }

    // 检查座位是否足够
    const currentOccupied = newTable.assignments.reduce(
      (sum, a) => sum + a.guest.headCount,
      0
    );
    if (currentOccupied + guest.headCount > newTable.capacity) {
      throw new AppError(
        `目标桌剩余 ${newTable.capacity - currentOccupied} 个座位，无法容纳 ${guest.headCount} 人`,
        400
      );
    }

    // 检查排座约束
    const constraints = await prisma.seatingConstraint.findMany({
      where: {
        OR: [
          { guest1Id: guestId },
          { guest2Id: guestId },
        ],
        constraintType: 'MUST_APART',
      },
    });

    const tableGuestIds = newTable.assignments.map(a => a.guest.id);

    for (const constraint of constraints) {
      const otherGuestId = constraint.guest1Id === guestId 
        ? constraint.guest2Id 
        : constraint.guest1Id;

      if (tableGuestIds.includes(otherGuestId)) {
        const otherGuest = await prisma.guest.findUnique({
          where: { id: otherGuestId },
          select: { name: true },
        });
        throw new AppError(
          `"${guest.name}" 与 "${otherGuest?.name}" 设置了不能同桌`,
          400
        );
      }
    }

    const oldTableId = guest.assignment?.tableId;
    const oldTableName = guest.assignment?.table.name;

    // 更新或创建座位安排
    if (guest.assignment) {
      await prisma.seatingAssignment.update({
        where: { guestId },
        data: {
          tableId: newTableId,
          assignedById: userId,
        },
      });
    } else {
      await prisma.seatingAssignment.create({
        data: {
          tableId: newTableId,
          guestId,
          assignedById: userId,
        },
      });
    }

    // 记录活动日志
    await prisma.activityLog.create({
      data: {
        projectId: guest.projectId,
        userId,
        action: 'MOVE_SEAT',
        targetType: 'seating',
        details: {
          guestName: guest.name,
          fromTable: oldTableName || '未安排',
          toTable: newTable.name,
        },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${guest.projectId}`).emit('seating:moved', {
      guestId,
      oldTableId,
      newTableId,
    });

    res.json({
      success: true,
      message: `已将 "${guest.name}" 移动到 "${newTable.name}"`,
    });
  })
);

// 添加排座约束
router.post(
  '/constraint',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId, guest1Id, guest2Id, constraintType } = req.body;
    const userId = req.user!.id;

    if (!guest1Id || !guest2Id || !constraintType) {
      throw new AppError('请提供完整的约束信息', 400);
    }

    if (guest1Id === guest2Id) {
      throw new AppError('不能为同一位宾客设置约束', 400);
    }

    if (!['MUST_TOGETHER', 'MUST_APART'].includes(constraintType)) {
      throw new AppError('无效的约束类型', 400);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有操作权限', 403);
    }

    // 检查是否已存在约束
    const existingConstraint = await prisma.seatingConstraint.findFirst({
      where: {
        OR: [
          { guest1Id, guest2Id },
          { guest1Id: guest2Id, guest2Id: guest1Id },
        ],
      },
    });

    if (existingConstraint) {
      throw new AppError('这两位宾客已存在约束关系', 400);
    }

    const constraint = await prisma.seatingConstraint.create({
      data: {
        projectId,
        guest1Id,
        guest2Id,
        constraintType,
        createdById: userId,
      },
      include: {
        guest1: { select: { id: true, name: true } },
        guest2: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: '约束添加成功',
      data: constraint,
    });
  })
);

// 删除排座约束
router.delete(
  '/constraint/:constraintId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { constraintId } = req.params;
    const userId = req.user!.id;

    const constraint = await prisma.seatingConstraint.findUnique({
      where: { id: constraintId },
    });

    if (!constraint) {
      throw new AppError('约束不存在', 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: constraint.projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有操作权限', 403);
    }

    await prisma.seatingConstraint.delete({
      where: { id: constraintId },
    });

    res.json({
      success: true,
      message: '约束已删除',
    });
  })
);

// 智能排座建议
router.post(
  '/suggest',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId, guestId } = req.body;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: {
        constraints1: true,
        constraints2: true,
      },
    });

    if (!guest) {
      throw new AppError('宾客不存在', 404);
    }

    // 获取所有可用桌位
    const tables = await prisma.table.findMany({
      where: { projectId },
      include: {
        assignments: {
          include: {
            guest: {
              select: { id: true, headCount: true, tags: true, areaId: true },
            },
          },
        },
      },
    });

    const suggestions = [];

    for (const table of tables) {
      const occupiedSeats = table.assignments.reduce(
        (sum, a) => sum + a.guest.headCount,
        0
      );
      const availableSeats = table.capacity - occupiedSeats;

      // 跳过座位不足的桌
      if (availableSeats < guest.headCount) continue;

      // 检查约束
      const tableGuestIds = table.assignments.map(a => a.guest.id);
      let hasConflict = false;
      let mustTogetherMatch = 0;

      const allConstraints = [...guest.constraints1, ...guest.constraints2];

      for (const constraint of allConstraints) {
        const otherGuestId = constraint.guest1Id === guestId
          ? constraint.guest2Id
          : constraint.guest1Id;

        if (constraint.constraintType === 'MUST_APART' && tableGuestIds.includes(otherGuestId)) {
          hasConflict = true;
          break;
        }

        if (constraint.constraintType === 'MUST_TOGETHER' && tableGuestIds.includes(otherGuestId)) {
          mustTogetherMatch++;
        }
      }

      if (hasConflict) continue;

      // 计算推荐分数
      let score = 0;

      // 同标签加分
      const tableGuestTags = table.assignments.flatMap(a => a.guest.tags);
      const matchingTags = guest.tags.filter(t => tableGuestTags.includes(t));
      score += matchingTags.length * 10;

      // 同区域加分
      const sameAreaGuests = table.assignments.filter(
        a => a.guest.areaId === guest.areaId
      );
      score += sameAreaGuests.length * 5;

      // 必须同桌的人在该桌加分
      score += mustTogetherMatch * 20;

      // 桌子快满减分（留出余地）
      if (availableSeats <= 2) score -= 5;

      suggestions.push({
        table: {
          id: table.id,
          name: table.name,
          capacity: table.capacity,
          occupiedSeats,
          availableSeats,
        },
        score,
        reasons: [
          matchingTags.length > 0 && `有${matchingTags.length}位相同标签的宾客`,
          sameAreaGuests.length > 0 && `有${sameAreaGuests.length}位同区域的宾客`,
          mustTogetherMatch > 0 && `有${mustTogetherMatch}位必须同桌的宾客`,
        ].filter(Boolean),
      });
    }

    // 按分数排序
    suggestions.sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      data: suggestions.slice(0, 5), // 返回前5个推荐
    });
  })
);

// 一键自动排座
router.post(
  '/auto-assign',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.body;
    const userId = req.user!.id;

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role === 'VIEWER') {
      throw new AppError('您没有操作权限', 403);
    }

    // 获取未安排的宾客
    const unassignedGuests = await prisma.guest.findMany({
      where: {
        projectId,
        assignment: null,
      },
      include: {
        constraints1: true,
        constraints2: true,
      },
      orderBy: { headCount: 'desc' }, // 人多的先安排
    });

    // 获取所有桌位
    const tables = await prisma.table.findMany({
      where: { projectId },
      include: {
        assignments: {
          include: {
            guest: { select: { id: true, headCount: true, tags: true } },
          },
        },
      },
    });

    const results = {
      assigned: 0,
      failed: 0,
      details: [] as { guestName: string; tableName?: string; error?: string }[],
    };

    for (const guest of unassignedGuests) {
      // 查找合适的桌位
      let bestTable = null;
      let bestScore = -1;

      for (const table of tables) {
        const occupiedSeats = table.assignments.reduce(
          (sum, a) => sum + a.guest.headCount,
          0
        );
        const availableSeats = table.capacity - occupiedSeats;

        if (availableSeats < guest.headCount) continue;

        // 检查约束
        const tableGuestIds = table.assignments.map(a => a.guest.id);
        let hasConflict = false;

        const allConstraints = [...guest.constraints1, ...guest.constraints2];

        for (const constraint of allConstraints) {
          const otherGuestId = constraint.guest1Id === guest.id
            ? constraint.guest2Id
            : constraint.guest1Id;

          if (constraint.constraintType === 'MUST_APART' && tableGuestIds.includes(otherGuestId)) {
            hasConflict = true;
            break;
          }
        }

        if (hasConflict) continue;

        // 计算分数
        let score = 0;
        const tableGuestTags = table.assignments.flatMap(a => a.guest.tags);
        const matchingTags = guest.tags.filter(t => tableGuestTags.includes(t));
        score += matchingTags.length * 10;

        if (score > bestScore) {
          bestScore = score;
          bestTable = table;
        }
      }

      if (bestTable) {
        await prisma.seatingAssignment.create({
          data: {
            tableId: bestTable.id,
            guestId: guest.id,
            assignedById: userId,
          },
        });

        // 更新内存中的桌位数据
        bestTable.assignments.push({
          guest: {
            id: guest.id,
            headCount: guest.headCount,
            tags: guest.tags,
          },
        } as any);

        results.assigned++;
        results.details.push({
          guestName: guest.name,
          tableName: bestTable.name,
        });
      } else {
        results.failed++;
        results.details.push({
          guestName: guest.name,
          error: '没有合适的桌位',
        });
      }
    }

    // 发送 Socket 事件
    const io = req.app.get('io');
    io.to(`project:${projectId}`).emit('seating:auto-assigned', results);

    res.json({
      success: true,
      message: `自动排座完成：成功 ${results.assigned} 人，失败 ${results.failed} 人`,
      data: results,
    });
  })
);

export default router;


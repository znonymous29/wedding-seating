import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, AuthRequest, isProjectMember, isProjectOwner } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 获取项目的所有区域
router.get(
  '/project/:projectId',
  authenticate,
  isProjectMember,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;

    const areas = await prisma.area.findMany({
      where: { projectId },
      include: {
        manager: {
          select: { id: true, nickname: true, avatar: true },
        },
        _count: {
          select: {
            guests: true,
            tables: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 计算每个区域的统计数据
    const areasWithStats = await Promise.all(
      areas.map(async (area) => {
        const [totalHeadCount, assignedHeadCount] = await Promise.all([
          prisma.guest.aggregate({
            where: { areaId: area.id },
            _sum: { headCount: true },
          }),
          prisma.guest.aggregate({
            where: {
              areaId: area.id,
              assignment: { isNot: null },
            },
            _sum: { headCount: true },
          }),
        ]);

        return {
          ...area,
          stats: {
            guestCount: area._count.guests,
            tableCount: area._count.tables,
            totalHeadCount: totalHeadCount._sum.headCount || 0,
            assignedHeadCount: assignedHeadCount._sum.headCount || 0,
          },
        };
      })
    );

    res.json({
      success: true,
      data: areasWithStats,
    });
  })
);

// 创建区域
router.post(
  '/',
  authenticate,
  [
    body('projectId').notEmpty().withMessage('请选择项目'),
    body('name').notEmpty().withMessage('请输入区域名称'),
  ],
  asyncHandler(async (req: AuthRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array()[0].msg, 400);
    }

    const { projectId, name, color, managerId } = req.body;
    const userId = req.user!.id;

    // 验证用户是项目所有者
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role !== 'OWNER') {
      throw new AppError('仅项目所有者可创建区域', 403);
    }

    const area = await prisma.area.create({
      data: {
        projectId,
        name,
        color: color || '#B76E79',
        managerId,
      },
      include: {
        manager: {
          select: { id: true, nickname: true, avatar: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: '区域创建成功',
      data: area,
    });
  })
);

// 更新区域
router.put(
  '/:areaId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { areaId } = req.params;
    const { name, color, managerId } = req.body;
    const userId = req.user!.id;

    const area = await prisma.area.findUnique({
      where: { id: areaId },
    });

    if (!area) {
      throw new AppError('区域不存在', 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: area.projectId, userId },
      },
    });

    if (!member || member.role !== 'OWNER') {
      throw new AppError('仅项目所有者可编辑区域', 403);
    }

    const updatedArea = await prisma.area.update({
      where: { id: areaId },
      data: {
        ...(name && { name }),
        ...(color && { color }),
        ...(managerId !== undefined && { managerId }),
      },
      include: {
        manager: {
          select: { id: true, nickname: true, avatar: true },
        },
      },
    });

    res.json({
      success: true,
      message: '区域更新成功',
      data: updatedArea,
    });
  })
);

// 删除区域
router.delete(
  '/:areaId',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { areaId } = req.params;
    const userId = req.user!.id;

    const area = await prisma.area.findUnique({
      where: { id: areaId },
      include: {
        _count: {
          select: { guests: true, tables: true },
        },
      },
    });

    if (!area) {
      throw new AppError('区域不存在', 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: area.projectId, userId },
      },
    });

    if (!member || member.role !== 'OWNER') {
      throw new AppError('仅项目所有者可删除区域', 403);
    }

    // 检查是否有宾客或桌位
    if (area._count.guests > 0 || area._count.tables > 0) {
      throw new AppError('该区域下还有宾客或桌位，请先转移或删除后再删除区域', 400);
    }

    await prisma.area.delete({
      where: { id: areaId },
    });

    res.json({
      success: true,
      message: '区域已删除',
    });
  })
);

export default router;


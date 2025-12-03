import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { authenticate, AuthRequest, isProjectMember, isProjectOwner } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 获取用户的所有项目
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const userId = req.user!.id;

    const projects = await prisma.project.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        owner: {
          select: { id: true, nickname: true, avatar: true },
        },
        members: {
          where: { userId },
          select: { role: true, areaId: true },
        },
        _count: {
          select: {
            guests: true,
            tables: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // 计算每个项目的统计数据
    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const [totalHeadCount, assignedHeadCount] = await Promise.all([
          prisma.guest.aggregate({
            where: { projectId: project.id },
            _sum: { headCount: true },
          }),
          prisma.guest.aggregate({
            where: {
              projectId: project.id,
              assignment: { isNot: null },
            },
            _sum: { headCount: true },
          }),
        ]);

        return {
          ...project,
          myRole: project.members[0]?.role,
          stats: {
            totalGuests: totalHeadCount._sum.headCount || 0,
            assignedGuests: assignedHeadCount._sum.headCount || 0,
            tableCount: project._count.tables,
          },
        };
      })
    );

    res.json({
      success: true,
      data: projectsWithStats,
    });
  })
);

// 创建项目
router.post(
  '/',
  authenticate,
  [
    body('name').notEmpty().withMessage('请输入项目名称'),
  ],
  asyncHandler(async (req: AuthRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array()[0].msg, 400);
    }

    const { name, weddingDate, venue, defaultSeatsPerTable } = req.body;
    const userId = req.user!.id;

    const project = await prisma.project.create({
      data: {
        name,
        weddingDate: weddingDate ? new Date(weddingDate) : null,
        venue,
        defaultSeatsPerTable: defaultSeatsPerTable || 10,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
        // 默认创建两个区域
        areas: {
          create: [
            { name: '新郎方', color: '#7B9EA8' },
            { name: '新娘方', color: '#B76E79' },
          ],
        },
      },
      include: {
        areas: true,
        members: {
          include: {
            user: {
              select: { id: true, nickname: true, avatar: true },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: '项目创建成功',
      data: project,
    });
  })
);

// 获取单个项目详情
router.get(
  '/:projectId',
  authenticate,
  isProjectMember,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: {
          select: { id: true, nickname: true, avatar: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, nickname: true, avatar: true, email: true },
            },
            area: {
              select: { id: true, name: true, color: true },
            },
          },
        },
        areas: {
          include: {
            manager: {
              select: { id: true, nickname: true },
            },
            _count: {
              select: { guests: true, tables: true },
            },
          },
        },
      },
    });

    if (!project) {
      throw new AppError('项目不存在', 404);
    }

    // 获取统计数据
    const [totalHeadCount, assignedHeadCount, tableStats] = await Promise.all([
      prisma.guest.aggregate({
        where: { projectId },
        _sum: { headCount: true },
      }),
      prisma.guest.aggregate({
        where: {
          projectId,
          assignment: { isNot: null },
        },
        _sum: { headCount: true },
      }),
      prisma.table.aggregate({
        where: { projectId },
        _sum: { capacity: true },
        _count: true,
      }),
    ]);

    res.json({
      success: true,
      data: {
        ...project,
        stats: {
          totalGuests: totalHeadCount._sum.headCount || 0,
          assignedGuests: assignedHeadCount._sum.headCount || 0,
          tableCount: tableStats._count,
          totalCapacity: tableStats._sum.capacity || 0,
        },
      },
    });
  })
);

// 更新项目
router.put(
  '/:projectId',
  authenticate,
  isProjectMember,
  isProjectOwner,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;
    const { name, weddingDate, venue, coverImage, defaultSeatsPerTable, status } = req.body;

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(weddingDate !== undefined && { weddingDate: weddingDate ? new Date(weddingDate) : null }),
        ...(venue !== undefined && { venue }),
        ...(coverImage !== undefined && { coverImage }),
        ...(defaultSeatsPerTable && { defaultSeatsPerTable }),
        ...(status && { status }),
      },
    });

    res.json({
      success: true,
      message: '项目更新成功',
      data: project,
    });
  })
);

// 删除项目
router.delete(
  '/:projectId',
  authenticate,
  isProjectMember,
  isProjectOwner,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;

    await prisma.project.delete({
      where: { id: projectId },
    });

    res.json({
      success: true,
      message: '项目已删除',
    });
  })
);

// 生成邀请链接
router.post(
  '/:projectId/invitations',
  authenticate,
  isProjectMember,
  isProjectOwner,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;
    const { role, areaId, expiresInHours = 24 } = req.body;

    if (!role || !['COLLABORATOR', 'VIEWER'].includes(role)) {
      throw new AppError('请选择有效的角色', 400);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const invitation = await prisma.projectInvitation.create({
      data: {
        projectId,
        token,
        role,
        areaId,
        expiresAt,
      },
    });

    const inviteLink = `${process.env.CLIENT_URL}/invite/${token}`;

    res.json({
      success: true,
      data: {
        invitation,
        inviteLink,
      },
    });
  })
);

// 接受邀请
router.post(
  '/join/:token',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { token } = req.params;
    const userId = req.user!.id;

    const invitation = await prisma.projectInvitation.findUnique({
      where: { token },
      include: { project: true },
    });

    if (!invitation) {
      throw new AppError('邀请链接无效', 404);
    }

    if (invitation.usedAt) {
      throw new AppError('该邀请链接已被使用', 400);
    }

    if (invitation.expiresAt < new Date()) {
      throw new AppError('邀请链接已过期', 400);
    }

    // 检查是否已是成员
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: invitation.projectId,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new AppError('您已是该项目的成员', 400);
    }

    // 添加成员并标记邀请已使用
    await prisma.$transaction([
      prisma.projectMember.create({
        data: {
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
          areaId: invitation.areaId,
        },
      }),
      prisma.projectInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({
      success: true,
      message: '成功加入项目',
      data: {
        projectId: invitation.projectId,
        projectName: invitation.project.name,
      },
    });
  })
);

// 获取项目成员列表
router.get(
  '/:projectId/members',
  authenticate,
  isProjectMember,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, nickname: true, avatar: true, email: true },
        },
        area: {
          select: { id: true, name: true, color: true },
        },
      },
    });

    res.json({
      success: true,
      data: members,
    });
  })
);

// 更新成员角色
router.put(
  '/:projectId/members/:memberId',
  authenticate,
  isProjectMember,
  isProjectOwner,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId, memberId } = req.params;
    const { role, areaId } = req.body;

    const member = await prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
    });

    if (!member) {
      throw new AppError('成员不存在', 404);
    }

    if (member.role === 'OWNER') {
      throw new AppError('无法修改项目所有者的角色', 400);
    }

    const updatedMember = await prisma.projectMember.update({
      where: { id: memberId },
      data: {
        ...(role && { role }),
        ...(areaId !== undefined && { areaId }),
      },
      include: {
        user: {
          select: { id: true, nickname: true, avatar: true },
        },
      },
    });

    res.json({
      success: true,
      message: '成员信息已更新',
      data: updatedMember,
    });
  })
);

// 移除成员
router.delete(
  '/:projectId/members/:memberId',
  authenticate,
  isProjectMember,
  isProjectOwner,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId, memberId } = req.params;

    const member = await prisma.projectMember.findFirst({
      where: { id: memberId, projectId },
    });

    if (!member) {
      throw new AppError('成员不存在', 404);
    }

    if (member.role === 'OWNER') {
      throw new AppError('无法移除项目所有者', 400);
    }

    await prisma.projectMember.delete({
      where: { id: memberId },
    });

    res.json({
      success: true,
      message: '成员已移除',
    });
  })
);

export default router;


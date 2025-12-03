import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AppError } from './errorHandler';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    nickname: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('请先登录', 401);
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'secret'
    ) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, nickname: true },
    });

    if (!user) {
      throw new AppError('用户不存在', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('无效的登录凭证', 401));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('登录已过期，请重新登录', 401));
    }
    next(error);
  }
};

// 检查用户是否是项目成员
export const isProjectMember = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const projectId = req.params.projectId || req.body.projectId;
    const userId = req.user?.id;

    if (!projectId || !userId) {
      throw new AppError('缺少必要参数', 400);
    }

    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!member) {
      throw new AppError('您不是该项目的成员', 403);
    }

    (req as any).memberRole = member.role;
    (req as any).memberAreaId = member.areaId;
    next();
  } catch (error) {
    next(error);
  }
};

// 检查用户是否是项目管理员（Owner 或 Collaborator）
export const isProjectAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const memberRole = (req as any).memberRole;

    if (memberRole === 'VIEWER') {
      throw new AppError('您没有编辑权限', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

// 检查用户是否是项目所有者
export const isProjectOwner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const memberRole = (req as any).memberRole;

    if (memberRole !== 'OWNER') {
      throw new AppError('仅项目所有者可执行此操作', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};


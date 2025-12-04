import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { body, validationResult } from "express-validator";
import { AppError, asyncHandler } from "../middleware/errorHandler";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// 生成 Token
const generateTokens = (userId: string) => {
  const accessTokenOptions: SignOptions = {
    expiresIn: "15m",
  };

  const refreshTokenOptions: SignOptions = {
    expiresIn: "7d",
  };

  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET || "secret",
    accessTokenOptions
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || "refresh-secret",
    refreshTokenOptions
  );

  return { accessToken, refreshToken };
};

// 注册
router.post(
  "/register",
  [
    body("email").isEmail().withMessage("请输入有效的邮箱地址"),
    body("password").isLength({ min: 6 }).withMessage("密码至少6位"),
    body("nickname").notEmpty().withMessage("请输入昵称"),
  ],
  asyncHandler(async (req: AuthRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array()[0].msg, 400);
    }

    const { email, password, nickname, phone } = req.body;

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError("该邮箱已被注册", 400);
    }

    // 如果提供了手机号，检查是否已存在
    if (phone) {
      const existingPhone = await prisma.user.findUnique({
        where: { phone },
      });
      if (existingPhone) {
        throw new AppError("该手机号已被注册", 400);
      }
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        nickname,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        nickname: true,
        avatar: true,
        createdAt: true,
      },
    });

    // 生成 token
    const { accessToken, refreshToken } = generateTokens(user.id);

    res.status(201).json({
      success: true,
      message: "注册成功",
      data: {
        user,
        accessToken,
        refreshToken,
      },
    });
  })
);

// 登录（支持邮箱或手机号）
router.post(
  "/login",
  [
    body("account").notEmpty().withMessage("请输入邮箱或手机号"),
    body("password").notEmpty().withMessage("请输入密码"),
  ],
  asyncHandler(async (req: AuthRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array()[0].msg, 400);
    }

    const { account, password } = req.body;

    // 判断是邮箱还是手机号
    const isEmail = account.includes("@");
    const isPhone = /^1[3-9]\d{9}$/.test(account);

    if (!isEmail && !isPhone) {
      throw new AppError("请输入有效的邮箱或手机号", 400);
    }

    // 查找用户（通过邮箱或手机号）
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: account } : { phone: account },
    });

    if (!user) {
      throw new AppError("账号或密码错误", 401);
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError("账号或密码错误", 401);
    }

    // 生成 token
    const { accessToken, refreshToken } = generateTokens(user.id);

    res.json({
      success: true,
      message: "登录成功",
      data: {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
        },
        accessToken,
        refreshToken,
      },
    });
  })
);

// 刷新 Token
router.post(
  "/refresh",
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError("缺少刷新令牌", 400);
    }

    try {
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || "refresh-secret"
      ) as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new AppError("用户不存在", 401);
      }

      const tokens = generateTokens(user.id);

      res.json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      throw new AppError("刷新令牌无效或已过期", 401);
    }
  })
);

// 获取当前用户信息
router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        phone: true,
        nickname: true,
        avatar: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: user,
    });
  })
);

// 更新用户信息
router.put(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { nickname, avatar } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(nickname && { nickname }),
        ...(avatar && { avatar }),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        nickname: true,
        avatar: true,
      },
    });

    res.json({
      success: true,
      message: "更新成功",
      data: user,
    });
  })
);

// 修改密码
router.put(
  "/password",
  authenticate,
  [
    body("oldPassword").notEmpty().withMessage("请输入原密码"),
    body("newPassword").isLength({ min: 6 }).withMessage("新密码至少6位"),
  ],
  asyncHandler(async (req: AuthRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array()[0].msg, 400);
    }

    const { oldPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      throw new AppError("用户不存在", 404);
    }

    const isPasswordValid = await bcrypt.compare(
      oldPassword,
      user.passwordHash
    );
    if (!isPasswordValid) {
      throw new AppError("原密码错误", 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      message: "密码修改成功",
    });
  })
);

export default router;

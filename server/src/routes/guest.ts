import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { body, query, validationResult } from "express-validator";
import multer from "multer";
import * as XLSX from "xlsx";
import { AppError, asyncHandler } from "../middleware/errorHandler";
import {
  authenticate,
  AuthRequest,
  isProjectMember,
  isProjectAdmin,
} from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

// 获取项目的所有宾客
router.get(
  "/project/:projectId",
  authenticate,
  isProjectMember,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;
    const {
      search,
      areaId,
      tag,
      assigned,
      page = "1",
      limit = "50",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const where: any = { projectId };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { phone: { contains: search as string } },
      ];
    }

    if (areaId) {
      where.areaId = areaId;
    }

    if (tag) {
      where.tags = { has: tag as string };
    }

    if (assigned === "true") {
      where.assignment = { isNot: null };
    } else if (assigned === "false") {
      where.assignment = null;
    }

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        include: {
          area: {
            select: { id: true, name: true, color: true },
          },
          assignment: {
            include: {
              table: {
                select: { id: true, name: true },
              },
            },
          },
          createdBy: {
            select: { id: true, nickname: true },
          },
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.guest.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        guests,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  })
);

// 获取单个宾客详情
router.get(
  "/:guestId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { guestId } = req.params;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      include: {
        area: true,
        assignment: {
          include: {
            table: true,
          },
        },
        createdBy: {
          select: { id: true, nickname: true },
        },
        constraints1: {
          include: {
            guest2: {
              select: { id: true, name: true },
            },
          },
        },
        constraints2: {
          include: {
            guest1: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!guest) {
      throw new AppError("宾客不存在", 404);
    }

    res.json({
      success: true,
      data: guest,
    });
  })
);

// 添加宾客
router.post(
  "/",
  authenticate,
  [
    body("projectId").notEmpty().withMessage("请选择项目"),
    body("name").notEmpty().withMessage("请输入宾客姓名"),
    body("headCount").isInt({ min: 1 }).withMessage("人数至少为1"),
  ],
  asyncHandler(async (req: AuthRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError(errors.array()[0].msg, 400);
    }

    const {
      projectId,
      name,
      headCount,
      phone,
      relationship,
      tags,
      notes,
      areaId,
    } = req.body;
    const userId = req.user!.id;

    // 验证用户是项目成员
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role === "VIEWER") {
      throw new AppError("您没有添加宾客的权限", 403);
    }

    const guest = await prisma.guest.create({
      data: {
        projectId,
        name,
        headCount: headCount || 1,
        phone,
        relationship,
        tags: tags || [],
        notes,
        areaId,
        createdById: userId,
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
        action: "CREATE_GUEST",
        targetType: "guest",
        targetId: guest.id,
        details: { guestName: name, headCount },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get("io");
    io.to(`project:${projectId}`).emit("guest:created", guest);

    res.status(201).json({
      success: true,
      message: "宾客添加成功",
      data: guest,
    });
  })
);

// 批量导入宾客 (Excel)
router.post(
  "/import/:projectId",
  authenticate,
  upload.single("file"),
  isProjectMember,
  isProjectAdmin,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;
    const { areaId, mode = "append" } = req.body;
    const userId = req.user!.id;

    if (!req.file) {
      throw new AppError("请上传Excel文件", 400);
    }

    // 解析Excel
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet) as any[];

    if (data.length === 0) {
      throw new AppError("Excel文件中没有数据", 400);
    }

    // 获取项目的所有区域，建立名称到ID的映射
    const areas = await prisma.area.findMany({
      where: { projectId },
      select: { id: true, name: true },
    });
    const areaNameToId: Record<string, string> = {};
    areas.forEach((area) => {
      areaNameToId[area.name] = area.id;
      // 也支持小写匹配
      areaNameToId[area.name.toLowerCase()] = area.id;
    });

    // 如果是覆盖模式，先删除现有宾客
    if (mode === "replace") {
      await prisma.guest.deleteMany({
        where: { projectId },
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[],
    };

    // 批量创建宾客
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const name = row["姓名"] || row["name"] || row["Name"];
      const headCount = parseInt(
        row["人数"] || row["headCount"] || row["HeadCount"] || "1"
      );

      if (!name) {
        results.failed++;
        results.errors.push({ row: i + 2, error: "姓名不能为空" });
        continue;
      }

      if (isNaN(headCount) || headCount < 1) {
        results.failed++;
        results.errors.push({ row: i + 2, error: "人数必须为正整数" });
        continue;
      }

      // 解析区域：优先使用Excel中的区域名称，否则使用默认areaId
      const rowAreaName = row["区域"] || row["area"] || row["Area"] || "";
      let resolvedAreaId: string | null = null;

      if (rowAreaName) {
        // Excel中指定了区域名称，尝试匹配
        resolvedAreaId =
          areaNameToId[rowAreaName] ||
          areaNameToId[rowAreaName.toLowerCase()] ||
          null;
        if (!resolvedAreaId) {
          // 区域名称不存在，记录警告但继续导入（使用默认区域）
          console.warn(`区域 "${rowAreaName}" 不存在，将使用默认区域`);
          resolvedAreaId = areaId || null;
        }
      } else {
        // Excel中没有指定区域，使用默认areaId
        resolvedAreaId = areaId || null;
      }

      try {
        await prisma.guest.create({
          data: {
            projectId,
            name,
            headCount,
            phone: row["手机号"] || row["phone"] || row["Phone"] || null,
            relationship: row["关系"] || row["relationship"] || null,
            tags: row["标签"]
              ? (row["标签"] as string).split(",").map((t) => t.trim())
              : [],
            notes: row["备注"] || row["notes"] || null,
            areaId: resolvedAreaId,
            createdById: userId,
          },
        });
        results.success++;
      } catch (error: any) {
        console.error("Import guest error:", error.message);
        results.failed++;
        results.errors.push({ row: i + 2, error: error.message || "创建失败" });
      }
    }

    // 记录活动日志
    await prisma.activityLog.create({
      data: {
        projectId,
        userId,
        action: "IMPORT_GUESTS",
        targetType: "guest",
        details: { imported: results.success, failed: results.failed },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get("io");
    io.to(`project:${projectId}`).emit("guests:imported", {
      count: results.success,
    });

    res.json({
      success: true,
      message: `成功导入 ${results.success} 位宾客`,
      data: results,
    });
  })
);

// 下载导入模板
router.get(
  "/template/download",
  asyncHandler(async (req: AuthRequest, res: any) => {
    const templateData = [
      {
        姓名: "张三",
        人数: 2,
        手机号: "13800138000",
        关系: "新郎同事",
        标签: "同事,VIP",
        区域: "新郎方",
        备注: "素食",
      },
      {
        姓名: "李四",
        人数: 4,
        手机号: "13900139000",
        关系: "新郎表哥",
        标签: "亲戚",
        区域: "新娘方",
        备注: "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "宾客名单");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=guest_template.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  })
);

// 更新宾客
router.put(
  "/:guestId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { guestId } = req.params;
    const { name, headCount, phone, relationship, tags, notes, areaId } =
      req.body;
    const userId = req.user!.id;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
    });

    if (!guest) {
      throw new AppError("宾客不存在", 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: guest.projectId, userId },
      },
    });

    if (!member || member.role === "VIEWER") {
      throw new AppError("您没有编辑权限", 403);
    }

    const updatedGuest = await prisma.guest.update({
      where: { id: guestId },
      data: {
        ...(name && { name }),
        ...(headCount !== undefined && { headCount }),
        ...(phone !== undefined && { phone }),
        ...(relationship !== undefined && { relationship }),
        ...(tags !== undefined && { tags }),
        ...(notes !== undefined && { notes }),
        ...(areaId !== undefined && { areaId }),
      },
      include: {
        area: true,
        assignment: {
          include: { table: true },
        },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get("io");
    io.to(`project:${guest.projectId}`).emit("guest:updated", updatedGuest);

    res.json({
      success: true,
      message: "宾客信息已更新",
      data: updatedGuest,
    });
  })
);

// 删除宾客
router.delete(
  "/:guestId",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { guestId } = req.params;
    const userId = req.user!.id;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
    });

    if (!guest) {
      throw new AppError("宾客不存在", 404);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: guest.projectId, userId },
      },
    });

    if (!member || member.role === "VIEWER") {
      throw new AppError("您没有删除权限", 403);
    }

    await prisma.guest.delete({
      where: { id: guestId },
    });

    // 记录活动日志
    await prisma.activityLog.create({
      data: {
        projectId: guest.projectId,
        userId,
        action: "DELETE_GUEST",
        targetType: "guest",
        targetId: guestId,
        details: { guestName: guest.name },
      },
    });

    // 发送 Socket 事件
    const io = req.app.get("io");
    io.to(`project:${guest.projectId}`).emit("guest:deleted", { id: guestId });

    res.json({
      success: true,
      message: "宾客已删除",
    });
  })
);

// 批量删除宾客
router.post(
  "/batch-delete",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { guestIds, projectId } = req.body;
    const userId = req.user!.id;

    if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
      throw new AppError("请选择要删除的宾客", 400);
    }

    // 验证权限
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    });

    if (!member || member.role === "VIEWER") {
      throw new AppError("您没有删除权限", 403);
    }

    await prisma.guest.deleteMany({
      where: {
        id: { in: guestIds },
        projectId,
      },
    });

    // 发送 Socket 事件
    const io = req.app.get("io");
    io.to(`project:${projectId}`).emit("guests:deleted", { ids: guestIds });

    res.json({
      success: true,
      message: `已删除 ${guestIds.length} 位宾客`,
    });
  })
);

// 获取项目的所有标签
router.get(
  "/tags/:projectId",
  authenticate,
  isProjectMember,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;

    const guests = await prisma.guest.findMany({
      where: { projectId },
      select: { tags: true },
    });

    const allTags = new Set<string>();
    guests.forEach((g) => g.tags.forEach((t) => allTags.add(t)));

    res.json({
      success: true,
      data: Array.from(allTags),
    });
  })
);

// 导出宾客名单
router.get(
  "/export/:projectId",
  authenticate,
  isProjectMember,
  asyncHandler(async (req: AuthRequest, res: any) => {
    const { projectId } = req.params;

    // 获取项目信息
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });

    // 获取所有宾客
    const guests = await prisma.guest.findMany({
      where: { projectId },
      include: {
        area: {
          select: { name: true },
        },
        assignment: {
          include: {
            table: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: [{ area: { name: "asc" } }, { createdAt: "asc" }],
    });

    // 转换为 Excel 格式
    const exportData = guests.map((guest, index) => ({
      序号: index + 1,
      姓名: guest.name,
      人数: guest.headCount,
      手机号: guest.phone || "",
      关系: guest.relationship || "",
      标签: guest.tags.join(", "),
      区域: guest.area?.name || "",
      桌位: guest.assignment?.table?.name || "未安排",
      备注: guest.notes || "",
    }));

    // 创建工作簿
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // 设置列宽
    worksheet["!cols"] = [
      { wch: 6 }, // 序号
      { wch: 12 }, // 姓名
      { wch: 6 }, // 人数
      { wch: 14 }, // 手机号
      { wch: 16 }, // 关系
      { wch: 20 }, // 标签
      { wch: 10 }, // 区域
      { wch: 10 }, // 桌位
      { wch: 20 }, // 备注
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "宾客名单");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // 文件名使用项目名称
    const fileName = encodeURIComponent(
      `${project?.name || "婚礼"}_宾客名单.xlsx`
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${fileName}`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  })
);

export default router;

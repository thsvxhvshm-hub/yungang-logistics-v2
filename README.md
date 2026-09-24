# 云港国际物流｜电商在途系统 V2（云端数据库版）

这是把原来的单机 `index.html` 改成的多人云端版本：前端页面仍保留原系统的主要界面，但数据、账号、权限全部走服务器 + PostgreSQL，不再依赖浏览器 `localStorage`。

## V2 已完成

- 多设备访问：电脑、手机、平板都可以登录同一个网址
- 云端保存：新增/修改/删除后，所有设备看到的是同一份数据
- 登录认证：账号密码由服务器验证，密码使用 bcrypt 哈希保存
- 角色：老板 / 操作员 / 查看员
- 老板：查看、新增、修改、删除、设置、账号管理
- 操作员：查看、新增、修改
- 查看员：只读
- 物流数据：保留原 HTML 中的 161 条初始记录，首次启动自动导入数据库
- 搜索、国家/月度筛选、签收/在途、超期未签收、CSV 导出继续保留
- 审计日志：登录、新增、修改、删除、设置等操作写入 `audit_logs`
- 账号可禁用、可改角色、可重置密码

## 初始管理员

默认：`SZYG001 / 123`

**第一次登录后建议马上修改密码。**

如果部署平台设置了 `ADMIN_USERNAME` / `ADMIN_PASSWORD`，以环境变量为准。

## 目录

```text
yungang-v2/
├─ public/
│  └─ index.html       # 云端版前端
├─ server.js           # Node.js API + 登录 + 权限
├─ schema.sql          # PostgreSQL 数据表
├─ seed.json           # 从原 HTML 提取的 161 条初始数据
├─ package.json
├─ Dockerfile
└─ .env.example
```

## 最简单的上线方式

你需要两个云服务：

1. 一个 PostgreSQL 云数据库
2. 一个能运行 Node.js 的 Web 服务

把这个项目上传到 GitHub，然后在你选择的 Node.js 云平台创建 Web Service，把环境变量设置成：

```text
DATABASE_URL=你的PostgreSQL连接串
JWT_SECRET=一串很长的随机字符串
ADMIN_USERNAME=SZYG001
ADMIN_PASSWORD=123
NODE_ENV=production
```

启动命令：

```text
npm start
```

服务端口使用平台提供的 `PORT`，本项目已经兼容。

部署完成后平台会给你一个类似：

```text
https://你的系统名字.平台域名
```

同事直接打开这个网址即可登录。

## 数据库初始化

服务器第一次启动会自动：

1. 创建 `users`
2. 创建 `shipments`
3. 创建 `settings`
4. 创建 `audit_logs`
5. 创建初始管理员
6. 如果 `shipments` 为空，自动导入 `seed.json` 中的 161 条原始数据

因此正常情况下不需要手动导入 SQL。

## 重要说明

原 HTML 的数据是浏览器本地数据。本 V2 不会自动读取同事电脑里以前的 localStorage 数据，因为那些数据只存在原来的浏览器里。当前 V2 已经把你上传的 `index.html` 里面的 161 条初始记录提取到了 `seed.json`，第一次启动会统一写入云数据库。

如果某台电脑上还有后来新增、修改过但没有出现在原 HTML 文件里的 localStorage 数据，需要从原电脑导出 CSV 后再导入数据库；不要直接覆盖云端数据。

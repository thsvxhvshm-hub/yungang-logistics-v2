const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,'public')));

const pool = new Pool({connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !/localhost|127\\.0\\.0\\.1/.test(process.env.DATABASE_URL) ? {rejectUnauthorized:false} : false});
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const fields=['month','country','customer_name','customer_no','pieces','mode','ship_date','tracking','est_weight','actual_weight','lastmile','goods','status','address','cost','remark','signed'];
function cleanShipment(x={}){const o={}; for(const k of fields)o[k]=x[k] == null ? '' : String(x[k]); return o;}
function tokenFor(u){return jwt.sign({id:u.id,username:u.username,role:u.role},JWT_SECRET,{expiresIn:'7d'});}
function auth(req,res,next){try{const t=req.cookies.yg_token; if(!t) return res.status(401).json({error:'未登录'}); req.user=jwt.verify(t,JWT_SECRET); next();}catch(e){return res.status(401).json({error:'登录已失效，请重新登录'});}}
function role(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'没有权限'});}
async function log(user,action,entity,entityId,detail){try{await pool.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[user?.id||null,action,entity||null,entityId||null,detail||{}]);}catch(e){console.error('audit',e.message)}}

async function initDb(){
  await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  const count=(await pool.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n;
  if(!count){
    const username=process.env.ADMIN_USERNAME||'SZYG001';
    const password=process.env.ADMIN_PASSWORD||'123';
    const hash=await bcrypt.hash(password,12);
    await pool.query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3)',[username,hash,'老板']);
    console.log(`Created administrator: ${username}`);
  }
  const sc=(await pool.query('SELECT COUNT(*)::int AS n FROM shipments')).rows[0].n;
  if(!sc){
    const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json'),'utf8'));
    const admin=(await pool.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0];
    for(const raw of seed){const x=cleanShipment(raw); await pool.query(`INSERT INTO shipments(${fields.join(',')},created_by,updated_by) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')},$${fields.length+1},$${fields.length+1})`,[...fields.map(k=>x[k]),admin.id]);}
    console.log(`Seeded ${seed.length} shipment records.`);
  }
  const defaults={default_mode:'空运',admin_name:'管理员',company_name:'云港国际物流（深圳）有限公司',default_status:'进行中',allow_csv:'1',show_remark:'1'};
  for(const [k,v] of Object.entries(defaults)) await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[k,v]);
}

app.post('/api/login',async(req,res)=>{try{const {username,password}=req.body||{}; if(!username||!password)return res.status(400).json({error:'请输入账号和密码'}); const r=await pool.query('SELECT id,username,password_hash,role,active FROM users WHERE username=$1',[username.trim()]); const u=r.rows[0]; if(!u||!u.active||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:'账号或密码错误'}); res.cookie('yg_token',tokenFor(u),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*24*3600*1000}); await log(u,'login'); res.json({user:{username:u.username,role:u.role}});}catch(e){console.error(e);res.status(500).json({error:'服务器错误'})}});
app.post('/api/logout',async(req,res)=>{res.clearCookie('yg_token');res.json({ok:true})});
app.get('/api/me',auth,(req,res)=>res.json({user:{username:req.user.username,role:req.user.role}}));

app.get('/api/shipments',auth,async(req,res)=>{try{const r=await pool.query('SELECT * FROM shipments ORDER BY id DESC');res.json(r.rows);}catch(e){console.error(e);res.status(500).json({error:'读取数据失败'})}});
app.post('/api/shipments',auth,role('老板','操作员'),async(req,res)=>{try{const x=cleanShipment(req.body); const vals=fields.map(k=>x[k]); const r=await pool.query(`INSERT INTO shipments(${fields.join(',')},created_by,updated_by) VALUES(${fields.map((_,i)=>'$'+(i+1)).join(',')},$${fields.length+1},$${fields.length+1}) RETURNING *`,[...vals,req.user.id]); await log(req.user,'create','shipment',r.rows[0].id,x);res.status(201).json(r.rows[0]);}catch(e){console.error(e);res.status(500).json({error:'新增失败'})}});
app.put('/api/shipments/:id',auth,role('老板','操作员'),async(req,res)=>{try{const id=Number(req.params.id); if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'无效的记录ID'}); const x=cleanShipment(req.body); const sets=fields.map((k,i)=>`${k}=$${i+1}`).join(','); const r=await pool.query(`UPDATE shipments SET ${sets},updated_by=$${fields.length+1},updated_at=NOW() WHERE id=$${fields.length+2} RETURNING *`,[...fields.map(k=>x[k]),req.user.id,id]); if(!r.rowCount)return res.status(404).json({error:'记录不存在'}); await log(req.user,'update','shipment',id,x);res.json(r.rows[0]);}catch(e){console.error(e);res.status(500).json({error:'修改失败'})}});
app.delete('/api/shipments/:id',auth,role('老板'),async(req,res)=>{try{const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'无效的记录ID'});const client=await pool.connect();try{await client.query('BEGIN');const r=await client.query('DELETE FROM shipments WHERE id=$1 RETURNING *',[id]);if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'记录不存在或已被删除'});}await client.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[req.user.id,'delete','shipment',id,r.rows[0]]);await client.query('COMMIT');res.json({ok:true,id});}catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}finally{client.release()}}catch(e){console.error('delete shipment',e);res.status(500).json({error:'删除失败：'+e.message})}});

app.get('/api/settings',auth,async(req,res)=>{const r=await pool.query('SELECT key,value FROM settings');res.json(Object.fromEntries(r.rows.map(x=>[x.key,x.value])))});
app.put('/api/settings',auth,role('老板'),async(req,res)=>{try{for(const [k,v] of Object.entries(req.body||{})){await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[k,String(v)]);}await log(req.user,'settings');res.json({ok:true});}catch(e){res.status(500).json({error:'设置保存失败'})}});

app.get('/api/users',auth,role('老板'),async(req,res)=>{const r=await pool.query('SELECT id,username,role,active,created_at FROM users ORDER BY id');res.json(r.rows)});
app.post('/api/users',auth,role('老板'),async(req,res)=>{try{const {username,password,role:rl='查看员'}=req.body||{};if(!username||!password)return res.status(400).json({error:'账号和密码不能为空'});if(!['老板','操作员','查看员'].includes(rl))return res.status(400).json({error:'角色无效'});const hash=await bcrypt.hash(password,12);const r=await pool.query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,active',[username.trim(),hash,rl]);await log(req.user,'create','user',r.rows[0].id,{username,role:rl});res.status(201).json(r.rows[0]);}catch(e){if(e.code==='23505')return res.status(409).json({error:'账号已存在'});console.error(e);res.status(500).json({error:'新增账号失败'})}});
app.patch('/api/users/:id',auth,role('老板'),async(req,res)=>{try{const id=Number(req.params.id);const {role:rl,active,password}=req.body||{};const cur=(await pool.query('SELECT * FROM users WHERE id=$1',[id])).rows[0];if(!cur)return res.status(404).json({error:'用户不存在'});if(id===req.user.id&&active===false)return res.status(400).json({error:'不能禁用自己的账号'});let hash=cur.password_hash;if(password)hash=await bcrypt.hash(password,12);const r=await pool.query('UPDATE users SET role=$1,active=$2,password_hash=$3 WHERE id=$4 RETURNING id,username,role,active',[rl||cur.role,active===undefined?cur.active:active,hash,id]);res.json(r.rows[0]);}catch(e){res.status(500).json({error:'账号更新失败'})}});

const port=process.env.PORT||3000;
initDb().then(()=>app.listen(port,()=>console.log(`Yungang V2 listening on ${port}`))).catch(e=>{console.error('DB init failed:',e);process.exit(1)});

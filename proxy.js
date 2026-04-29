/**
 * Cyber Metaphysics Architect 代理服务器 v2.2
 * 架构：八字算法精确计算 -> AI 专业解读
 * 启动：export GROQ_API_KEY=gsk_... && node proxy.js
 */

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const app       = express();

// ═══ Prompt 模板库（后台可动态维护） ═══
const PROMPTS_FILE = path.join(__dirname, 'data', 'prompts.json');
const MODEL_SETTINGS_FILE = path.join(__dirname, 'data', 'model-settings.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const MODEL_OPTIONS = [
  {provider:'openrouter', model:'anthropic/claude-sonnet-4.6', name:'Claude Sonnet 4.6', recommended:['quick_ask','fengshui','dream','almanac','bazi','wealth','followup']},
  {provider:'openrouter', model:'anthropic/claude-opus-4.6', name:'Claude Opus 4.6', recommended:['bazi','wealth','followup']},
  {provider:'openrouter', model:'openai/gpt-4.1', name:'GPT-4.1', recommended:['quick_ask','almanac']},
  {provider:'openrouter', model:'google/gemini-2.5-pro', name:'Gemini 2.5 Pro', recommended:['fengshui','dream']},
  {provider:'openrouter', model:'x-ai/grok-4', name:'Grok 4', recommended:['quick_ask']},
  {provider:'groq', model:'llama-3.3-70b-versatile', name:'Llama 3.3 70B Versatile', recommended:['quick_ask','almanac']}
];
const DEFAULT_MODEL_SETTINGS = {
  providers: {
    openrouter: { apiKey: '', updated_at: null },
    groq: { apiKey: '', updated_at: null }
  },
  moduleModels: {
    default: { provider:'openrouter', model:'anthropic/claude-sonnet-4.6' },
    quick_ask: { provider:'openrouter', model:'anthropic/claude-sonnet-4.6' },
    fengshui: { provider:'openrouter', model:'anthropic/claude-sonnet-4.6' },
    dream: { provider:'openrouter', model:'anthropic/claude-sonnet-4.6' },
    almanac: { provider:'openrouter', model:'anthropic/claude-sonnet-4.6' },
    bazi: { provider:'openrouter', model:'anthropic/claude-opus-4.6' },
    wealth: { provider:'openrouter', model:'anthropic/claude-opus-4.6' },
    followup: { provider:'openrouter', model:'anthropic/claude-sonnet-4.6' }
  }
};
const DEFAULT_PROMPTS = [
  {
    key: 'quick_ask_general',
    name: '快捷问事·通用决策',
    module: '快捷问事',
    description: '调用条件：普通择事、黄历、解梦、风水常识等不强制依赖生辰八字的问题。',
    content:
`你是“国学决策助手”的高级顾问，融合黄历择日、风水环境、梦境象征与现代决策建议。
请基于用户问题给出稳健、克制、可执行的建议。不要承诺绝对结果，不制造恐慌。

当前日期：{{current_date}}
问题类型：{{category_label}}
用户问题：{{question}}

如果问题涉及个人长期运势，但用户未提供出生信息，请先给出基础判断，并自然提示“补充出生信息后可结合个人命理进一步分析”。
输出要像“决策建议卡片”，不要像聊天机器人继续追问；不要写“你可以继续告诉我/我可以为你”等无法在当前页面承接的互动话术。
必须包含：1）明确结论；2）判断依据；3）今天/近期能直接执行的动作；4）适合跳转的下一步服务。

严格返回JSON，不输出其他内容：
{"category":"{{category}}","need_birth":false,"summary":"明确结论，30字以内","analysis":"先给结论依据，再说明风险边界，160-220字，不能空泛","actions":["今天/近期可执行动作1，具体到行为","可执行动作2，具体到检查项或时间","可执行动作3，具体到规避事项"],"upgrade_hint":"下一步可点击的专题服务，如命理报告/今日黄历/风水诊断/梦境解析/报告中心，50字以内","consult_hint":"仅在高成本决策场景建议真人咨询，40字以内"}`
  },
  {
    key: 'quick_ask_bazi',
    name: '快捷问事·命理增强',
    module: '快捷问事',
    description: '调用条件：事业、财运、感情、流年/月运、不顺、合盘等需要结合个人命理的问题。',
    content:
`你是“国学决策助手”的命理决策顾问，精通八字格局、流年大运、五行喜忌与现实行动建议。
请基于系统已计算的四柱数据进行分析，不要修改四柱，不要夸大确定性。

当前日期：{{current_date}}
问题类型：{{category_label}}
用户问题：{{question}}

【用户资料】
{{birth_context}}

【系统计算命理上下文】
{{bazi_context}}

输出要像“个人化决策建议卡片”，不要像聊天机器人继续追问；不要写“你可以继续告诉我/我可以为你”等当前页面无法承接的互动话术。
必须包含：1）明确结论；2）命理依据；3）短期行动；4）风险边界；5）适合跳转的下一步服务。

严格返回JSON，不输出其他内容：
{"category":"{{category}}","need_birth":true,"summary":"个人化结论，30字以内","analysis":"结合四柱、五行、喜忌、大运/流年的判断依据，180-260字，必须落到用户问题","actions":["短期行动1，具体可做","短期行动2，具体到取舍或节奏","风险规避3，具体到不要做什么"],"timing":"近期适合/不适合行动的时间提示，60字以内","upgrade_hint":"下一步可点击的专题服务，如生成命理报告/深度财运分析/报告中心，50字以内","consult_hint":"仅在高成本决策场景建议真人咨询，50字以内"}`
  },
  {
    key: 'fengshui_analysis',
    name: '家宅风水诊断',
    module: '家宅风水',
    description: '空间图片/文字风水分析的专业提示词模板。',
    content:
`你是精通《葬书》环境风水、三元玄空飞星与八宅明镜的 AI 数字化风水顾问。结合现代环境科学与空间心理学，给出逻辑严密、可执行的环境优化报告。禁止使用“迷信、包治、保证改运”等绝对化表达。

分析模式：{{mode}}
空间类型：{{room}}
分析侧重：{{focus}}
入户门朝向：{{door_dir}}
文字描述：{{desc}}

如果是图片模式，请只基于图片中可见内容和用户补充朝向分析，不臆测看不到的信息；如果是文字模式，请只基于文字描述分析。

严格返回JSON，不输出其他内容：
{"score":整数50-95,"score_reason":"评分理由，50字以内","room_detected":"{{room}}","findings":[{"type":"good或warn或bad","text":"具体发现，不少于30字","suggestion":"具体可操作改善方案，不少于25字","detail":"风水原理与长期影响，不少于30字"}],"deep_analysis":{"qi_flow":"气流格局分析，60字以上","five_elements":"五行平衡分析，60字以上","sha_analysis":"形煞评估，60字以上","lucky_positions":"吉位位置与激活方案，60字以上","improvement_priority":"按优先级的改善步骤，80字以上"},"directions":[{"dir":"方位","element":"五行","gua":"卦名","benefit":"具体影响","how_to_use":"利用方式，20字以内"}],"items":["具体风水物品及摆放位置"],"remove":["需移除或调整的物品，无则空数组"],"master_comment":"顾问综合总评，结合实际情况深度分析，150字以上"}`
  },
  {
    key: 'dream_analysis',
    name: '梦境解析',
    module: '梦境解析',
    description: '梦境象征、心理状态、近期提醒分析模板。',
    content:
`你是融合传统梦象、道家符象学、荣格原型心理学与现代潜意识分析的梦境顾问。你的目标是帮助用户理解梦境背后的情绪、关系、压力和近期提醒，不制造恐慌，不做绝对预言。

醒来感受：{{emotion}}
梦中出现：{{subjects}}
梦境时间：{{time}}
补充细节：{{text}}

请从潜意识信号、梦象五行、近30天提醒和行动建议四个维度分析。

严格返回JSON，不输出其他内容：
{"summary":"梦境整体解读，不少于120字","element":"梦境主五行（木/火/土/金/水）","omen":"good或warn或bad","symbols":[{"icon":"emoji","name":"意象名称","meaning":"象征含义与五行对应，不少于40字","type":"吉或凶或中","significance":"对梦者的具体启示，20字以内"}],"prediction":"综合近30天运势/状态提醒，不少于80字","aspects":{"career":{"text":"事业提醒，25字","score":整数30-95},"wealth":{"text":"财务提醒，25字","score":整数30-95},"relationship":{"text":"感情提醒，25字","score":整数30-95},"health":{"text":"身心状态提示，25字","score":整数30-95}},"remedy":"有明显警示时给出舒缓或规避建议，无则为空字符串","advice":"今日立即可做的1个具体行动，40字以内","master_comment":"顾问综合分析，不少于120字"}`
  },
  {
    key: 'almanac_today',
    name: '今日宜忌/择日黄历',
    module: '今日决策',
    description: '今日宜忌、吉时方位、事项适配分析模板。',
    content:
`你是精通中国传统黄历、干支历法、十二建除与日常择事的时空决策顾问。请用冷静、清晰、可执行的方式解释今日宜忌，避免绝对化承诺。

今日公历日期：{{date}}

请完成：干支判断、今日宜忌、吉神凶煞、吉时方位、吉祥颜色、五行能量分布和今日总结。

严格返回JSON，不输出其他内容：
{"ganzhi":"完整干支如甲子日","day_element":"日柱五行","lucky_gods":[{"name":"吉神名","meaning":"含义与今日影响，20字以内"}],"bad_gods":[{"name":"凶煞名","meaning":"影响与注意事项，20字以内"}],"yi":["宜1（具体说明）","宜2","宜3","宜4","宜5"],"ji":["忌1（具体说明）","忌2","忌3"],"lucky_hours":[{"name":"时辰名","time":"时间段","suitable":"适合做什么"},{"name":"时辰名","time":"时间段","suitable":"适合做什么"}],"lucky_dirs":["方位1","方位2"],"lucky_colors":["颜色1（对应五行）","颜色2（对应五行）"],"elements":{"wood":整数,"fire":整数,"earth":整数,"metal":整数,"water":整数},"risk_warning":"今日需避开的方位或行为，30字以内","day_summary":"今日综合分析，不少于100字"}`
  },
  {
    key: 'bazi_report',
    name: '命理报告',
    module: '运势命理',
    description: '八字命盘、格局、流年、大运、建议分析模板。',
    content: '预置模块：命理报告。当前版本后端使用多Agent硬编码Prompt，后续可迁移到模板调用。'
  },
  {
    key: 'wealth_report',
    name: '财富运势',
    module: '运势命理',
    description: '财格、正偏财、旺财布局、财运周期分析模板。',
    content: '预置模块：财富运势。当前版本后端使用多Agent硬编码Prompt，后续可迁移到模板调用。'
  }
];

function ensureDataDir(){
  const dir = path.join(__dirname, 'data');
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function loadPrompts(){
  ensureDataDir();
  let prompts = [];
  try{
    if(fs.existsSync(PROMPTS_FILE)) prompts = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
  }catch(e){ prompts = []; }
  const byKey = new Map(prompts.map(p => [p.key, p]));
  DEFAULT_PROMPTS.forEach(p => {
    if(!byKey.has(p.key)){
      byKey.set(p.key, {...p, updated_at: null});
    } else {
      const saved = byKey.get(p.key);
      byKey.set(p.key, {
        ...saved,
        name: p.name,
        module: p.module,
        description: p.description
      });
    }
  });
  return Array.from(byKey.values());
}
function savePrompts(prompts){
  ensureDataDir();
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(prompts, null, 2), 'utf8');
}
function getPrompt(key){
  return loadPrompts().find(p => p.key === key) || DEFAULT_PROMPTS.find(p => p.key === key);
}
function renderTemplate(tpl, vars){
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] == null ? '' : String(vars[k]));
}
function loadModelSettings(){
  ensureDataDir();
  let settings = {};
  try{
    if(fs.existsSync(MODEL_SETTINGS_FILE)) settings = JSON.parse(fs.readFileSync(MODEL_SETTINGS_FILE, 'utf8'));
  }catch(e){ settings = {}; }
  return {
    providers: {
      openrouter: {...DEFAULT_MODEL_SETTINGS.providers.openrouter, ...(settings.providers?.openrouter||{})},
      groq: {...DEFAULT_MODEL_SETTINGS.providers.groq, ...(settings.providers?.groq||{})}
    },
    moduleModels: {...DEFAULT_MODEL_SETTINGS.moduleModels, ...(settings.moduleModels||{})}
  };
}
function saveModelSettings(settings){
  ensureDataDir();
  fs.writeFileSync(MODEL_SETTINGS_FILE, JSON.stringify(settings, null, 2), {encoding:'utf8', mode:0o600});
  try{ fs.chmodSync(MODEL_SETTINGS_FILE, 0o600); }catch(e){}
}
function maskKey(key){
  if(!key) return '';
  if(key.length <= 10) return key.slice(0,2)+'***'+key.slice(-2);
  return key.slice(0,6)+'***'+key.slice(-4);
}
function publicModelSettings(){
  const settings = loadModelSettings();
  return {
    providers: {
      openrouter: {
        has_key: !!(process.env.OPENROUTER_API_KEY || settings.providers.openrouter.apiKey),
        key_mask: process.env.OPENROUTER_API_KEY ? 'ENV:'+maskKey(process.env.OPENROUTER_API_KEY) : maskKey(settings.providers.openrouter.apiKey),
        updated_at: settings.providers.openrouter.updated_at
      },
      groq: {
        has_key: !!(process.env.GROQ_API_KEY || settings.providers.groq.apiKey),
        key_mask: process.env.GROQ_API_KEY ? 'ENV:'+maskKey(process.env.GROQ_API_KEY) : maskKey(settings.providers.groq.apiKey),
        updated_at: settings.providers.groq.updated_at
      }
    },
    moduleModels: settings.moduleModels,
    modelOptions: MODEL_OPTIONS
  };
}
function providerKey(provider){
  const settings = loadModelSettings();
  if(provider === 'openrouter') return process.env.OPENROUTER_API_KEY || settings.providers.openrouter.apiKey;
  if(provider === 'groq') return process.env.GROQ_API_KEY || settings.providers.groq.apiKey;
  return '';
}
function modelConfigFor(moduleKey, requestedModel){
  if(requestedModel && requestedModel !== 'groq'){
    return { provider:'openrouter', model:requestedModel };
  }
  if(requestedModel === 'groq'){
    return { provider:'groq', model:'llama-3.3-70b-versatile' };
  }
  const settings = loadModelSettings();
  return settings.moduleModels[moduleKey] || settings.moduleModels.default || DEFAULT_MODEL_SETTINGS.moduleModels.default;
}

// ═══ 信任 Nginx 反向代理（修复 X-Forwarded-For 限流问题） ═══
app.set('trust proxy', 1);

// ═══ 安全：内部 API 令牌（防止外部直接调用接口） ═══
// 生产环境请在环境变量中设置 INTERNAL_TOKEN，否则每次重启会随机生成（开发用）
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || crypto.randomBytes(32).toString('hex');
if(!process.env.INTERNAL_TOKEN){
  console.warn('[安全提示] INTERNAL_TOKEN 未设置，已随机生成（重启后变化）');
}

// ═══ 安全：CORS 白名单（只允许自己的域名） ═══
// CORS：放开所有来源，安全由 X-CMA-Token 令牌保证
// 生产域名：aicopyme.com
app.use(cors({
  origin: true,
  methods: ['GET','POST'],
  allowedHeaders: ['Content-Type','X-CMA-Token','Authorization'],
}));

// ═══ 安全：HTTP 安全响应头（防点击劫持、XSS、嗅探等） ═══
app.use(helmet({
  contentSecurityPolicy: false, // 静态页面有内联脚本，暂关 CSP（可后续精细配置）
  crossOriginEmbedderPolicy: false,
}));

// ═══ 安全：请求体大小限制 ═══
app.use('/api/chat',   express.json({ limit: '20mb' })); // 图片分析最大20MB
app.use('/api/bazi',   express.json({ limit: '10kb' }));
app.use('/api/wealth', express.json({ limit: '10kb' }));
app.use('/api/activate',     express.json({ limit: '1kb' }));
app.use('/api/use-credit',   express.json({ limit: '1kb' }));
app.use('/api/admin',        express.json({ limit: '10kb' }));
app.use('/api/auth',         express.json({ limit: '20kb' }));
app.use(express.json({ limit: '50mb' })); // 全局兜底

// ═══ 安全：限流（防 DDoS 和 API 滥用） ═══
function makeLimiter(max, windowMin, msg){
  return rateLimit({
    windowMs: windowMin * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: msg } },
    skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1', // 本机不限流
  });
}
// AI 分析接口：每 IP 每分钟最多 15 次
app.use('/api/chat',   makeLimiter(15,  1, '请求过于频繁，请稍后再试'));
app.use('/api/bazi',   makeLimiter(10,  1, '请求过于频繁，请稍后再试'));
app.use('/api/wealth', makeLimiter(10,  1, '请求过于频繁，请稍后再试'));
// 激活码：每 IP 每15分钟最多 8 次（防暴力破解）
app.use('/api/activate', makeLimiter(8, 15, '尝试次数过多，请15分钟后再试'));
// 管理后台：每 IP 每分钟最多 20 次
app.use('/api/admin', makeLimiter(20, 1, '请求过于频繁'));
// 账号接口：防止注册/登录暴力尝试
app.use('/api/auth', makeLimiter(20, 5, '请求过于频繁，请稍后再试'));

// ═══ 安全：内部令牌验证中间件（AI 分析接口专用） ═══
function requireToken(req, res, next){
  const token = req.headers['x-cma-token'];
  if(token !== INTERNAL_TOKEN){
    return res.status(403).json({ error: { message: '访问被拒绝' } });
  }
  next();
}

// ═══ 用户账号与画像基础资料（手机号+密码，暂不接入短信） ═══
const SESSION_SECRET = process.env.SESSION_SECRET || INTERNAL_TOKEN;

function loadUsers(){
  ensureDataDir();
  try{
    if(fs.existsSync(USERS_FILE)){
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      return Array.isArray(users) ? users : [];
    }
  }catch(e){}
  return [];
}

function saveUsers(users){
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), {encoding:'utf8', mode:0o600});
  try{ fs.chmodSync(USERS_FILE, 0o600); }catch(e){}
}

function normalizePhone(phone){
  return String(phone || '').replace(/\D/g, '');
}

function hashPassword(password, salt){
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function createPasswordRecord(password){
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: hashPassword(password, salt) };
}

function verifyPassword(password, user){
  if(!user || !user.password || !user.password.salt || !user.password.hash) return false;
  const actual = Buffer.from(hashPassword(password, user.password.salt), 'hex');
  const expected = Buffer.from(user.password.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function signToken(payload){
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(token){
  const parts = String(token || '').split('.');
  if(parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(parts[0]).digest('base64url');
  const got = Buffer.from(parts[1]);
  const exp = Buffer.from(expected);
  if(got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return null;
  try{
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if(payload.exp && Date.now() > payload.exp) return null;
    return payload;
  }catch(e){ return null; }
}

function makeUserToken(user){
  return signToken({ uid:user.id, phone:user.phone, exp:Date.now() + 30*24*60*60*1000 });
}

function sanitizeProfile(profile){
  profile = profile && typeof profile === 'object' ? profile : {};
  const date = String(profile.date || '').trim();
  const hourRaw = profile.hour === '' || profile.hour === null || profile.hour === undefined ? null : parseInt(profile.hour, 10);
  const genderRaw = String(profile.gender || '').trim();
  const gender = genderRaw.indexOf('女') >= 0 ? '女' : '男';
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    hour: Number.isFinite(hourRaw) && hourRaw >= 0 && hourRaw <= 23 ? hourRaw : null,
    timeLabel: String(profile.timeLabel || '').trim().slice(0, 30),
    gender,
    birthplace: String(profile.birthplace || '').trim().slice(0, 80),
    privacy_notice_accepted: !!profile.privacy_notice_accepted
  };
}

function publicUser(user){
  return {
    id: user.id,
    phone: user.phone,
    profile: user.profile || {},
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

function requireUser(req, res, next){
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = readToken(token);
  if(!payload || !payload.uid) return res.status(401).json({ok:false,message:'请先登录'});
  const users = loadUsers();
  const user = users.find(u => u.id === payload.uid);
  if(!user) return res.status(401).json({ok:false,message:'登录已失效，请重新登录'});
  req.users = users;
  req.user = user;
  next();
}

app.post('/api/auth/register',(req,res)=>{
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');
  if(!/^\d{6,20}$/.test(phone)) return res.json({ok:false,message:'请输入有效手机号'});
  if(password.length < 6) return res.json({ok:false,message:'密码至少 6 位'});
  const users = loadUsers();
  if(users.some(u => u.phone === phone)) return res.json({ok:false,message:'该手机号已注册，请直接登录'});
  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    phone,
    password: createPasswordRecord(password),
    profile: sanitizeProfile(req.body.profile),
    created_at: now,
    updated_at: now
  };
  users.push(user);
  saveUsers(users);
  res.json({ok:true,token:makeUserToken(user),user:publicUser(user)});
});

app.post('/api/auth/login',(req,res)=>{
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');
  const users = loadUsers();
  const user = users.find(u => u.phone === phone);
  if(!user || !verifyPassword(password, user)) return res.json({ok:false,message:'手机号或密码不正确'});
  user.last_login_at = new Date().toISOString();
  saveUsers(users);
  res.json({ok:true,token:makeUserToken(user),user:publicUser(user)});
});

app.get('/api/auth/me', requireUser, (req,res)=>{
  res.json({ok:true,user:publicUser(req.user)});
});

app.post('/api/auth/profile', requireUser, (req,res)=>{
  req.user.profile = sanitizeProfile(req.body.profile);
  req.user.updated_at = new Date().toISOString();
  saveUsers(req.users);
  res.json({ok:true,user:publicUser(req.user)});
});

app.post('/api/auth/logout',(req,res)=>{
  res.json({ok:true});
});

// ═══ 安全：静态文件（禁止目录浏览，隐藏敏感文件） ═══
// 明确屏蔽敏感路径（优先于 static）
app.use(['/data', '/proxy.js', '/package.json', '/package-lock.json', '/.env'], (req, res) => {
  res.status(403).send('Forbidden');
});
// data 子路径也屏蔽
app.use((req, res, next) => {
  if(req.path.startsWith('/data/')) return res.status(403).send('Forbidden');
  next();
});

// fengshui.html 动态注入令牌（防止直接读取 app.js 获得 token）
app.get(['/', '/fengshui.html'], (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'fengshui.html'), 'utf8');
  // 将令牌注入到 <head> 中，作为全局变量
  const injected = html.replace(
    '<head>',
    `<head><script>window.__CMA_T='${INTERNAL_TOKEN}';</script>`
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store'); // 禁止缓存（确保每次都重新注入）
  res.send(injected);
});

app.use(express.static(__dirname, {
  dotfiles: 'deny',
  index: false,
}));

// ═══ 八字精确算法引擎 ═══
const GAN    = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI    = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const GAN_WX = ['木','木','火','火','土','土','金','金','水','水'];
const ZHI_WX = ['水','土','木','木','土','火','火','土','金','金','土','水'];
const ZHI_HIDDEN = [
  ['壬','癸'],['己','癸','辛'],['甲','丙','戊'],['乙'],
  ['戊','乙','癸'],['丙','庚','戊'],['丁','己'],['己','丁','乙'],
  ['庚','壬','戊'],['辛'],['戊','辛','丁'],['壬','甲']
];

function julianDay(y,m,d){
  const a=Math.floor((14-m)/12),yr=y+4800-a,mo=m+12*a-3;
  return d+Math.floor((153*mo+2)/5)+365*yr+Math.floor(yr/4)-Math.floor(yr/100)+Math.floor(yr/400)-32045;
}
const JD_BASE = julianDay(1949,10,1); // 甲子日基准（已验证：2024-01-01亦为甲子日，差27120天=60×452）

function getJieqiDay(year,month){
  const tbl=[
    [6.9789,0.3306],[4.8353,0.2423],[6.3306,0.2423],[5.1526,0.2423],
    [5.3589,0.2423],[6.0376,0.2423],[7.1781,0.2422],[7.2588,0.2423],
    [8.1568,0.2423],[8.1890,0.2422],[7.3876,0.2422],[7.4101,0.2422],
  ];
  const [base,slope]=tbl[month-1];
  return Math.floor(base+slope*(year-1900)-Math.floor((year-1900)/4));
}

function getDayPillar(y,m,d){
  const diff=julianDay(y,m,d)-JD_BASE;
  const gi=((diff%10)+10)%10, zi=((diff%12)+12)%12;
  return {gan:GAN[gi],zhi:ZHI[zi],gi,zi,ganWx:GAN_WX[gi],zhiWx:ZHI_WX[zi]};
}

function getYearPillar(y,m,d){
  const lichun=getJieqiDay(y,2);
  const eff=(m>2||(m===2&&d>=lichun))?y:y-1;
  const gi=((eff-1864)%10+10)%10, zi=((eff-1864)%12+12)%12;
  return {gan:GAN[gi],zhi:ZHI[zi],gi,zi,ganWx:GAN_WX[gi],zhiWx:ZHI_WX[zi]};
}

function getMonthPillar(y,m,d,yearGi){
  const nodeDay=getJieqiDay(y,m);
  const afterZhi =[1,2,3,4,5,6,7,8,9,10,11,0];
  const beforeZhi=[0,1,2,3,4,5,6,7, 8, 9,10,11];
  const zi=d>=nodeDay?afterZhi[m-1]:beforeZhi[m-1];
  const gi=((yearGi%5)*2+2+(zi-2+12)%12)%10;
  return {gan:GAN[gi],zhi:ZHI[zi],gi,zi,ganWx:GAN_WX[gi],zhiWx:ZHI_WX[zi]};
}

function getHourPillar(hour,dayGi){
  if(hour===null||hour===undefined)return null;
  const zi=Math.floor(((hour+1)%24)/2);
  const gi=((dayGi%5)*2+zi)%10;
  return {gan:GAN[gi],zhi:ZHI[zi],gi,zi,ganWx:GAN_WX[gi],zhiWx:ZHI_WX[zi]};
}

function calcWuxing(pillars){
  const s={木:0,火:0,土:0,金:0,水:0};
  pillars.filter(Boolean).forEach(p=>{
    s[p.ganWx]+=2; s[p.zhiWx]+=1.5;
    ZHI_HIDDEN[p.zi].forEach((g,i)=>{ s[GAN_WX[GAN.indexOf(g)]]+=[1,0.5,0.3][i]||0; });
  });
  const tot=Object.values(s).reduce((a,b)=>a+b,0);
  return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,Math.round(v/tot*100)]));
}

function calcStrength(dayGi,pillars){
  const wx=GAN_WX[dayGi];
  const sheng={木:'水',火:'木',土:'火',金:'土',水:'金'};
  let h=0,n=0;
  pillars.filter(Boolean).forEach(p=>{
    const all=[p.ganWx,p.zhiWx,...ZHI_HIDDEN[p.zi].map(g=>GAN_WX[GAN.indexOf(g)])];
    all.forEach(w=>{ if(w===wx)h+=1.5; else if(w===sheng[wx])h+=1; else n+=0.8; });
  });
  return h>=n?'strong':'weak';
}

function calcDayun(y,m,d,yearGi,mGi,mZi,gender){
  const yang=yearGi%2===0;
  const fwd=(yang&&gender!=='女')||(!yang&&gender==='女');
  const nd=getJieqiDay(y,m);
  let days;
  if(fwd){
    if(d<nd){days=nd-d;}
    else{
      const nm=m===12?1:m+1,ny=m===12?y+1:y;
      days=Math.round((new Date(ny,nm-1,getJieqiDay(ny,nm))-new Date(y,m-1,d))/86400000);
    }
  } else {
    if(d>=nd){days=d-nd;}
    else{
      const pm=m===1?12:m-1,py=m===1?y-1:y;
      days=Math.round((new Date(y,m-1,d)-new Date(py,pm-1,getJieqiDay(py,pm)))/86400000);
    }
  }
  const startAge=Math.max(1,Math.round(days/3));
  return {
    startAge,
    dayuns: Array.from({length:8},(_,i)=>{
      const dir=fwd?i+1:-(i+1);
      const gi=((mGi+dir)%10+10)%10, zi=((mZi+dir)%12+12)%12;
      return {label:GAN[gi]+ZHI[zi],gi,zi,age:startAge+i*10,year:y+startAge+i*10,ganWx:GAN_WX[gi],zhiWx:ZHI_WX[zi]};
    })
  };
}

function getYearGz(yr){
  return GAN[((yr-1864)%10+10)%10]+ZHI[((yr-1864)%12+12)%12];
}

function calcBazi(year,month,day,hour,gender){
  const yp=getYearPillar(year,month,day);
  const mp=getMonthPillar(year,month,day,yp.gi);
  const dp=getDayPillar(year,month,day);
  const hp=getHourPillar(hour,dp.gi);
  const all=[yp,mp,dp,hp].filter(Boolean);
  const wuxing=calcWuxing(all);
  const strength=calcStrength(dp.gi,all);
  const sheng={木:'水',火:'木',土:'火',金:'土',水:'金'};
  const keWo={木:'金',火:'水',土:'木',金:'火',水:'土'};
  const woSheng={木:'火',火:'土',土:'金',金:'水',水:'木'};
  const dayWx=GAN_WX[dp.gi];
  const yong=strength==='weak'?[sheng[dayWx],dayWx]:[woSheng[dayWx],keWo[dayWx]];
  const ji  =strength==='weak'?[woSheng[dayWx],keWo[dayWx]]:[sheng[dayWx],dayWx];
  const dayun=calcDayun(year,month,day,yp.gi,mp.gi,mp.zi,gender||'男');
  const now=new Date().getFullYear(), age=now-year;
  const curDayun=dayun.dayuns.find((d,i)=>age>=d.age&&(i===dayun.dayuns.length-1||age<dayun.dayuns[i+1].age))||dayun.dayuns[0];
  const nowYears=[now-1,now,now+1,now+2].map(yr=>({yr,gz:getYearGz(yr),ganWx:GAN_WX[((yr-1864)%10+10)%10],zhiWx:ZHI_WX[((yr-1864)%12+12)%12]}));
  return {
    pillars:{
      year: {gan:yp.gan,zhi:yp.zhi,element:yp.ganWx+yp.zhiWx},
      month:{gan:mp.gan,zhi:mp.zhi,element:mp.ganWx+mp.zhiWx},
      day:  {gan:dp.gan,zhi:dp.zhi,element:dp.ganWx+dp.zhiWx},
      hour: hp?{gan:hp.gan,zhi:hp.zhi,element:hp.ganWx+hp.zhiWx}:{gan:'不详',zhi:'不详',element:'不详'}
    },
    daymaster:`${dp.gan}（${dayWx}）`,
    dayWx, strength,
    wuxing,
    yongShen:yong.join('、'),
    jiShen:ji.join('、'),
    dayun:{
      startAge:dayun.startAge,
      current:curDayun?curDayun.label:'未知',
      currentWx:(curDayun?curDayun.ganWx:'')+'、'+(curDayun?curDayun.zhiWx:''),
      list:dayun.dayuns.map(d=>({label:d.label,age:d.age,year:d.year}))
    },
    nowYears,
    meta:{year,month,day,hour,gender}
  };
}

// ═══ Groq API 调用 ═══
async function callGroq(messages, maxTokens=2000, model='llama-3.3-70b-versatile'){
  const apiKey=providerKey('groq');
  if(!apiKey) throw new Error('请设置环境变量 GROQ_API_KEY');
  const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
    body:JSON.stringify({model,max_tokens:maxTokens,temperature:0.7,messages})
  });
  const data=await res.json();
  if(data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content||'';
}

// ═══ OpenRouter API 调用（兼容 Claude / Llama 等所有模型） ═══
async function callOpenRouter(messages, maxTokens=4000, model='anthropic/claude-opus-4.6'){
  const apiKey=providerKey('openrouter');
  if(!apiKey) throw new Error('请设置环境变量 OPENROUTER_API_KEY（openrouter.ai 免费注册）');
  const res=await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+apiKey,
      'HTTP-Referer':'http://localhost:3366',
      'X-Title':'Cyber Metaphysics Architect'
    },
    body:JSON.stringify({model,max_tokens:maxTokens,temperature:0.7,messages})
  });
  const data=await res.json();
  if(data.error) throw new Error(data.error.message||JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content||'';
}

// ═══ 统一调度：根据 model 参数路由到对应 LLM ═══
async function callLLM(messages, maxTokens=2000, config='groq'){
  const provider = typeof config === 'object' ? config.provider : (config === 'groq' ? 'groq' : 'openrouter');
  const model = typeof config === 'object' ? config.model : (config || 'llama-3.3-70b-versatile');
  if(provider === 'groq'){
    // Groq 不支持视觉，剥离图片内容后调用
    const textMsgs=messages.map(m=>({
      role:m.role,
      content:typeof m.content==='string'?m.content:
        Array.isArray(m.content)?m.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'):m.content
    }));
    return callGroq(textMsgs,maxTokens,model || 'llama-3.3-70b-versatile');
  }
  return callOpenRouter(messages,maxTokens,model);
}

// ═══ 健壮 JSON 提取：去除 markdown 代码围栏后再解析 ═══
function extractJSON(text){
  // 去除 ```json ... ``` 或 ``` ... ``` 包裹
  const stripped = text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if(s<0||e<=s) throw new Error('No JSON object found');
  return JSON.parse(stripped.substring(s, e+1));
}
function safeExtractJSON(text){
  try{ return extractJSON(text); }catch(e){}
  const t = String(text || '').trim();
  try{
    const parsed = JSON.parse(t);
    if(typeof parsed === 'string') return safeExtractJSON(parsed);
    return parsed;
  }catch(e){}
  return null;
}
function cleanJsonishText(text){
  return String(text || '')
    .replace(/```json\s*/gi,'')
    .replace(/```\s*/g,'')
    .trim();
}
function pickJsonishField(text, key){
  const t = cleanJsonishText(text);
  const re = new RegExp('"' + key + '"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"(category|need_birth|summary|analysis|actions|timing|upgrade_hint|consult_hint)"\\s*:', 'i');
  const m = t.match(re);
  if(m) return m[1].replace(/\\"/g,'"').trim();
  const tail = new RegExp('"' + key + '"\\s*:\\s*"([\\s\\S]*?)"\\s*\\}?\\s*$', 'i').exec(t);
  return tail ? tail[1].replace(/\\"/g,'"').trim() : '';
}
function pickJsonishActions(text){
  const t = cleanJsonishText(text);
  const m = t.match(/"actions"\s*:\s*\[([\s\S]*?)\]\s*,\s*"(timing|upgrade_hint|consult_hint)"\s*:/i) ||
    t.match(/"actions"\s*:\s*\[([\s\S]*?)\]\s*\}?$/i);
  if(!m) return [];
  const actions = [];
  let item;
  const re = /"([\s\S]*?)"\s*(?:,|$)/g;
  while((item = re.exec(m[1]))){
    const val = item[1].replace(/\\"/g,'"').trim();
    if(val) actions.push(val);
  }
  return actions;
}
function tolerantQuickAskObject(text){
  const t = cleanJsonishText(text);
  if(!/^\s*\{/.test(t) || t.indexOf('"analysis"') < 0) return null;
  const parsed = {};
  ['category','summary','analysis','timing','upgrade_hint','consult_hint'].forEach(k => {
    const v = pickJsonishField(t, k);
    if(v) parsed[k] = v;
  });
  parsed.need_birth = /"need_birth"\s*:\s*true/i.test(t);
  parsed.actions = pickJsonishActions(t);
  return parsed.analysis || parsed.summary || parsed.actions.length ? parsed : null;
}
function normalizeQuickAskResult(data, rawText){
  let d = data || safeExtractJSON(rawText) || tolerantQuickAskObject(rawText) || {};
  if(typeof d === 'string') d = safeExtractJSON(d) || tolerantQuickAskObject(d) || { analysis:d };
  ['summary','analysis','upgrade_hint','consult_hint','timing'].forEach(k => {
    if(typeof d[k] === 'string'){
      const nested = safeExtractJSON(d[k]) || tolerantQuickAskObject(d[k]);
      if(nested && (nested.analysis || nested.summary)) d = {...d, ...nested};
    }
  });
  if(!d.summary) d.summary = '已完成问事判断';
  if(!d.analysis) d.analysis = String(rawText || '').replace(/```json|```/g,'').slice(0, 1200);
  if(typeof d.analysis === 'object') d.analysis = JSON.stringify(d.analysis);
  if(!Array.isArray(d.actions)) d.actions = d.actions ? [String(d.actions)] : [];
  d.analysis = cleanJsonishText(d.analysis);
  if(/^\s*\{/.test(d.analysis) && d.analysis.indexOf('"analysis"') >= 0){
    const nested = tolerantQuickAskObject(d.analysis);
    if(nested) d = {...d, ...nested};
  }
  return d;
}

function classifyQuestion(question){
  const q = String(question || '').toLowerCase();
  const has = (words) => words.some(w => q.includes(w));
  if(has(['合盘','合婚','配不配','适不适合在一起','复合'])) return { category:'compatibility', label:'合盘/关系匹配', birth:'required' };
  if(has(['流年','今年','明年','未来','三个月','半年','月运','运势','转运','不顺','低谷'])) return { category:'fortune', label:'运势趋势', birth:'required' };
  if(has(['财运','求财','赚钱','投资','破财','副业','涨薪','收入'])) return { category:'wealth', label:'财富运势', birth:'required' };
  if(has(['事业','工作','跳槽','创业','面试','升职','合作'])) return { category:'career', label:'事业决策', birth:'required' };
  if(has(['感情','婚姻','恋爱','桃花','结婚','离婚','对象'])) return { category:'relationship', label:'感情婚恋', birth:'required' };
  if(has(['签约','合同','开业','搬家','入宅','领证','提车','装修','动土','表白','见客户','今天','明天','日期','吉日','吉时'])) return { category:'timing', label:'今日/择日决策', birth:'optional' };
  if(has(['梦到','做梦','梦见','梦里'])) return { category:'dream', label:'梦境解析', birth:'none' };
  if(has(['户型','房子','住宅','卧室','客厅','厨房','办公桌','镜子','床头','财位','朝向','风水'])) return { category:'fengshui', label:'家宅风水', birth:'none' };
  return { category:'general', label:'综合问事', birth:'optional' };
}

function buildBaziContext(birth){
  if(!birth || !birth.date) return null;
  const parts = String(birth.date).split('-').map(n => parseInt(n, 10));
  if(parts.length !== 3 || parts.some(n => !n)) return null;
  const hour = birth.hour !== null && birth.hour !== undefined && birth.hour !== '' ? parseInt(birth.hour, 10) : null;
  const gender = birth.gender || '男';
  const bazi = calcBazi(parts[0], parts[1], parts[2], Number.isNaN(hour) ? null : hour, gender);
  return {
    birthContext: `出生日期：${birth.date}；出生时辰：${birth.timeLabel || (hour == null ? '不详' : hour + '时')}；性别：${gender}；出生地：${birth.birthplace || '未填写'}`,
    baziContext: `四柱：年${bazi.pillars.year.gan}${bazi.pillars.year.zhi} 月${bazi.pillars.month.gan}${bazi.pillars.month.zhi} 日${bazi.pillars.day.gan}${bazi.pillars.day.zhi} 时${bazi.pillars.hour.gan}${bazi.pillars.hour.zhi}
日主：${bazi.daymaster}，身${bazi.strength === 'strong' ? '强' : '弱'}；五行：木${bazi.wuxing['木']}% 火${bazi.wuxing['火']}% 土${bazi.wuxing['土']}% 金${bazi.wuxing['金']}% 水${bazi.wuxing['水']}%；喜用：${bazi.yongShen}；忌：${bazi.jiShen}
当前大运：${bazi.dayun.current}；近年流年：${bazi.nowYears.map(y => `${y.yr}年${y.gz}(${y.ganWx}${y.zhiWx})`).join(' ')}`
  };
}

function hasModelKey(config){
  const provider = typeof config === 'object' ? config.provider : (config === 'groq' ? 'groq' : 'openrouter');
  return !!providerKey(provider);
}

function buildQuickAskFallback(question, cls, hasBirth){
  const reason = {
    timing: '这类问题主要看事项性质、当天宜忌、合同风险和执行时段。',
    dream: '梦境类问题更适合从醒后情绪、重复意象和现实压力源来判断。',
    fengshui: '空间类问题需要先看门窗、动线、床桌沙发位置、采光和朝向。',
    wealth: '财运问题不能只看“旺不旺”，要拆成收入结构、破财点和近期节奏。',
    career: '事业问题要同时看现实筹码、合作关系、现金流和行动窗口。',
    relationship: '感情问题应先区分关系阶段，再看沟通稳定性和实际行动。',
    fortune: '运势问题要拆成事业、财务、感情、健康和环境，不宜泛泛归因。',
    compatibility: '合盘匹配需要双方出生信息，否则只能做关系风险与沟通建议。',
    general: '综合问题需要先明确时间、对象、事项、风险和你想得到的结果。'
  };
  const commonActions = {
    timing: ['先确认事项是否必须今天完成，非刚需可优先选择上午沟通。', '签约、付款、开业类事项建议避开情绪波动时段，先复核关键条款。', '如金额较大，可补充出生信息后做个人择时增强分析。'],
    dream: ['记录梦中最强烈的意象和醒来情绪，先判断它对应压力、关系还是财务主题。', '今天避免因梦境直接做重大决定，先观察现实中是否有相同信号。', '如果同类梦反复出现，可继续做梦境深度解析。'],
    fengshui: ['先补充户型、朝向、门窗、床/桌/沙发位置，判断会更准确。', '优先检查门窗对冲、床头无靠、镜子对床、横梁压顶这些高频问题。', '涉及买房、装修、办公位调整时，建议上传图片做完整风水诊断。'],
    wealth: ['先区分这是短期求财、长期收入，还是破财风险问题。', '近期不要只看单一机会，先复盘收入来源、支出漏洞和合作风险。', '财运类问题建议补充出生信息，结合财星、流年、大运分析。'],
    career: ['先明确当前是跳槽、升职、创业还是合作选择，不同问题判断标准不同。', '短期先看现实筹码：资源、现金流、贵人支持和风险承受力。', '事业类问题建议补充出生信息，结合命理趋势做增强判断。'],
    relationship: ['先区分关系处在暧昧、磨合、冲突还是决策阶段。', '今天不建议只凭情绪做结论，先看对方行动是否稳定。', '感情婚恋类问题补充出生信息后，可进一步看关系节奏与适配度。'],
    fortune: ['先把“不顺”拆成事业、财务、感情、健康或家宅环境，避免泛泛判断。', '短期先减少高风险决策，优先处理拖延事项和反复出错的环节。', '运势趋势类问题需要出生信息，结合流年/月运判断会更有价值。'],
    compatibility: ['合盘类问题需要双方出生信息，单靠一句描述只能做关系沟通建议。', '先观察价值观、金钱观、家庭边界和冲突处理方式。', '建议补充双方生日后做合盘或真人咨询。'],
    general: ['先把问题具体化为时间、对象、事项和你担心的结果。', '能马上验证的信息先用现实依据判断，玄学分析适合做辅助决策。', '如果问题牵涉长期运势，可补充出生信息做增强分析。']
  };
  const actions = commonActions[cls.category] || commonActions.general;
  return {
    category: cls.category,
    need_birth: cls.birth === 'required' && !hasBirth,
    summary: hasBirth ? '先稳住节奏，再看行动窗口。' : '先做基础判断，重大事再增强。',
    analysis: `你的问题属于“${cls.label}”。${reason[cls.category] || reason.general}当前可先按现实决策处理：确认这件事是否紧急、成本是否高、是否可逆、是否需要他人配合。${hasBirth ? '已补充出生信息时，后续可进一步结合命盘、流年与喜忌做个人化判断。' : '如果要判断长期运势、财运、事业或感情走势，需要补充出生日期、时辰和性别。'}本次问题：“${question}”。`,
    actions,
    timing: cls.category === 'timing' ? '普通择事可先看今日宜忌；重大事项建议进一步做个人择日。' : '',
    upgrade_hint: cls.birth === 'none' ? '可继续进入对应专题做深度分析。' : '补充出生信息后，可解锁命理增强分析或专题报告。',
    consult_hint: '涉及买房、投资、婚姻、开业等高成本决策时，建议真人咨询。',
    fallback: true
  };
}

// ═══ 通用聊天接口（解梦、黄历、风水、追问） ═══
app.post('/api/chat', requireToken, async(req,res)=>{
  try{
    const rawMsgs = req.body.messages;
    if(!Array.isArray(rawMsgs) || rawMsgs.length === 0 || rawMsgs.length > 12)
      return res.status(400).json({ error: { message: '无效请求' } });

    const msgs = rawMsgs.map(m => {
      const role = String(m.role||'').slice(0, 10);
      let content = m.content;
      if(typeof content === 'string') content = content.slice(0, 12000);
      else if(Array.isArray(content)){
        content = content.slice(0, 6).map(b => {
          if(b.type === 'text') return { type: 'text', text: String(b.text||'').slice(0, 8000) };
          if(b.type === 'image_url') return { type: 'image_url', image_url: { url: String(b.image_url?.url||'') } };
          return null;
        }).filter(Boolean);
      }
      return { role, content };
    });

    const hasImages = msgs.some(m => Array.isArray(m.content) && m.content.some(b => b.type === 'image_url'));
    const moduleKey = String(req.body.module_key || (hasImages ? 'fengshui' : 'followup'));
    const model = modelConfigFor(moduleKey, req.body.allow_model_override ? req.body.selected_model : null);
    const maxTok = Math.min(parseInt(req.body.max_tokens) || 4000, 6000);
    const text = await callLLM(msgs, maxTok, model);
    res.json({ content: [{ type: 'text', text }] });
  } catch(e) { res.status(500).json({ error: { message: '分析服务暂时不可用，请稍后重试' } }); }
});

// ═══ 快捷问事：先分类，再按资料完整度调用对应 Prompt ═══
app.post('/api/quick-ask', requireToken, async(req,res)=>{
  try{
    const question = String(req.body.question || '').trim().slice(0, 500);
    if(!question) return res.status(400).json({ error: { message: '请先输入要问的事情' } });

    const cls = classifyQuestion(question);
    const birthInfo = buildBaziContext(req.body.birth || null);
    if(cls.birth === 'required' && !birthInfo){
      return res.json({
        ok: true,
        needs_birth: true,
        category: cls.category,
        category_label: cls.label,
        message: '这个问题需要结合个人命理判断，请先补充出生日期、时辰和性别。'
      });
    }

    const useBazi = !!birthInfo && cls.birth !== 'none';
    const promptTpl = getPrompt(useBazi ? 'quick_ask_bazi' : 'quick_ask_general');
    const vars = {
      current_date: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      question,
      category: cls.category,
      category_label: cls.label,
      birth_context: birthInfo?.birthContext || '',
      bazi_context: birthInfo?.baziContext || ''
    };
    const prompt = renderTemplate(promptTpl?.content, vars);
    let model = modelConfigFor('quick_ask', req.body.allow_model_override ? req.body.selected_model : null);
    if(!hasModelKey(model) && hasModelKey({provider:'groq',model:'llama-3.3-70b-versatile'})) model = {provider:'groq',model:'llama-3.3-70b-versatile'};
    if(!hasModelKey(model)){
      return res.json({
        ok:true,
        needs_birth:false,
        category:cls.category,
        category_label:cls.label,
        data:buildQuickAskFallback(question, cls, !!birthInfo),
        warning:'模型 API Key 未配置，已返回本地基础版结果。'
      });
    }
    const text = await callLLM([{ role:'user', content: prompt }], 2500, model);
    const data = normalizeQuickAskResult(null, text);
    res.json({ ok:true, needs_birth:false, category:cls.category, category_label:cls.label, data });
  }catch(e){
    res.status(500).json({ error: { message: '快捷问事服务暂时不可用，请稍后重试' } });
  }
});

// ═══ Prompt 渲染：前端功能统一从后台模板取指令 ═══
app.post('/api/prompt/render', requireToken, (req,res)=>{
  try{
    const key = String(req.body.key || '').trim();
    if(!key) return res.status(400).json({ error: { message: '缺少 Prompt key' } });
    const tpl = getPrompt(key);
    if(!tpl) return res.status(404).json({ error: { message: '找不到 Prompt 模板' } });
    const vars = req.body.vars && typeof req.body.vars === 'object' ? req.body.vars : {};
    const safeVars = {};
    Object.keys(vars).slice(0, 30).forEach(k => {
      const val = vars[k];
      safeVars[k] = Array.isArray(val) ? val.join('、') : String(val == null ? '' : val).slice(0, 8000);
    });
    res.json({ ok:true, key, prompt:renderTemplate(tpl.content, safeVars), updated_at:tpl.updated_at || null });
  }catch(e){
    res.status(500).json({ error: { message: 'Prompt 渲染失败' } });
  }
});

// ═══ 八字命盘接口（三 Agent 架构：格局师 + 运程师 → 综合顾问） ═══
app.post('/api/bazi', requireToken, async(req,res)=>{
  try{
    const {year,month,day,hour,gender}=req.body;
    const y=parseInt(year), mo=parseInt(month), d=parseInt(day);
    if(!y||!mo||!d||y<1920||y>2010||mo<1||mo>12||d<1||d>31)
      return res.status(400).json({error:{message:'生辰信息无效'}});

    const bazi=calcBazi(y, mo, d,
      hour!==null&&hour!==undefined?parseInt(hour):null, gender||'男');
    const model=modelConfigFor('bazi', req.body.allow_model_override ? req.body.selected_model : null);

    // 公共命盘上下文
    const ctx=`【四柱】年${bazi.pillars.year.gan}${bazi.pillars.year.zhi} 月${bazi.pillars.month.gan}${bazi.pillars.month.zhi} 日${bazi.pillars.day.gan}${bazi.pillars.day.zhi} 时${bazi.pillars.hour.gan}${bazi.pillars.hour.zhi}
【五行分布】木${bazi.wuxing['木']}% 火${bazi.wuxing['火']}% 土${bazi.wuxing['土']}% 金${bazi.wuxing['金']}% 水${bazi.wuxing['水']}%
【日主】${bazi.daymaster}，身${bazi.strength==='strong'?'强':'弱'}，算法喜神：${bazi.yongShen}，算法忌神：${bazi.jiShen}
【大运序列】${bazi.dayun.startAge}岁起运，当前大运：${bazi.dayun.current}，序列：${bazi.dayun.list.slice(0,4).map(d=>d.label+'('+d.age+'岁)').join(' ')}
【近年流年】${bazi.nowYears.map(y=>`${y.yr}年${y.gz}(${y.ganWx}${y.zhiWx})`).join(' ')}
【性别】${bazi.meta.gender}`;

    // ── Agent 1：八字格局分析师 ──────────────────────────────────
    const p1=`你是资深八字格局分析师，专精命盘结构解析。禁用”算命/迷信”，用”能量建模/时空规律”。语气严谨专业。

${ctx}

你的任务：深度分析此命盘的格局结构、日主能量、喜忌神体系。
要求：结合藏干、月令司权、五行生克制化进行精准判断，不泛泛而论。

只返回JSON，不输出其他内容：
{“pattern”:”格局名（如正官格/食神格/从财格等）”,”pattern_reason”:”格局成立依据，引用具体柱位说明，40字”,”strength_reason”:”日主强弱判断依据，引用月令及帮扶力量，40字”,”yong_shen”:”喜用神（一到两个五行）”,”ji_shen”:”忌神（一到两个五行）”,”shen_reason”:”喜忌逻辑推导，说明为何喜此忌彼，50字”,”character”:”根据格局与日主推断的性格特质，60字，具体到行为倾向”,”energy_model”:”五行能量场整体描述，指出最强与最弱五行及其影响，40字”,”pattern_diagnosis”:”格局利弊分析，说明此格局的人生优势与局限，50字”,”findings”:[{“type”:”good”,”text”:”命盘最突出的正面特质，30字”,”suggestion”:”如何放大此优势”},{“type”:”warn”,”text”:”命盘潜在风险或缺陷，30字”,”suggestion”:”化解或规避建议”}]}`;

    // ── Agent 2：大运流年运程师 ────────────────────────────────────
    const p2=`你是专精大运流年分析的命理运程师。禁用”算命/迷信”，用”能量建模/时空规律”。语气冷静直接。

${ctx}

你的任务：精准分析当前大运与近三年流年的能量走势，给出具体时间节点预判。
要求：结合大运天干地支与流年的生克冲合关系，给出实质性的吉凶判断，不模棱两可。

只返回JSON，不输出其他内容：
{“current_dayun”:”${bazi.dayun.current}大运深度解读，分析大运干支对日主的影响，60字”,”yearly_fortune”:[{“year”:”${bazi.nowYears[0]?.yr||2025}”,”ganzhi”:”${bazi.nowYears[0]?.gz||''}”,”forecast”:”该流年与日主、大运的能量互动，吉凶判断要明确，50字”,”key_period”:”该年最关键的月份或事件节点，15字”,”rating”:”${bazi.nowYears[0]?.ganWx||''}与喜忌关系决定：good/warn/bad”},{“year”:”${bazi.nowYears[1]?.yr||2026}”,”ganzhi”:”${bazi.nowYears[1]?.gz||''}”,”forecast”:”该流年与日主、大运的能量互动，50字”,”key_period”:”关键节点，15字”,”rating”:”good/warn/bad”},{“year”:”${bazi.nowYears[2]?.yr||2027}”,”ganzhi”:”${bazi.nowYears[2]?.gz||''}”,”forecast”:”该流年与日主、大运的能量互动，50字”,”key_period”:”关键节点，15字”,”rating”:”good/warn/bad”}],”risk_warning”:”未来三年最需警惕的能量冲突点，30字，要具体”}`;

    // 并行执行 Agent 1 & 2
    const [a1Text, a2Text]=await Promise.all([
      callLLM([{role:'user',content:p1}], 2500, model),
      callLLM([{role:'user',content:p2}], 2500, model),
    ]);
    let a1={}, a2={};
    try{ a1=extractJSON(a1Text); }catch(e){ console.error('Agent1 JSON解析失败'); }
    try{ a2=extractJSON(a2Text); }catch(e){ console.error('Agent2 JSON解析失败'); }

    // ── Agent 3：综合决策顾问（基于前两个Agent结果）────────────────
    const p3=`你是 Cyber Metaphysics Architect 综合决策顾问，整合命盘格局与运程分析，给出高价值的实操建议。语气像顶级私人顾问：冷静、精准、有洞见。

${ctx}

【格局分析师结论】格局：${a1.pattern||''}，日主${bazi.strength==='strong'?'身强':'身弱'}，喜${a1.yong_shen||bazi.yongShen}忌${a1.ji_shen||bazi.jiShen}
${a1.pattern_diagnosis?'格局诊断：'+a1.pattern_diagnosis:''}
【运程师结论】当前大运：${a2.current_dayun||bazi.dayun.current}，风险预警：${a2.risk_warning||''}

你的任务：基于以上两位专家的分析，给出落地可执行的人生决策建议、物理调候方案和风水布局指引，最后输出顾问总评。
要求：建议要具体可执行，不说废话，不重复前两个Agent的内容，聚焦”怎么做”。

只返回JSON，不输出其他内容：
{“decision_advice”:{“yi”:[“宜做的事1，具体说明”,”宜做的事2，具体说明”,”宜做的事3”],”ji”:[“忌做的事1，具体说明”,”忌做的事2，具体说明”]},”physical_remedy”:[“调候方案1（颜色/方位/物品等具体建议）”,”调候方案2”,”调候方案3”],”fengshui_intro”:”基于此命盘的风水布局总原则，40字”,”fengshui_advice”:{“lucky_dirs”:[“最吉方位及理由”],”lucky_colors”:[“吉利颜色及场景”],”lucky_items”:[“旺运物品及摆放位置”],”avoid_dirs”:[“需回避的方位及原因”]},”master_comment”:”顾问综合总评：整合格局、运程、建议三个维度，给出这套命盘最核心的人生主线判断与行动纲要，200字以上，语气有力”}`;

    const a3Text=await callLLM([{role:'user',content:p3}], 3000, model);
    let a3={};
    try{ a3=extractJSON(a3Text); }catch(e){ console.error('Agent3 JSON解析失败'); }

    res.json({
      ok: true,
      pillars: bazi.pillars,
      daymaster: bazi.daymaster,
      daymaster_strength: bazi.strength,
      elements: bazi.wuxing,
      dayun: bazi.dayun,
      // Agent 1：格局
      strength_reason:  a1.strength_reason||'',
      pattern:          a1.pattern||'',
      pattern_reason:   a1.pattern_reason||'',
      character:        a1.character||'',
      yong_shen:        a1.yong_shen||bazi.yongShen,
      ji_shen:          a1.ji_shen||bazi.jiShen,
      shen_reason:      a1.shen_reason||'',
      energy_model:     a1.energy_model||'',
      pattern_diagnosis:a1.pattern_diagnosis||'',
      findings:         a1.findings||[],
      // Agent 2：运程
      current_dayun:    a2.current_dayun||bazi.dayun.current,
      yearly_fortune:   a2.yearly_fortune||[],
      risk_warning:     a2.risk_warning||'',
      // Agent 3：建议
      decision_advice:  a3.decision_advice||{yi:[],ji:[]},
      physical_remedy:  a3.physical_remedy||[],
      fengshui_intro:   a3.fengshui_intro||'',
      fengshui_advice:  a3.fengshui_advice||{},
      master_comment:   a3.master_comment||'',
    });
  }catch(e){ res.status(500).json({error:{message:'分析服务暂时不可用，请稍后重试'}}); }
});

// ═══ 财运分析接口（三 Agent 架构：财格师 + 布局师 → 投资顾问） ═══
app.post('/api/wealth', requireToken, async(req,res)=>{
  try{
    const {year,month,day,hour,gender,goal}=req.body;
    const y=parseInt(year), mo=parseInt(month), d=parseInt(day);
    if(!y||!mo||!d||y<1920||y>2010||mo<1||mo>12||d<1||d>31)
      return res.status(400).json({error:{message:'生辰信息无效'}});

    const bazi=calcBazi(y, mo, d,
      hour!==null&&hour!==undefined?parseInt(hour):null, gender||'男');
    const wModel=modelConfigFor('wealth', req.body.allow_model_override ? req.body.selected_model : null);
    const goalStr=String(goal||'整体财运').slice(0,50);

    const wctx=`【四柱】年${bazi.pillars.year.gan}${bazi.pillars.year.zhi} 月${bazi.pillars.month.gan}${bazi.pillars.month.zhi} 日${bazi.pillars.day.gan}${bazi.pillars.day.zhi} 时${bazi.pillars.hour.gan}${bazi.pillars.hour.zhi}
【五行分布】木${bazi.wuxing['木']}% 火${bazi.wuxing['火']}% 土${bazi.wuxing['土']}% 金${bazi.wuxing['金']}% 水${bazi.wuxing['水']}%
【日主】${bazi.daymaster}，身${bazi.strength==='strong'?'强':'弱'}，喜：${bazi.yongShen}，忌：${bazi.jiShen}
【当前大运】${bazi.dayun.current}，近年流年：${bazi.nowYears.map(y=>`${y.yr}年${y.gz}`).join(' ')}
【分析目标】${goalStr}`;

    // ── Agent 1：八字财格命理师 ────────────────────────────────────
    const wp1=`你是专精八字财格分析的命理师。禁用"算命/迷信"，用"能量建模/时空规律"。语气专业直接。

${wctx}

你的任务：精准判断此命盘的财格类型、财星能量状态、正偏财特点，评估整体财运潜力。
要求：结合日主强弱、财星位置、官印食伤的护财/泄财能力，给出有依据的评分。

只返回JSON，不输出其他内容：
{"score":"财运综合评分60-95的整数","score_reason":"评分依据，引用具体五行关系，40字","caige":"财格名称（如正财格/偏财格/从财格/财多身弱等）","caige_detail":"此财格的深度解析，说明财星旺衰、护财力量及财格优劣，80字","caige_findings":[{"type":"good","text":"财格优势特点，30字","suggestion":"放大建议"},{"type":"warn","text":"财格局限或风险，30字","suggestion":"规避建议"}],"zhengcai":"正财星能量分析：适合稳定收入、职业发展的方向，60字","piancai":"偏财星能量分析：适合投机、副业、偏门收入的机会，60字","energy_model":"财星五行能量场描述，30字","risk_warning":"财运最大风险点，具体指出克财或耗财的五行，30字"}`;

    // ── Agent 2：旺财风水布局师 ────────────────────────────────────
    const wp2=`你是专精风水布局与财运激活的旺财布局师。禁用"算命/迷信"，用"能量建模/时空规律"。语气实操导向。

${wctx}

你的任务：基于此命盘的喜用五行，给出精准的旺财方位布局、吉时选择、财运近三年走势。
要求：方位建议要有五行依据，不说"东南西北都可以"，要明确指出最优方位。

只返回JSON，不输出其他内容：
{"directions":[{"dir":"最旺财方位名称","element":"对应五行","role":"财神/文昌/贵人","how":"具体用法，20字"},{"dir":"次选方位","element":"对应五行","role":"功能","how":"用法"}],"layout":"旺财布局整体策略，说明主财位如何布置，80字","items":[{"name":"推荐物品","position":"摆放位置","effect":"激活效果"},{"name":"物品2","position":"位置","effect":"效果"},{"name":"物品3","position":"位置","effect":"效果"}],"items_detail":"使用注意事项，30字","physical_remedy":["旺财调整1，具体颜色/物品/方位","旺财调整2","旺财调整3"],"current_dayun":"当前大运${bazi.dayun.current}对财运的影响，50字","yearly_fortune":[{"year":"${bazi.nowYears[0]?.yr||2025}","ganzhi":"${bazi.nowYears[0]?.gz||''}","wealth_trend":"该年财星能量走势与机会窗口，50字","best_months":"旺财最佳月份，15字","rating":"根据流年五行与财星关系：good/warn/bad"},{"year":"${bazi.nowYears[1]?.yr||2026}","ganzhi":"${bazi.nowYears[1]?.gz||''}","wealth_trend":"财运走势，50字","best_months":"旺财月份，15字","rating":"good/warn/bad"},{"year":"${bazi.nowYears[2]?.yr||2027}","ganzhi":"${bazi.nowYears[2]?.gz||''}","wealth_trend":"财运走势，50字","best_months":"旺财月份，15字","rating":"good/warn/bad"}],"taboo":[{"item":"财运大忌1","reason":"五行冲突原因","solution":"化解方法"},{"item":"财运大忌2","reason":"原因","solution":"化解"}]}`;

    // 并行执行 Agent 1 & 2
    const [wa1Text, wa2Text]=await Promise.all([
      callLLM([{role:'user',content:wp1}], 2500, wModel),
      callLLM([{role:'user',content:wp2}], 2500, wModel),
    ]);
    let wa1={}, wa2={};
    try{ wa1=extractJSON(wa1Text); }catch(e){ console.error('WAgent1 JSON解析失败'); }
    try{ wa2=extractJSON(wa2Text); }catch(e){ console.error('WAgent2 JSON解析失败'); }

    // ── Agent 3：财运投资决策顾问（整合两个Agent结论）──────────────
    const wp3=`你是 Cyber Metaphysics Architect 财运投资决策顾问，整合财格分析与布局建议，为用户提供高价值的财务决策指引。语气像顶级财务顾问：自信、精准、直击核心。

${wctx}

【财格师分析】财格：${wa1.caige||''}，评分：${wa1.score||''}，主要风险：${wa1.risk_warning||''}
【布局师分析】最佳财位：${wa2.directions?.[0]?.dir||''}，近期大运影响：${wa2.current_dayun||''}

你的任务：整合两位专家结论，给出财运总评与最终行动方案，语气要有力，有观点，有态度。
要求：master_comment要体现三个维度——财格潜力判断、当前运势节点、核心行动建议，不少于200字。

只返回JSON，不输出其他内容：
{"master_comment":"财运总评：整合财格、运势、布局三个维度，给出这套命盘的财运核心判断与行动纲要，200字以上，有洞见有力度"}`;

    const wa3Text=await callLLM([{role:'user',content:wp3}], 2000, wModel);
    let wa3={};
    try{ wa3=extractJSON(wa3Text); }catch(e){ console.error('WAgent3 JSON解析失败'); }

    res.json({
      // Agent 1：财格
      score:          wa1.score||75,
      score_reason:   wa1.score_reason||'',
      caige:          wa1.caige||'',
      caige_detail:   wa1.caige_detail||'',
      caige_findings: wa1.caige_findings||[],
      zhengcai:       wa1.zhengcai||'',
      piancai:        wa1.piancai||'',
      energy_model:   wa1.energy_model||'',
      risk_warning:   wa1.risk_warning||'',
      // Agent 2：布局
      directions:     wa2.directions||[],
      layout:         wa2.layout||'',
      items:          wa2.items||[],
      items_detail:   wa2.items_detail||'',
      physical_remedy:wa2.physical_remedy||[],
      current_dayun:  wa2.current_dayun||bazi.dayun.current,
      yearly_fortune: wa2.yearly_fortune||[],
      taboo:          wa2.taboo||[],
      // Agent 3：总评
      master_comment: wa3.master_comment||'',
      bazi_summary:`${bazi.pillars.year.gan}${bazi.pillars.year.zhi}年 ${bazi.pillars.month.gan}${bazi.pillars.month.zhi}月 ${bazi.pillars.day.gan}${bazi.pillars.day.zhi}日`,
    });
  }catch(e){ res.status(500).json({error:{message:'分析服务暂时不可用，请稍后重试'}}); }
});

// ═══ 激活码系统（文件持久化） ═══
const CODES_FILE   = path.join(__dirname, 'data', 'codes.json');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'cma-admin-2026';

function loadCodes(){
  try{ if(fs.existsSync(CODES_FILE)) return JSON.parse(fs.readFileSync(CODES_FILE,'utf8')); }catch(e){}
  return [];
}
function saveCodes(codes){
  ensureDataDir();
  try{ fs.writeFileSync(CODES_FILE, JSON.stringify(codes,null,2),'utf8'); }
  catch(e){ console.error('保存激活码失败:',e.message); }
}
function randHex(){ return crypto.randomBytes(2).toString('hex').toUpperCase(); }
function genCode(credits, wechatName, note){
  const codes = loadCodes();
  const code  = `CMA-${randHex()}-${randHex()}`;
  const entry = { code, credits, wechat_name:wechatName||'未知', note:note||'',
    created_at:new Date().toISOString(), activated:false, activated_at:null, credits_used:0 };
  codes.push(entry);
  saveCodes(codes);
  return entry;
}

// 首次启动初始化测试码
(function initCodes(){
  if(!fs.existsSync(CODES_FILE)){
    saveCodes([
      {code:'CMA-TEST-UNLM',credits:-1, wechat_name:'无限测试',note:'无限次测试码',created_at:new Date().toISOString(),activated:false,activated_at:null,credits_used:0},
      {code:'CMA-TEST-0003',credits:3,  wechat_name:'体验测试', note:'3次测试码', created_at:new Date().toISOString(),activated:false,activated_at:null,credits_used:0},
    ]);
  }
})();

// 激活码兑换
app.post('/api/activate',(req,res)=>{
  const {code}=req.body;
  if(!code) return res.json({ok:false,message:'请输入激活码'});
  const upper=code.toUpperCase().trim();
  const codes=loadCodes();
  const entry=codes.find(c=>c.code===upper);
  if(!entry) return res.json({ok:false,message:'无效激活码，请检查后重试'});
  if(entry.activated && entry.credits!==-1) return res.json({ok:false,message:'该激活码已被使用'});
  entry.activated=true; entry.activated_at=new Date().toISOString();
  saveCodes(codes);
  res.json({ok:true,credits:entry.credits,unlimited:entry.credits===-1});
});

// 用量上报（每次分析成功后前端调用）
app.post('/api/use-credit',(req,res)=>{
  const {code}=req.body;
  if(!code) return res.json({ok:true});
  const upper=code.toUpperCase().trim();
  const codes=loadCodes();
  const entry=codes.find(c=>c.code===upper);
  if(entry){ entry.credits_used=(entry.credits_used||0)+1; saveCodes(codes); }
  res.json({ok:true});
});

// ═══ 管理后台 API ═══
function adminAuth(req,res){
  const secret=req.body?.secret||req.query?.secret;
  if(secret!==ADMIN_SECRET){res.status(403).json({ok:false,message:'密钥错误'});return false;}
  return true;
}
// 生成激活码
app.post('/api/admin/generate',(req,res)=>{
  if(!adminAuth(req,res))return;
  const {credits,wechat_name,note}=req.body;
  const cr=parseInt(credits);
  if(isNaN(cr)||![-1,3,10,30].includes(cr)) return res.json({ok:false,message:'无效次数'});
  const entry=genCode(cr,wechat_name,note);
  res.json({ok:true,entry});
});
// 查询所有激活码 + 统计
app.get('/api/admin/codes',(req,res)=>{
  if(!adminAuth(req,res))return;
  const codes=loadCodes();
  const stats={
    total:codes.length,
    activated:codes.filter(c=>c.activated).length,
    pending:codes.filter(c=>!c.activated).length,
    unlimited:codes.filter(c=>c.credits===-1).length,
    total_credits_issued:codes.filter(c=>c.credits!==-1).reduce((s,c)=>s+c.credits,0),
    total_credits_used:codes.reduce((s,c)=>s+(c.credits_used||0),0),
  };
  res.json({ok:true,codes,stats});
});
// Prompt 模板列表
app.get('/api/admin/prompts',(req,res)=>{
  if(!adminAuth(req,res))return;
  res.json({ok:true,prompts:loadPrompts()});
});
// 更新 Prompt 模板
app.post('/api/admin/prompts/update',(req,res)=>{
  if(!adminAuth(req,res))return;
  const key = String(req.body.key || '').trim();
  const content = String(req.body.content || '');
  if(!key) return res.json({ok:false,message:'缺少模板 key'});
  if(content.length < 10) return res.json({ok:false,message:'Prompt 内容过短'});
  const prompts = loadPrompts();
  const idx = prompts.findIndex(p => p.key === key);
  if(idx === -1) return res.json({ok:false,message:'找不到该 Prompt 模板'});
  prompts[idx] = {...prompts[idx], content, updated_at:new Date().toISOString()};
  savePrompts(prompts);
  res.json({ok:true,prompt:prompts[idx]});
});
// 恢复默认 Prompt 模板
app.post('/api/admin/prompts/reset',(req,res)=>{
  if(!adminAuth(req,res))return;
  const key = String(req.body.key || '').trim();
  const def = DEFAULT_PROMPTS.find(p => p.key === key);
  if(!def) return res.json({ok:false,message:'找不到默认模板'});
  const prompts = loadPrompts();
  const idx = prompts.findIndex(p => p.key === key);
  const next = {...def, updated_at:new Date().toISOString()};
  if(idx >= 0) prompts[idx] = next;
  else prompts.push(next);
  savePrompts(prompts);
  res.json({ok:true,prompt:next});
});
// 模型与密钥配置（密钥只保存后端，前端永不回显明文）
app.get('/api/admin/model-settings',(req,res)=>{
  if(!adminAuth(req,res))return;
  res.json({ok:true,settings:publicModelSettings()});
});
app.post('/api/admin/model-settings',(req,res)=>{
  if(!adminAuth(req,res))return;
  const current = loadModelSettings();
  const incoming = req.body || {};
  const now = new Date().toISOString();

  ['openrouter','groq'].forEach(provider => {
    const val = incoming.providers?.[provider]?.apiKey;
    if(typeof val === 'string' && val.trim()){
      current.providers[provider].apiKey = val.trim();
      current.providers[provider].updated_at = now;
    }
  });

  if(incoming.moduleModels && typeof incoming.moduleModels === 'object'){
    Object.keys(DEFAULT_MODEL_SETTINGS.moduleModels).forEach(moduleKey => {
      const cfg = incoming.moduleModels[moduleKey];
      if(!cfg) return;
      const provider = cfg.provider === 'groq' ? 'groq' : 'openrouter';
      const model = String(cfg.model || '').trim();
      if(model) current.moduleModels[moduleKey] = {provider, model};
    });
  }

  saveModelSettings(current);
  res.json({ok:true,settings:publicModelSettings()});
});
// 撤销/删除激活码
app.post('/api/admin/revoke',(req,res)=>{
  if(!adminAuth(req,res))return;
  const {code}=req.body;
  const codes=loadCodes();
  const idx=codes.findIndex(c=>c.code===code);
  if(idx===-1) return res.json({ok:false,message:'找不到该激活码'});
  codes.splice(idx,1); saveCodes(codes);
  res.json({ok:true});
});

app.listen(3366,()=>{
  console.log('\n✦ Cyber Metaphysics Architect 代理已启动 v2.1（算法+AI架构）');
  console.log('  地址：http://localhost:3366/fengshui.html\n');
  console.log('  命盘接口：POST /api/bazi  （精确算法+AI解读）');
  console.log('  财运接口：POST /api/wealth （精确算法+AI解读）');
  console.log('  通用接口：POST /api/chat   （解梦/黄历/风水/追问）\n');
});

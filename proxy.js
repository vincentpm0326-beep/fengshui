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
    name: '快捷问事·通用问事',
    module: '快捷问事',
    description: '固定用于快捷问事入口；有生辰则结合八字合参，无生辰则按问事、时机、事项象意判断。',
    content:
`你是资深命理问事师，精通八字命理、流年大运、黄历择日、风水象意与民俗问事。
请像师傅当面解释一样说人话：先给一句结论，再把依据翻译成普通人能懂的原因，最后给具体做法。不要堆术语，不要承诺绝对结果，不制造恐慌。

当前日期：{{current_date}}
问题类型：{{category_label}}
用户问题：{{question}}

【用户生辰资料】
{{birth_context}}

【八字命理上下文】
{{bazi_context}}

判断规则：
1. 如果已提供生辰资料，必须结合四柱、日主、五行喜忌、大运/流年与本次事项合参，但不要把八字写成冗长排盘。
2. 如果没有生辰资料，按本次事项、当前日期、时机、象意、风水/黄历/民俗经验进行问事占断，并自然提示“补充生辰后可合参八字”。
3. 快捷问事只断本次事项：要给成败倾向、阻滞点、应期或观察窗口、取法建议。
4. 不要写聊天式追问，不要写“我可以继续为你”，不要只给现代职场/生活建议。
5. 每个字段都要口语化，少用“气机、格局、冲合、喜忌”等术语；必须使用时，要立刻用白话解释。

严格返回JSON，不输出其他内容：
{"category":"{{category}}","need_birth":false,"summary":"一句听得懂的结论，30字以内","analysis":"白话解释为什么这么判断，分成2到3个短句，180-260字，必须落到用户问题","actions":["现在最该做什么，具体到动作","最该避开什么，说明原因","接下来几天看什么信号或时间窗口"],"timing":"近期应期、转折点或观察窗口，用白话说，60字以内","upgrade_hint":"下一步可点击的专题服务，50字以内","consult_hint":"仅在高成本决策场景建议真人咨询，40字以内"}`
  },
  {
    key: 'quick_ask_bazi',
    name: '命理问事·预留模板',
    module: '运势命理',
    description: '当前不由快捷问事自动调用；命理深度分析固定走命理报告、财运分析等专属模块。',
    content:
`你是资深命理师，精通八字格局、流年大运、五行喜忌与现实行动建议。
请像师傅当面解释一样，把命理依据翻译成用户能听懂的话。不要修改四柱，不要夸大确定性。

当前日期：{{current_date}}
问题类型：{{category_label}}
用户问题：{{question}}

【用户资料】
{{birth_context}}

【系统计算命理上下文】
{{bazi_context}}

输出要像“个人化问事卡片”，不要像聊天机器人继续追问；不要写“你可以继续告诉我/我可以为你”等当前页面无法承接的互动话术。少用术语，必须使用术语时马上解释成白话。
必须包含：1）明确结论；2）命理依据；3）短期行动；4）风险边界；5）适合跳转的下一步服务。

严格返回JSON，不输出其他内容：
{"category":"{{category}}","need_birth":true,"summary":"一句听得懂的个人化结论，30字以内","analysis":"把八字、大运、流年依据翻译成白话，分成2到3个短句，180-260字，必须落到用户问题","actions":["短期行动1，具体可做","短期行动2，具体到取舍或节奏","风险规避3，具体到不要做什么"],"timing":"近期适合/不适合行动的时间提示，60字以内","upgrade_hint":"下一步可点击的专题服务，50字以内","consult_hint":"仅在高成本决策场景建议真人咨询，50字以内"}`
  },
  {
    key: 'fengshui_analysis',
    name: '家宅风水诊断',
    module: '家宅风水',
    description: '空间图片/文字风水分析的专业提示词模板。',
    content:
`你是资深风水堪舆师。请像到用户家里看完现场后当面说明一样，给出清楚、口语化、可执行的风水建议。禁止使用“迷信、包治、保证改运”等绝对化表达。

分析模式：{{mode}}
空间类型：{{room}}
分析侧重：{{focus}}
入户门朝向：{{door_dir}}
文字描述：{{desc}}

如果是图片模式，请只基于图片中可见内容和用户补充朝向分析，不臆测看不到的信息；如果是文字模式，请只基于文字描述分析。少用风水黑话，必须使用“形煞、纳气、明堂”等词时，要顺手解释它对日常生活意味着什么。

严格返回JSON，不输出其他内容：
{"score":整数50-95,"score_reason":"用白话说明主要加分和扣分点，50字以内","room_detected":"{{room}}","findings":[{"type":"good或warn或bad","text":"用户能看懂的具体发现，不少于30字","suggestion":"具体可操作改善方案，不少于25字","detail":"用白话解释这个问题长期会影响什么，不少于30字"}],"deep_analysis":{"qi_flow":"用白话说明门窗、动线和气流是否顺，60字以上","five_elements":"用颜色、材质、光线等日常语言说明五行是否偏重，60字以上","sha_analysis":"说明是否有冲门、压梁、尖角等问题，以及会带来什么感受，60字以上","lucky_positions":"说明哪里更适合放书桌、沙发、财位物品，60字以上","improvement_priority":"按先后顺序列出最该改的3件事，80字以上"},"directions":[{"dir":"方位","element":"五行","gua":"卦名","benefit":"用白话说明好处","how_to_use":"利用方式，20字以内"}],"items":["具体风水物品及摆放位置"],"remove":["需移除或调整的物品，无则空数组"],"master_comment":"大师总评，用白话说明整体好不好、最该改什么、改完有什么帮助，150字以上"}`
  },
  {
    key: 'dream_analysis',
    name: '梦境解析',
    module: '梦境解析',
    description: '梦境象征、心理状态、近期提醒分析模板。',
    content:
`你是资深解梦师。请像师傅听完梦境后当面解释一样，用白话帮用户理解梦里的情绪、关系、压力和近期提醒，不制造恐慌，不做绝对预言。

醒来感受：{{emotion}}
梦中出现：{{subjects}}
梦境时间：{{time}}
补充细节：{{text}}

请从梦中意象、醒来感受、近期提醒和行动建议四个维度分析。少用术语，必须使用“五行、象意”等词时，要解释成用户听得懂的话。

严格返回JSON，不输出其他内容：
{"summary":"用白话说明这个梦主要在提醒什么，不少于120字","element":"梦境主五行（木/火/土/金/水）","omen":"good或warn或bad","symbols":[{"icon":"emoji","name":"意象名称","meaning":"用白话解释这个意象代表的情绪或现实牵挂，不少于40字","type":"吉或凶或中","significance":"对梦者的具体提醒，20字以内"}],"prediction":"近30天状态提醒，用白话说，不少于80字","aspects":{"career":{"text":"事业提醒，25字","score":整数30-95},"wealth":{"text":"财务提醒，25字","score":整数30-95},"relationship":{"text":"感情提醒，25字","score":整数30-95},"health":{"text":"身心状态提示，25字","score":整数30-95}},"remedy":"有明显警示时给出舒缓或规避建议，无则为空字符串","advice":"今日立即可做的1个具体行动，40字以内","master_comment":"大师总评，用白话说清这个梦的核心意思，不少于120字"}`
  },
  {
    key: 'almanac_today',
    name: '今日宜忌/择日黄历',
    module: '今日决策',
    description: '今日宜忌、吉时方位、事项适配分析模板。',
    content:
`你是资深择日师。请用普通人听得懂的话解释今日宜忌、适合做什么、不适合做什么，避免绝对化承诺。

今日公历日期：{{date}}

请完成：干支判断、今日宜忌、吉神凶煞、吉时方位、吉祥颜色、五行能量分布和今日总结。术语后面要接一句白话解释。

严格返回JSON，不输出其他内容：
{"ganzhi":"完整干支如甲子日","day_element":"日柱五行","lucky_gods":[{"name":"吉神名","meaning":"用白话说明今天适合带来什么帮助，20字以内"}],"bad_gods":[{"name":"凶煞名","meaning":"用白话说明今天要注意什么，20字以内"}],"yi":["宜做事项+一句具体说明","宜2","宜3","宜4","宜5"],"ji":["忌做事项+一句具体说明","忌2","忌3"],"lucky_hours":[{"name":"时辰名","time":"时间段","suitable":"适合做什么"},{"name":"时辰名","time":"时间段","suitable":"适合做什么"}],"lucky_dirs":["方位1","方位2"],"lucky_colors":["颜色1（对应五行）","颜色2（对应五行）"],"elements":{"wood":整数,"fire":整数,"earth":整数,"metal":整数,"water":整数},"risk_warning":"今日需避开的方位或行为，30字以内","day_summary":"今日总断，用白话说明适合推进什么、什么要慢一点，不少于100字"}`
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

function optionalUserFromAuth(req){
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = readToken(token);
  if(!payload || !payload.uid) return null;
  const user = loadUsers().find(u => u.id === payload.uid);
  return user || null;
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
function normalizeJsonText(text){
  return String(text || '')
    .replace(/```json\s*/gi,'')
    .replace(/```\s*/g,'')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}
function extractJSON(text){
  const stripped = normalizeJsonText(text);
  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if(s<0||e<=s) throw new Error('No JSON object found');
  return JSON.parse(stripped.substring(s, e+1));
}
function safeExtractJSON(text){
  try{ return extractJSON(text); }catch(e){}
  const t = normalizeJsonText(text);
  try{
    const parsed = JSON.parse(t);
    if(typeof parsed === 'string') return safeExtractJSON(parsed);
    return parsed;
  }catch(e){}
  return null;
}
function cleanJsonishText(text){
  return normalizeJsonText(text);
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
function cleanDisplayMarkdown(text){
  return cleanJsonishText(text)
    .replace(/\r/g, '')
    .replace(/^[ \t]*---+[ \t]*$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*>[ \t]*/gm, '')
    .replace(/^[ \t]*[-*]\s+/gm, '• ')
    .replace(/^[ \t]*[✅⚠️]\s*/gm, '')
    .replace(/^\s*\{\s*\}\s*$/gm, '')
    .replace(/^\s*\{\s*$/gm, '')
    .replace(/^\s*\}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function cleanQuickAskAnalysis(text){
  const lines = cleanDisplayMarkdown(text).split('\n');
  while(lines.length && /^(?:[二三四五六七八九十]+|[2-9])[、.．]\s*(?:问题性质判断|当前时机判断|国学咨询角度说明|现实执行建议|风险提示|最终结论|结论|建议)?\s*$/.test(lines[0].trim())){
    lines.shift();
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function stripSectionTitle(text){
  return cleanDisplayMarkdown(text)
    .replace(/^(?:[一二三四五六七八九十]+|[0-9]+)[、.．]\s*/, '')
    .replace(/^(?:问题性质判断|当前时机判断|国学咨询角度说明|现实执行建议|风险提示|最终结论|结论|建议)[：:]?\s*/, '')
    .trim();
}
function summaryFromPlainText(text){
  const lines = cleanDisplayMarkdown(text)
    .split(/\n+/)
    .map(s => stripSectionTitle(s))
    .filter(Boolean);
  const rawLines = cleanDisplayMarkdown(text).split(/\n+/).map(s => s.trim()).filter(Boolean);
  const finalIdx = rawLines.findIndex(s => /^(?:[六七八九十]+[、.．]\s*)?最终结论[：:]?$/.test(stripSectionTitle(s)) || /最终结论/.test(s));
  if(finalIdx >= 0){
    const sameLine = stripSectionTitle(rawLines[finalIdx].replace(/^.*?[：:]/, '').trim());
    if(sameLine && sameLine.length > 4) return sameLine.slice(0, 60);
    if(rawLines[finalIdx + 1]) return stripSectionTitle(rawLines[finalIdx + 1]).slice(0, 60);
  }
  const conclusionIdx = rawLines.findIndex(s => /^(?:[一二三四五六七八九十]+[、.．]\s*)?结论[：:]?$/.test(stripSectionTitle(s)));
  if(conclusionIdx >= 0 && rawLines[conclusionIdx + 1]) return stripSectionTitle(rawLines[conclusionIdx + 1]).slice(0, 60);
  const first = lines.find(s => !/^(问题性质判断|当前时机判断|国学咨询角度说明|现实执行建议|风险提示)$/.test(s));
  return first ? first.slice(0, 60) : '';
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
  if(!d.summary || /现实执行建议|问题性质判断|当前时机判断|风险提示/.test(d.summary)) d.summary = summaryFromPlainText(d.analysis || rawText) || '已完成问事判断';
  if(!d.analysis) d.analysis = String(rawText || '').replace(/```json|```/g,'').slice(0, 1200);
  if(typeof d.analysis === 'object') d.analysis = JSON.stringify(d.analysis);
  if(!Array.isArray(d.actions)) d.actions = d.actions ? [String(d.actions)] : [];
  d.summary = cleanDisplayMarkdown(d.summary);
  d.analysis = cleanQuickAskAnalysis(d.analysis);
  d.upgrade_hint = cleanDisplayMarkdown(d.upgrade_hint || '');
  d.consult_hint = cleanDisplayMarkdown(d.consult_hint || '');
  d.timing = cleanDisplayMarkdown(d.timing || '');
  d.actions = d.actions.map(a => cleanDisplayMarkdown(a)).filter(Boolean);
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

function completeBirthProfile(birth){
  const safe = sanitizeProfile(birth);
  return !!safe.date;
}

function hasModelKey(config){
  const provider = typeof config === 'object' ? config.provider : (config === 'groq' ? 'groq' : 'openrouter');
  return !!providerKey(provider);
}

function buildQuickAskFallback(question, cls, hasBirth, baziInfo){
  const q = String(question || '');
  const isInterview = /面试|offer|录取|hr|HR|复试|终面/.test(q);
  const todayLabel = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const direct = {
    timing: {
      summary: '可以推进，但别急着定死。',
      analysis: `这件事不是不能做，但现在更适合先小步试探。简单说，就是先把条件、时间和责任确认清楚，再决定要不要正式落下去。如果只是轻量沟通，可以动；如果涉及签约、付款、开业这类大事，最好再复核一遍细节。`
    },
    dream: {
      summary: '梦有提醒，不宜当成定数。',
      analysis: '从梦象看，重点不在“必然应验”，而在梦中意象所带出的气：若醒后情绪重，多主心神牵挂；若反复出现同类场景，多主现实中有未解之事。此梦更像提醒你留意近期关系、压力或选择，不宜直接据梦做重大决定。'
    },
    fengshui: {
      summary: '先看门口，再看人坐卧的位置。',
      analysis: '风水上最先看的不是摆件，而是门窗是否通顺、人常待的位置是否稳定。简单说，入口太堵、动线直冲、床或办公桌背后没靠，容易让人住着不踏实、做事反复。可以先检查门口是否杂乱、座位背后是否空、镜子或横梁有没有压到常用位置。'
    },
    wealth: {
      summary: '有赚钱机会，但别急着加码。',
      analysis: '现在不是完全没机会，而是钱还没有真正落稳。要先看收入来源是否可靠、现金流能不能撑住、合作方是否说到做到。近期更适合先减少不必要开支，再看增收机会；大额投入、借贷加码和高风险项目不要急着冲。'
    },
    career: {
      summary: isInterview ? '有希望，但还没到定局。' : '事业可以推进，但要看对方回应。',
      analysis: isInterview
        ? `从这件事本身看，昨天的面试不是完全没戏，属于“有机会，但还在比较”的状态。面试已经结束，主动权暂时在对方那里，通常需要内部沟通、候选人对比和流程确认。若面试中对方追问细节、介绍后续流程，机会会更大；若只是礼貌结束，就还要看竞争情况。接下来3到7个工作日比较关键。`
        : '从事业问事看，这件事可以争取，但不适合硬冲。成不成主要看三点：对方是否给明确回应、资源是否到位、时间点是否合适。若已有邀约或窗口，可以顺势推进；若信息还很模糊，先探口风再行动。'
    },
    relationship: {
      summary: '情势未断，先看回应。',
      analysis: '感情问题不能只凭一时情绪判断。若对方仍有回应、愿意沟通，说明关系还没有完全断；若反复冷淡、避谈关键问题，就要谨慎。短期最忌逼问和试探，建议看对方是否有持续行动，行动比说法更重要。'
    },
    fortune: {
      summary: '最近有点卡，先处理阻碍。',
      analysis: '最近不是完全没有机会，而是事情容易拖、沟通容易反复，自己也容易心里不稳。这个阶段不适合同时开太多事情，越多越乱。建议先把最拖你的一件事处理掉，把破财、拖延、反复出错的地方先收住，再推进更大的决定。'
    },
    compatibility: {
      summary: '缘分有线，合不合看承接。',
      analysis: '关系合不合，不能只看有没有吸引。更重要的是遇到问题时能不能商量、冲突后能不能修复、金钱和家庭观念会不会反复打架。若彼此有吸引但总在边界、金钱、家庭问题上起冲突，就是有缘分但也很消耗；若遇事能商量，关系会更稳。'
    },
    general: {
      summary: '事有可为，但不宜急定。',
      analysis: '这件事不是完全没机会，但现在还没到可以马上定下来的程度。更稳的做法是先试探、再判断、后推进：若对方有回应、条件越来越清楚，就可以加力；若信息含糊、反复卡住，就先别做大决定。'
    }
  };
  const commonActions = {
    timing: ['先确认这件事是轻事还是重事，轻事可以推进，重事先复核细节。', '不要只靠口头承诺，关键条款、时间和责任最好写清楚。', '如果今天必须推进，先做小决定，不要一次把退路堵死。'],
    dream: ['先记下醒来后的情绪，情绪越重，说明现实里越有牵挂。', '不要把单次梦当成定局，反复出现的梦更值得留意。', '未来三天观察现实中是否出现类似情绪或关系变化。'],
    fengshui: ['先整理门口和常用位置，让入口顺、座位稳、视线开。', '门窗直冲、背后空、镜子或横梁压到常用位置，都要优先调整。', '先调入口和主位，再看财位、文昌位等细分布局。'],
    wealth: ['先看钱能不能真正到账，不要只看机会描述。', '合作不明、支出过快、承诺过满，都会让你被动。', '短期先守住现金流，等条件更清楚再加码。'],
    career: ['先看对方是否给明确后续安排，有安排就代表还有机会。', '流程拖延、候选人比较、内部审批，都会让结果后置。', '未来3到7个工作日看第一次回音，先有信号再判断成败。'],
    relationship: ['先看对方回应是否连续，行动比口头承诺更重要。', '不要反复试探或情绪逼问，这会让关系更紧。', '看下一次自然沟通后的态度变化，再决定要不要推进。'],
    fortune: ['先找最近最卡你的那件事，把它处理掉。', '不要多线并进，事情太多会让状态更乱。', '先清掉一件拖延事，状态顺了再开新局。'],
    compatibility: ['看遇到问题时能不能商量，而不是只看有没有吸引。', '金钱、边界、家庭议题如果总起冲突，要谨慎。', '下一次冲突后的修复质量，比平时甜言蜜语更准。'],
    general: ['先看这件事有没有回应、有没有明确口径。', '信息太虚、承诺太空、时间太赶，是最主要的风险。', '先试一小步，看对方回音再决定是否加力。']
  };
  const actions = isInterview ? [
    '如果面试中对方追问细节、介绍后续流程，说明还有机会；如果只是客套收尾，就还在比较。',
    '这件事不怕等，怕急催。现在催得太紧，反而容易影响印象。',
    '应期：未来3到7个工作日看第一次回音；若无回音，再礼貌跟进一次。'
  ] : (commonActions[cls.category] || commonActions.general);
  const base = direct[cls.category] || direct.general;
  const birthPrefix = hasBirth && baziInfo ? `结合你的生辰来看，这个判断会更偏个人化。${base.analysis}` : base.analysis;
  return {
    category: cls.category,
    need_birth: !hasBirth && cls.birth === 'required',
    summary: base.summary,
    analysis: birthPrefix,
    actions,
    timing: isInterview ? '应期看3到7个工作日；先有回音，再看录取或下一轮。' : (cls.category === 'timing' ? `以${todayLabel}为问事日，轻事可小动，重事宜再择稳时。` : ''),
    upgrade_hint: hasBirth ? '已合参生辰；可进入命理报告或财运详批查看更完整命局。' : (cls.birth === 'none' ? '可继续进入对应专题做深度分析。' : '补充生辰后，可合参八字、大运与流年做更贴身的判断。'),
    consult_hint: cls.category === 'career' ? '若涉及异地、薪资大幅变化或是否离职，可进一步真人咨询。' : '涉及买房、投资、婚姻、开业等高成本决策时，建议真人咨询。',
    fallback: true
  };
}

function buildQuickAskRuntimeContext(question, cls, baziInfo){
  const hasBirth = !!(baziInfo && baziInfo.birthContext);
  return `【本次用户问题】
${question}

【系统识别的问题类型】
${cls.label}（${cls.category}）

【当前日期】
${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}

【是否已提供生辰】
${hasBirth ? '已提供，必须结合下方八字上下文进行合参。' : '未提供，只按本次事项、时机与象意占断；如涉及长期运势，可提示补充生辰后更贴合个人命局。'}

【生辰资料】
${hasBirth ? baziInfo.birthContext : '未提供'}

【八字命理上下文】
${hasBirth ? baziInfo.baziContext : '未提供'}

【本次输出要求】
1. 必须直接回答“本次用户问题”，不要泛泛复述模板。
2. 不要写旁白、开场白、角色自述、分析计划，例如“下面我将”“作为顾问”“我会从几个方面”。
3. 无论后台 Prompt 如何配置，最终都必须严格返回 JSON 对象，不要返回 Markdown 标题或自然段结构。
4. 输出要有国学问事/算事的判断感：成败倾向、事象、阻滞点、应期、取法；不要只给现代职场/生活建议。
5. 如果已提供生辰，必须把八字命理作为判断依据之一；如果未提供生辰，不要假造出生信息。
6. 不要输出与用户问题无关的说明。`;
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

// ═══ 快捷问事：固定调用通用 Prompt，分类只用于展示标签和下一步推荐 ═══
app.post('/api/quick-ask', requireToken, async(req,res)=>{
  try{
    const question = String(req.body.question || '').trim().slice(0, 500);
    if(!question) return res.status(400).json({ error: { message: '请先输入要问的事情' } });

    const cls = classifyQuestion(question);
    const authUser = optionalUserFromAuth(req);
    const rawBirth = req.body.birth || authUser?.profile || null;
    const birth = rawBirth ? sanitizeProfile(rawBirth) : null;
    const hasBirth = completeBirthProfile(birth);
    const baziInfo = hasBirth ? buildBaziContext(birth) : null;
    const promptTpl = getPrompt('quick_ask_general');
    const vars = {
      current_date: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      question,
      category: cls.category,
      category_label: cls.label,
      birth_context: baziInfo ? baziInfo.birthContext : '未提供生辰资料',
      bazi_context: baziInfo ? baziInfo.baziContext : '未提供八字命理上下文'
    };
    const prompt = renderTemplate(promptTpl?.content, vars);
    const promptGuard = `\n\n【快捷问事硬性输出规则】\n1. 本接口最终只接受 JSON 对象，禁止输出 Markdown 标题、编号正文、代码块或额外说明。\n2. 有生辰时必须合参八字；无生辰时不要假造八字，只按问事象意与时机判断。\n3. JSON 字段固定为 category、need_birth、summary、analysis、actions、timing、upgrade_hint、consult_hint。\n4. 所有内容必须像师傅当面解释一样口语化：先说结论，再说为什么，最后说怎么做；不要让用户看完还需要再找人翻译。`;
    const runtimeContext = buildQuickAskRuntimeContext(question, cls, baziInfo);
    let model = modelConfigFor('quick_ask', req.body.allow_model_override ? req.body.selected_model : null);
    if(!hasModelKey(model) && hasModelKey({provider:'groq',model:'llama-3.3-70b-versatile'})) model = {provider:'groq',model:'llama-3.3-70b-versatile'};
    if(!hasModelKey(model)){
      return res.json({
        ok:true,
        needs_birth:!hasBirth && cls.birth === 'required',
        category:cls.category,
        category_label:cls.label,
        data:buildQuickAskFallback(question, cls, hasBirth, baziInfo),
        warning:'模型 API Key 未配置，已返回本地基础版结果。'
      });
    }
    const text = await callLLM([
      { role:'system', content: prompt + promptGuard },
      { role:'user', content: runtimeContext }
    ], 2500, model);
    const data = normalizeQuickAskResult(null, text);
    if(!hasBirth && cls.birth === 'required') data.need_birth = true;
    if(hasBirth) data.need_birth = false;
    res.json({ ok:true, needs_birth:!hasBirth && cls.birth === 'required', has_birth:hasBirth, category:cls.category, category_label:cls.label, data });
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
    const p1=`你是资深八字格局分析师，专精命盘结构解析。语气要像师傅当面说明：专业但口语化，少堆术语，必须使用术语时马上解释成用户听得懂的话。

${ctx}

你的任务：深度分析此命盘的格局结构、日主能量、喜忌神体系。
要求：结合藏干、月令司权、五行生克制化进行精准判断，不泛泛而论。

只返回JSON，不输出其他内容：
{"pattern":"格局名，如正官格/食神格/从财格等","pattern_reason":"用白话说明格局为什么这样判断，40字","strength_reason":"用白话说明日主强弱，40字","yong_shen":"喜用神，一到两个五行","ji_shen":"忌神，一到两个五行","shen_reason":"用白话说明为什么喜这些、忌这些，50字","character":"根据格局与日主推断性格，少术语，60字，具体到行为倾向","energy_model":"用白话说明五行最强最弱及影响，40字","pattern_diagnosis":"用白话说明这个命盘的优势和卡点，50字","findings":[{"type":"good","text":"命盘最突出的正面特质，30字","suggestion":"如何放大此优势"},{"type":"warn","text":"命盘潜在风险或缺陷，30字","suggestion":"化解或规避建议"}]}`;

    // ── Agent 2：大运流年运程师 ────────────────────────────────────
    const p2=`你是专精大运流年分析的命理运程师。语气冷静直接，但必须口语化；把大运、流年、生克关系翻译成用户能懂的现实影响。

${ctx}

你的任务：精准分析当前大运与近三年流年的能量走势，给出具体时间节点预判。
要求：结合大运天干地支与流年的生克冲合关系，给出实质性的吉凶判断，不模棱两可。

只返回JSON，不输出其他内容：
{"current_dayun":"${bazi.dayun.current}大运解读，用白话说明对事业、财运或状态的影响，60字","yearly_fortune":[{"year":"${bazi.nowYears[0]?.yr||2025}","ganzhi":"${bazi.nowYears[0]?.gz||''}","forecast":"用白话说明这一年更顺还是更卡，以及原因，50字","key_period":"该年最关键的月份或事件节点，15字","rating":"good或warn或bad"},{"year":"${bazi.nowYears[1]?.yr||2026}","ganzhi":"${bazi.nowYears[1]?.gz||''}","forecast":"用白话说明这一年更顺还是更卡，以及原因，50字","key_period":"关键节点，15字","rating":"good或warn或bad"},{"year":"${bazi.nowYears[2]?.yr||2027}","ganzhi":"${bazi.nowYears[2]?.gz||''}","forecast":"用白话说明这一年更顺还是更卡，以及原因，50字","key_period":"关键节点，15字","rating":"good或warn或bad"}],"risk_warning":"未来三年最该注意的现实风险，30字，要具体"}`;

    // 并行执行 Agent 1 & 2
    const [a1Text, a2Text]=await Promise.all([
      callLLM([{role:'user',content:p1}], 2500, model),
      callLLM([{role:'user',content:p2}], 2500, model),
    ]);
    let a1={}, a2={};
    try{ a1=extractJSON(a1Text); }catch(e){ console.error('Agent1 JSON解析失败'); }
    try{ a2=extractJSON(a2Text); }catch(e){ console.error('Agent2 JSON解析失败'); }

    // ── Agent 3：综合决策顾问（基于前两个Agent结果）────────────────
    const p3=`你是资深命理综合师，整合命盘格局与运程分析，给出听得懂、能执行的建议。语气像师傅当面提醒：直接、稳健、有观点。

${ctx}

【格局分析师结论】格局：${a1.pattern||''}，日主${bazi.strength==='strong'?'身强':'身弱'}，喜${a1.yong_shen||bazi.yongShen}忌${a1.ji_shen||bazi.jiShen}
${a1.pattern_diagnosis?'格局诊断：'+a1.pattern_diagnosis:''}
【运程师结论】当前大运：${a2.current_dayun||bazi.dayun.current}，风险预警：${a2.risk_warning||''}

你的任务：基于以上两位专家的分析，给出落地可执行的人生决策建议、物理调候方案和风水布局指引，最后输出顾问总评。
要求：建议要具体可执行，不说废话，不重复前两个Agent的内容，聚焦“怎么做”。不要输出空对象或解释JSON结构。

只返回JSON，不输出其他内容：
{"decision_advice":{"yi":["宜做的事1，具体说明","宜做的事2，具体说明","宜做的事3"],"ji":["忌做的事1，具体说明","忌做的事2，具体说明"]},"physical_remedy":["具体调整1，说明颜色/方位/物品等","具体调整2","具体调整3"],"fengshui_intro":"基于此命盘的风水布局总原则，用白话说，40字","fengshui_advice":{"lucky_dirs":["最吉方位及理由"],"lucky_colors":["吉利颜色及使用场景"],"lucky_items":["旺运物品及摆放位置"],"avoid_dirs":["需回避的方位及原因"]},"master_comment":"大师综合批语：用白话整合格局、运程、建议三个维度，说清这套命盘的核心优势、当前卡点和行动方向，200字以上"}`;

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
    const wp1=`你是专精八字财格分析的命理师。语气专业直接，但必须口语化；把财星、正财、偏财这些概念翻译成用户能懂的赚钱方式和风险。

${wctx}

你的任务：精准判断此命盘的财格类型、财星能量状态、正偏财特点，评估整体财运潜力。
要求：结合日主强弱、财星位置、官印食伤的护财/泄财能力，给出有依据的评分。

只返回JSON，不输出其他内容：
{"score":"财运综合评分60-95的整数","score_reason":"用白话说明评分依据，40字","caige":"财格名称，如正财格/偏财格/从财格/财多身弱等","caige_detail":"用白话说明这个财格怎么赚钱更顺、哪里容易漏财，80字","caige_findings":[{"type":"good","text":"财格优势特点，30字","suggestion":"放大建议"},{"type":"warn","text":"财格局限或风险，30字","suggestion":"规避建议"}],"zhengcai":"正财分析：适合稳定收入、职业发展的方向，用白话说，60字","piancai":"偏财分析：适合副业、机会财或投资的边界，用白话说，60字","energy_model":"用白话描述财星强弱，30字","risk_warning":"财运最大风险点，30字，要具体"}`;

    // ── Agent 2：旺财风水布局师 ────────────────────────────────────
    const wp2=`你是专精风水布局与财运激活的旺财布局师。语气实操导向，必须用白话说明为什么这样布置、用户今天能怎么做。

${wctx}

你的任务：基于此命盘的喜用五行，给出精准的旺财方位布局、吉时选择、财运近三年走势。
要求：方位建议要有五行依据，不说"东南西北都可以"，要明确指出最优方位。

只返回JSON，不输出其他内容：
{"directions":[{"dir":"最旺财方位名称","element":"对应五行","role":"财神/文昌/贵人","how":"具体用法，20字"},{"dir":"次选方位","element":"对应五行","role":"功能","how":"用法"}],"layout":"旺财布局整体策略，用白话说明主财位如何布置，80字","items":[{"name":"推荐物品","position":"摆放位置","effect":"激活效果"},{"name":"物品2","position":"位置","effect":"效果"},{"name":"物品3","position":"位置","effect":"效果"}],"items_detail":"使用注意事项，30字","physical_remedy":["旺财调整1，具体颜色/物品/方位","旺财调整2","旺财调整3"],"current_dayun":"当前大运${bazi.dayun.current}对财运的影响，用白话说，50字","yearly_fortune":[{"year":"${bazi.nowYears[0]?.yr||2025}","ganzhi":"${bazi.nowYears[0]?.gz||''}","wealth_trend":"用白话说明该年财运机会和风险，50字","best_months":"旺财最佳月份，15字","rating":"good或warn或bad"},{"year":"${bazi.nowYears[1]?.yr||2026}","ganzhi":"${bazi.nowYears[1]?.gz||''}","wealth_trend":"用白话说明该年财运机会和风险，50字","best_months":"旺财月份，15字","rating":"good或warn或bad"},{"year":"${bazi.nowYears[2]?.yr||2027}","ganzhi":"${bazi.nowYears[2]?.gz||''}","wealth_trend":"用白话说明该年财运机会和风险，50字","best_months":"旺财月份，15字","rating":"good或warn或bad"}],"taboo":[{"item":"财运大忌1","reason":"用白话说明原因","solution":"化解方法"},{"item":"财运大忌2","reason":"原因","solution":"化解"}]}`;

    // 并行执行 Agent 1 & 2
    const [wa1Text, wa2Text]=await Promise.all([
      callLLM([{role:'user',content:wp1}], 2500, wModel),
      callLLM([{role:'user',content:wp2}], 2500, wModel),
    ]);
    let wa1={}, wa2={};
    try{ wa1=extractJSON(wa1Text); }catch(e){ console.error('WAgent1 JSON解析失败'); }
    try{ wa2=extractJSON(wa2Text); }catch(e){ console.error('WAgent2 JSON解析失败'); }

    // ── Agent 3：财运投资决策顾问（整合两个Agent结论）──────────────
    const wp3=`你是资深财运师，整合财格分析与布局建议，为用户提供听得懂、能执行的财务决策指引。语气直接、稳健、直击核心。

${wctx}

【财格师分析】财格：${wa1.caige||''}，评分：${wa1.score||''}，主要风险：${wa1.risk_warning||''}
【布局师分析】最佳财位：${wa2.directions?.[0]?.dir||''}，近期大运影响：${wa2.current_dayun||''}

你的任务：整合两位专家结论，给出财运总评与最终行动方案，语气要有力，有观点，有态度。
要求：master_comment要体现三个维度：财格潜力判断、当前运势节点、核心行动建议，不少于200字。必须口语化，不要堆术语，不要输出空对象或解释JSON结构。

只返回JSON，不输出其他内容：
{"master_comment":"大师财运总评：用白话整合财格、运势、布局三个维度，说清赚钱优势、近期风险和接下来该怎么做，200字以上"}`;

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

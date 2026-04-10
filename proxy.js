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

// ═══ 安全：内部 API 令牌（防止外部直接调用接口） ═══
// 生产环境请在环境变量中设置 INTERNAL_TOKEN，否则每次重启会随机生成（开发用）
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || crypto.randomBytes(32).toString('hex');
if(!process.env.INTERNAL_TOKEN){
  console.warn('[安全提示] INTERNAL_TOKEN 未设置，已随机生成（重启后变化）');
}

// ═══ 安全：CORS 白名单（只允许自己的域名） ═══
const ALLOWED_ORIGINS = [
  'https://aicopy.me',
  'https://www.aicopy.me',
  'http://localhost:3366',
  'http://127.0.0.1:3366',
];
// 临时穿透域名（trycloudflare.com / ngrok 等）
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/,
  /^https:\/\/[a-z0-9-]+\.ngrok[-.]io$/,
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
];
app.use(cors({
  origin: function(origin, cb){
    // 无 origin（直接IP访问、服务器内部调用）全部允许
    if(!origin) return cb(null, true);
    if(ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if(ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin))) return cb(null, true);
    cb(new Error('CORS 拒绝：不在白名单'));
  },
  methods: ['GET','POST'],
  allowedHeaders: ['Content-Type','X-CMA-Token'],
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

// ═══ 安全：内部令牌验证中间件（AI 分析接口专用） ═══
function requireToken(req, res, next){
  const token = req.headers['x-cma-token'];
  if(token !== INTERNAL_TOKEN){
    return res.status(403).json({ error: { message: '访问被拒绝' } });
  }
  next();
}

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
async function callGroq(messages, maxTokens=2000){
  const apiKey=process.env.GROQ_API_KEY;
  if(!apiKey) throw new Error('请设置环境变量 GROQ_API_KEY');
  const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',max_tokens:maxTokens,temperature:0.7,messages})
  });
  const data=await res.json();
  if(data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content||'';
}

// ═══ OpenRouter API 调用（兼容 Claude / Llama 等所有模型） ═══
async function callOpenRouter(messages, maxTokens=4000, model='anthropic/claude-opus-4.6'){
  const apiKey=process.env.OPENROUTER_API_KEY;
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
async function callLLM(messages, maxTokens=2000, model='groq'){
  if(!model||model==='groq'){
    // Groq 不支持视觉，剥离图片内容后调用
    const textMsgs=messages.map(m=>({
      role:m.role,
      content:typeof m.content==='string'?m.content:
        Array.isArray(m.content)?m.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'):m.content
    }));
    return callGroq(textMsgs,maxTokens);
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
    const model = hasImages ? 'anthropic/claude-sonnet-4-5' : (req.body.selected_model || 'groq');
    const maxTok = Math.min(parseInt(req.body.max_tokens) || 4000, 6000);
    const text = await callLLM(msgs, maxTok, model);
    res.json({ content: [{ type: 'text', text }] });
  } catch(e) { res.status(500).json({ error: { message: '分析服务暂时不可用，请稍后重试' } }); }
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
    const model=req.body.selected_model||'groq';

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
    const wModel=req.body.selected_model||'groq';
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

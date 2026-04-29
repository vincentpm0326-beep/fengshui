
var API = '/api/chat';
var SELECTED_MODEL = 'anthropic/claude-sonnet-4.6'; // 固定使用 Claude Sonnet

// ═══ 试用 & 付费状态 ═══
var TRIAL_USED   = localStorage.getItem('cma_trial_used') === '1';
var PRO_CREDITS  = localStorage.getItem('cma_credits') === '-1' ? -1 : parseInt(localStorage.getItem('cma_credits') || '0');
var ACTIVE_CODE  = localStorage.getItem('cma_active_code') || null;
var AUTH_TOKEN   = localStorage.getItem('cma_auth_token') || '';
var CURRENT_USER = null;

function saveProState() {
  localStorage.setItem('cma_trial_used', TRIAL_USED ? '1' : '0');
  localStorage.setItem('cma_credits', String(PRO_CREDITS));
}

function updateCreditsUI() {
  var badge = document.getElementById('credits-badge');
  if (!badge) return;
  badge.style.display = 'inline';
  if (PRO_CREDITS === -1)    { badge.textContent = '∞ 无限次'; badge.style.background = 'rgba(201,168,76,0.18)'; badge.style.color = '#C9A84C'; }
  else if (PRO_CREDITS > 0)  { badge.textContent = PRO_CREDITS + ' 次剩余'; badge.style.background = 'rgba(201,168,76,0.18)'; badge.style.color = '#C9A84C'; }
  else if (!TRIAL_USED)      { badge.textContent = '1 次免费试用'; badge.style.background = 'rgba(76,175,118,0.18)'; badge.style.color = '#4CAF76'; }
  else                       { badge.textContent = '⬆ 升级解锁'; badge.style.background = 'rgba(139,26,26,0.5)'; badge.style.color = '#FFB0B0'; }
}

function accountMsg(text, ok){
  var msg = document.getElementById('account-msg');
  if(!msg) return;
  msg.textContent = text || '';
  msg.style.color = ok ? '#4CAF76' : '#E08080';
}

function authHeaders(){
  return {'Content-Type':'application/json','Authorization':'Bearer '+AUTH_TOKEN};
}

function updateAccountUI(){
  var badge = document.getElementById('account-badge');
  if(!badge) return;
  if(CURRENT_USER){
    badge.textContent = '账号 ' + CURRENT_USER.phone.slice(-4);
    badge.style.background = 'rgba(76,175,118,.14)';
    badge.style.color = '#2E7D4F';
  } else {
    badge.textContent = '登录';
    badge.style.background = 'rgba(30,45,94,.08)';
    badge.style.color = 'var(--navy)';
  }
}

function switchAccountView(mode){
  ['login','register'].forEach(function(k){
    var tab=document.getElementById('account-'+k+'-tab');
    var view=document.getElementById('account-'+k+'-view');
    if(tab) tab.classList.toggle('on', k===mode);
    if(view) view.classList.toggle('on', k===mode);
  });
  accountMsg('', true);
}

function showAccountModal(mode){
  var overlay = document.getElementById('account-overlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  accountMsg('', true);
  if(!CURRENT_USER) switchAccountView(mode || 'login');
  renderAccountState();
}

function hideAccountModal(){
  var overlay = document.getElementById('account-overlay');
  if(overlay) overlay.style.display = 'none';
}

function renderAccountState(){
  var auth = document.getElementById('account-auth-area');
  var profile = document.getElementById('account-profile-area');
  if(!auth || !profile) return;
  auth.style.display = CURRENT_USER ? 'none' : 'block';
  profile.style.display = CURRENT_USER ? 'block' : 'none';
  if(CURRENT_USER) fillAccountProfile(CURRENT_USER.profile || {});
}

function collectAccountProfile(){
  var hourEl = document.getElementById('profile-bhour');
  return {
    date: (document.getElementById('profile-bday') || {}).value || '',
    hour: hourEl && hourEl.value !== '' ? parseInt(hourEl.value, 10) : null,
    timeLabel: hourEl ? hourEl.options[hourEl.selectedIndex].text : '',
    gender: (document.getElementById('profile-gender') || {}).value || '男',
    birthplace: ((document.getElementById('profile-birthplace') || {}).value || '').trim(),
    privacy_notice_accepted: true
  };
}

function fillAccountProfile(profile){
  profile = profile || {};
  if(document.getElementById('profile-bday')) document.getElementById('profile-bday').value = profile.date || '';
  if(document.getElementById('profile-bhour')) document.getElementById('profile-bhour').value = profile.hour === null || profile.hour === undefined ? '' : String(profile.hour);
  if(document.getElementById('profile-gender')) document.getElementById('profile-gender').value = profile.gender || '男';
  if(document.getElementById('profile-birthplace')) document.getElementById('profile-birthplace').value = profile.birthplace || '';
}

function setTimeSelectByHour(id, hour){
  var el=document.getElementById(id);
  if(!el || hour===null || hour===undefined) return;
  var map={0:'子时',2:'丑时',4:'寅时',6:'卯时',8:'辰时',10:'巳时',12:'午时',14:'未时',16:'申时',18:'酉时',20:'戌时',22:'亥时'};
  var target=map[hour];
  if(!target) return;
  for(var i=0;i<el.options.length;i++){
    if(el.options[i].value===String(hour) || el.options[i].text.indexOf(target)>=0){ el.selectedIndex=i; return; }
  }
}

function applyProfileToForms(profile){
  if(!profile) return;
  try{ localStorage.setItem('cma_birth_profile', JSON.stringify(profile)); }catch(e){}
  [['ask-bday','date'],['bday','date'],['w-bday','date']].forEach(function(pair){
    var el=document.getElementById(pair[0]); if(el && profile[pair[1]]) el.value=profile[pair[1]];
  });
  setTimeSelectByHour('ask-bhour', profile.hour);
  setTimeSelectByHour('btime', profile.hour);
  setTimeSelectByHour('w-btime', profile.hour);
  if(document.getElementById('ask-gender')) document.getElementById('ask-gender').value = profile.gender || '男';
  if(document.getElementById('ask-birthplace')) document.getElementById('ask-birthplace').value = profile.birthplace || '';
}

function saveAuthResult(d){
  if(!d.ok) throw new Error(d.message || '操作失败');
  AUTH_TOKEN = d.token || AUTH_TOKEN;
  if(AUTH_TOKEN) localStorage.setItem('cma_auth_token', AUTH_TOKEN);
  CURRENT_USER = d.user || null;
  if(CURRENT_USER && CURRENT_USER.profile) applyProfileToForms(CURRENT_USER.profile);
  updateAccountUI();
  renderAccountState();
}

function authLogin(){
  accountMsg('登录中...', true);
  fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    phone: document.getElementById('login-phone').value,
    password: document.getElementById('login-password').value
  })}).then(function(r){return r.json();}).then(function(d){
    saveAuthResult(d);
    accountMsg('登录成功，已同步个人资料。', true);
  }).catch(function(e){ accountMsg(e.message || '登录失败'); });
}

function authRegister(){
  accountMsg('注册中...', true);
  fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    phone: document.getElementById('register-phone').value,
    password: document.getElementById('register-password').value,
    profile: {privacy_notice_accepted:true}
  })}).then(function(r){return r.json();}).then(function(d){
    saveAuthResult(d);
    accountMsg('注册成功，请完善出生资料。', true);
  }).catch(function(e){ accountMsg(e.message || '注册失败'); });
}

function authMe(){
  if(!AUTH_TOKEN){ updateAccountUI(); return; }
  fetch('/api/auth/me',{headers:authHeaders()}).then(function(r){return r.json();}).then(function(d){
    if(!d.ok) throw new Error(d.message || '登录已失效');
    CURRENT_USER = d.user;
    if(CURRENT_USER.profile) applyProfileToForms(CURRENT_USER.profile);
    updateAccountUI();
  }).catch(function(){
    AUTH_TOKEN=''; CURRENT_USER=null; localStorage.removeItem('cma_auth_token'); updateAccountUI();
  });
}

function saveAccountProfile(){
  if(!AUTH_TOKEN){ accountMsg('请先登录'); return; }
  var profile = collectAccountProfile();
  accountMsg('保存中...', true);
  fetch('/api/auth/profile',{method:'POST',headers:authHeaders(),body:JSON.stringify({profile:profile})})
    .then(function(r){return r.json();}).then(function(d){
      if(!d.ok) throw new Error(d.message || '保存失败');
      CURRENT_USER = d.user;
      applyProfileToForms(CURRENT_USER.profile);
      updateAccountUI();
      accountMsg('已保存，后续问事会自动带入资料。', true);
    }).catch(function(e){ accountMsg(e.message || '保存失败'); });
}

function logoutAccount(){
  AUTH_TOKEN=''; CURRENT_USER=null;
  localStorage.removeItem('cma_auth_token');
  updateAccountUI();
  renderAccountState();
  accountMsg('已退出登录。', true);
}

var LAST_DEDUCTION = null; // 'credit' | 'trial' | null，用于失败时退还
var LAST_DEDUCTION_COUNT = 1; // 扣除次数，用于多次扣费场景（如图片分析=2次）

// 付费检查：true = 允许继续；false = 已弹出付费墙
// count: 本次消耗次数（图片分析=2，其余=1）
function checkProAccess(count) {
  count = count || 1;
  if (PRO_CREDITS === -1) return true; // 无限次码，直接通过
  if (PRO_CREDITS >= count) { PRO_CREDITS -= count; LAST_DEDUCTION = 'credit'; LAST_DEDUCTION_COUNT = count; saveProState(); updateCreditsUI(); return true; }
  if (count === 1 && !TRIAL_USED) { TRIAL_USED = true; LAST_DEDUCTION = 'trial'; LAST_DEDUCTION_COUNT = 1; saveProState(); updateCreditsUI(); return true; }
  showPaywall();
  return false;
}

// 分析失败时退还本次扣除的次数
function refundProAccess() {
  if (LAST_DEDUCTION === 'credit') { PRO_CREDITS += LAST_DEDUCTION_COUNT; saveProState(); updateCreditsUI(); }
  else if (LAST_DEDUCTION === 'trial') { TRIAL_USED = false; saveProState(); updateCreditsUI(); }
  LAST_DEDUCTION = null; LAST_DEDUCTION_COUNT = 1;
}

function showPaywall() {
  var pw = document.getElementById('paywall-overlay');
  if (pw) { pw.style.display = 'flex'; document.getElementById('act-code').value = ''; document.getElementById('act-msg').textContent = ''; }
}

function hidePaywall() {
  var pw = document.getElementById('paywall-overlay');
  if (pw) pw.style.display = 'none';
}

function selectPlan(card, label) {
  document.querySelectorAll('.plan-card').forEach(function(c){ c.style.outline='none'; c.style.boxShadow='none'; });
  card.style.outline = '1.5px solid var(--gold)';
  card.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.18)';
  var hint = document.getElementById('plan-hint');
  hint.style.display = 'block';
  hint.textContent = '已选：' + label + ' · 付款后联系获取激活码，输入下方激活';
}

function activateCode() {
  var code = document.getElementById('act-code').value.trim();
  var msg  = document.getElementById('act-msg');
  if (!code) { msg.textContent = '请输入激活码'; msg.style.color = '#E08080'; return; }
  msg.textContent = '验证中…'; msg.style.color = 'var(--ts)';
  fetch('/api/activate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code})})
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d.ok) {
        ACTIVE_CODE = code.toUpperCase().trim();
        localStorage.setItem('cma_active_code', ACTIVE_CODE);
        if (d.unlimited || d.credits === -1) {
          PRO_CREDITS = -1;
        } else {
          PRO_CREDITS += d.credits;
        }
        saveProState();
        updateCreditsUI();
        msg.textContent = d.unlimited ? '✦ 激活成功！已解锁无限次分析' : '✦ 激活成功！已解锁 ' + d.credits + ' 次分析';
        msg.style.color = '#4CAF76';
        setTimeout(hidePaywall, 1400);
      } else {
        msg.textContent = '✕ ' + (d.message || '激活失败');
        msg.style.color = '#E08080';
      }
    })
    .catch(function(){ msg.textContent = '网络错误，请稍后再试'; msg.style.color = '#E08080'; });
}

// ═══════════════════════════════════════════
// Cyber Metaphysics Architect Prompts
// ═══════════════════════════════════════════
var P = {

  fengshui: function(room, focus, desc) {
    return '你是精通《葬书》（环境风水）、三元玄空飞星与八宅明镜的 AI 数字化风水架构师（Cyber Metaphysics Architect）。结合现代环境科学与空间心理学，给出硬核、逻辑严密的环境优化报告。禁止使用"算命、迷信、改运"等词，统一替换为"能量建模、时空规律、环境优化"。语气如冷静的空间顾问，而非江湖术士。\n\n' +
      '以下是用户描述的【' + room + '】空间布局，请完全基于此描述进行专业风水诊断（不得添加描述中未提及的信息）：\n\n' +
      '【空间描述】\n' + desc + '\n\n分析侧重：' + focus + '\n\n' +
      '请进行深度系统分析，每项发现必须包含详细解释（不少于30字），改善建议必须具体可操作：\n\n' +
      '① 纳气格局——气口（门窗）位置、朝向是否合理，气流走向，旺气是否能顺利进入\n' +
      '② 藏风聚气——家具布局是否形成环抱之势，主位是否有靠山，明堂是否宽敞\n' +
      '③ 五行平衡——现有元素的五行属性分析，缺什么、过旺什么，如何补救\n' +
      '④ 形煞化解——识别所有形煞（镜煞/角煞/横梁煞/穿堂煞等），给出具体化解方案\n' +
      '⑤ 吉位激活——精确确定财位、文昌位、桃花位的具体位置与激活方法\n\n' +
      '严格返回JSON，不输出任何其他内容：\n' +
      '{"score":整数50-95,' +
      '"score_reason":"评分理由，说明扣分和加分项，50字以内",' +
      '"room_detected":"' + room + '",' +
      '"findings":[{"type":"good或warn或bad","text":"具体发现，需详细说明原因与影响，不少于30字","suggestion":"具体可操作的改善方案，不少于30字","detail":"深度解释：该问题的风水原理与长期影响，不少于40字"}],' +
      '"deep_analysis":{"qi_flow":"气流格局深度分析，80字以上","five_elements":"五行平衡分析，说明目前五行比例与建议，80字以上","sha_analysis":"形煞完整评估，无形煞时说明气场优势，60字以上","lucky_positions":"各吉位精确位置与激活方案，80字以上","improvement_priority":"按优先级列出改善步骤，100字以上"},' +
      '"directions":[{"dir":"方位","element":"五行","gua":"卦名","benefit":"具体运势影响","how_to_use":"如何利用此方位，20字以内"}],' +
      '"items":["具体风水物品及摆放位置"],' +
      '"remove":["需要移除或调整的物品，无则空数组"],' +
      '"energy_model":"[能量模型] 用百分比描述空间五行分布与能量状态，40字以内",' +
      '"risk_warning":"[风险预警] 未来30天内需要避开的方位或行为（至少2条），40字以内",' +
      '"physical_remedy":"[物理补救] 3个具体的居家/办公位调整动作，每条20字以内，numbered list",' +
      '"master_comment":"顾问综合分析，结合实际描述分析当前气场整体状况、主要问题与长期环境影响，200字以上"}';
  },

  generateReport: function(prompt) {
    return prompt + '\n\n严格返回JSON，不输出任何其他内容。deep_analysis中每个字段不少于要求字数，master_comment不少于200字。';
  },

  fengshuiVision: function(room, focus, doorDir) {
    return '你是精通《葬书》（环境风水）、三元玄空飞星与八宅明镜的 AI 数字化风水架构师（Cyber Metaphysics Architect）。结合现代环境科学与空间心理学，给出硬核、逻辑严密的环境优化报告。禁止使用"算命、迷信、改运"等词，统一替换为"能量建模、时空规律、环境优化"。语气如冷静的空间顾问，而非江湖术士。\n\n' +
      '请仔细观察我上传的【' + room + '】图片，仅基于图片中直接可见的内容进行专业风水诊断（不得臆测看不到的信息）。\n' +
      '分析侧重：' + focus + '\n' +
      (doorDir ? '入户门朝向（用户补充）：' + doorDir + '\n' : '') +
      '\n从图片中识别并深度分析五个维度（每项发现须结合图片实际内容，改善建议须具体可操作）：\n\n' +
      '① 纳气格局——识别图片中门窗位置与气口朝向，分析气流走向\n' +
      '② 藏风聚气——评估家具环抱格局、主位靠山、明堂宽敞度\n' +
      '③ 五行平衡——分析图片呈现的颜色、材质、形状对应的五行属性，指出缺失与过旺\n' +
      '④ 形煞化解——识别所有可见煞气（镜煞/角煞/横梁煞/穿堂煞等），给出具体化解方案\n' +
      '⑤ 吉位激活——确定财位、文昌位、桃花位的具体位置与激活方案\n\n' +
      '如有多张图片请综合分析。严格返回JSON，不输出任何其他内容：\n' +
      '{"score":整数50-95,' +
      '"score_reason":"评分理由，说明主要加分与扣分项，50字以内",' +
      '"room_detected":"' + room + '",' +
      '"findings":[{"type":"good或warn或bad","text":"基于图片的具体发现，不少于30字","suggestion":"具体可操作的改善方案，不少于25字","detail":"风水原理与长期影响，不少于30字"}],' +
      '"deep_analysis":{"qi_flow":"气流格局分析，60字以上","five_elements":"五行平衡分析，60字以上","sha_analysis":"形煞评估，60字以上","lucky_positions":"吉位位置与激活方案，60字以上","improvement_priority":"按优先级的改善步骤，80字以上"},' +
      '"directions":[{"dir":"方位","element":"五行","gua":"卦名","benefit":"具体运势影响","how_to_use":"利用方式，20字以内"}],' +
      '"items":["具体风水物品及摆放位置"],' +
      '"remove":["需移除或调整的物品，无则空数组"],' +
      '"master_comment":"大师综合总评，结合图片实际情况深度分析，150字以上"}';
  },

  dream: function(emotion, subjects, time, text) {
    var ctx='';
    if(emotion) ctx+='醒来感受：'+emotion+'\n';
    if(subjects&&subjects.length) ctx+='梦中出现：'+subjects.join('、')+'\n';
    if(time) ctx+='梦境时间：'+time+'\n';
    if(text) ctx+='补充细节：'+text+'\n';
    if(!ctx.trim()) ctx='（用户未填写具体信息，请根据常见梦境规律进行通用解析）\n';
    return '你是融合道家符象学、荣格原型心理学与现代潜意识分析的 AI 数字化梦境分析架构师（Cyber Metaphysics Architect）。禁止使用"算命、迷信、改运"等词，统一替换为"能量建模、时空规律、环境优化"。语气如冷静的心理分析顾问，而非江湖术士。\n\n' +
      '用户梦境信息如下：\n' + ctx + '\n' +
      '请从三个维度进行深度解析：\n' +
      '① 潜意识信号——识别每个核心意象，对照周公解梦与荣格原型，解释象征含义（每个意象至少40字）\n' +
      '② 时空规律——判断此梦对应的五行能量，分析与近期各方面运势的关联，给出0-100的运势强度评分\n' +
      '③ 行动建议——给出今日立即可执行的1个具体调整动作\n\n' +
      '严格返回JSON，不输出任何其他内容：\n' +
      '{"summary":"梦境整体解读，深度分析氛围与象征主题，不少于120字",' +
      '"element":"梦境主五行（木/火/土/金/水）",' +
      '"omen":"good或warn或bad",' +
      '"symbols":[{"icon":"emoji","name":"意象名称","meaning":"象征含义与五行对应，不少于40字","type":"吉或凶或中","significance":"对梦者的具体启示，20字以内"}],' +
      '"prediction":"综合近30天运势预测，不少于80字",' +
      '"aspects":{"career":{"text":"事业运势，25字","score":整数30-95},"wealth":{"text":"财运预测，25字","score":整数30-95},"relationship":{"text":"感情运势，25字","score":整数30-95},"health":{"text":"健康提示，25字","score":整数30-95}},' +
      '"remedy":"有凶象时：具体化解方法，无凶象则为空字符串",' +
      '"advice":"今日立即可做的1个具体行动，结合梦境内容，40字以内",' +
      '"master_comment":"顾问综合分析，不少于120字"}';
  },

  almanac: function(dateStr) {
    return '你是精通《奇门遁甲》（时空吉凶）、六壬神课与中国传统黄历历法的 AI 数字化时空规律架构师（Cyber Metaphysics Architect）。禁止使用"算命、迷信、改运"等词，统一替换为"能量建模、时空规律、环境优化"。语气如冷静的决策顾问，而非江湖术士。\n\n' +
      '今日公历日期：' + dateStr + '\n\n' +
      '请完成以下推算（每项必须有实质内容，不得敷衍）：\n' +
      '① 换算今日天干地支（年柱、月柱、日柱），说明日柱五行属性\n' +
      '② 根据日柱五行、十二建除、黄道黑道推算今日宜忌（宜至少5项，忌至少3项，每项要具体）\n' +
      '③ 推算今日当值吉神（至少2个，需说明含义）与凶煞（至少1个，需说明影响）\n' +
      '④ 推算今日最旺两个时辰（含具体时间段）与吉祥方位、吉祥颜色\n' +
      '⑤ 今日五行能量强弱分布（百分比，合计必须为100）\n\n' +
      '严格返回JSON，不输出任何其他内容：\n' +
      '{"ganzhi":"完整干支如甲子日",' +
      '"day_element":"日柱五行",' +
      '"lucky_gods":[{"name":"吉神名","meaning":"含义与今日影响，20字以内"}],' +
      '"bad_gods":[{"name":"凶煞名","meaning":"影响与注意事项，20字以内"}],' +
      '"yi":["宜1（具体说明）","宜2","宜3","宜4","宜5"],' +
      '"ji":["忌1（具体说明）","忌2","忌3"],' +
      '"lucky_hours":[{"name":"时辰名","time":"时间段","suitable":"适合做什么"},{"name":"时辰名","time":"时间段","suitable":"适合做什么"}],' +
      '"lucky_dirs":["方位1","方位2"],' +
      '"lucky_colors":["颜色1（对应五行）","颜色2（对应五行）"],' +
      '"elements":{"wood":整数,"fire":整数,"earth":整数,"metal":整数,"water":整数},' +
      '"risk_warning":"[风险预警] 今日需避开的方位或行为（2条），30字以内",' +
      '"day_summary":"今日能量建模综合分析，结合日柱五行与时空规律，不少于100字"}';
  },

  bazi: function(date, time, gender, baziStr, wxStr, dayuns, liuNian) {
    return '# Role: 数字化命理与风水架构师 (Cyber Metaphysics Architect)\n' +
      '# Context:\n' +
      '你是一个精通《子平真诠》（八字）、《奇门遁甲》（时空吉凶）及《葬书》（环境风水）的 AI 专家。你的任务是根据用户提供的原始数据，结合现代心理学和环境科学，给出硬核、逻辑严密且具有指导意义的分析报告。\n' +
      '# Logic Framework:\n' +
      '1. 八字分析：确定日主强弱、格局，并找出喜用神与忌神。\n' +
      '2. 风水布局：识别环境中的煞气，并给出五行化解方案。\n' +
      '3. 决策建议：结合奇门逻辑，针对当下时间点给出宜/忌。\n\n' +
      '以下四柱数据已由专业算法精确计算，请基于此进行深度命理解读（不得修改四柱数据）：\n\n' +
      '【精确四柱】' + baziStr + '\n' +
      '【五行分布】' + wxStr + '\n' +
      '【出生信息】公历 ' + date + '，时辰 ' + (time||'不详') + '，性别 ' + gender + '\n' +
      (dayuns ? '【大运排列】' + dayuns + '\n' : '') +
      (liuNian ? '【近年流年】' + liuNian + '\n' : '') +
      '\n请严格按以下步骤解读（四柱干支已确定，你只需分析含义）：\n' +
      '① 判断日主强弱（根据月令、得助情况综合判断），确定喜用神与忌神\n' +
      '② 判断命盘主要格局\n' +
      '③ 深度分析性格特质（结合日主与整体格局，不少于80字）\n' +
      '④ 结合大运流年，分析2025、2026、2027三年运势（每年不少于50字）\n' +
      '⑤ 根据喜用神给出居家风水布局建议\n' +
      '⑥ 结合时空规律输出宜/忌建议\n\n' +
      '严格返回JSON，不输出任何其他内容：\n' +
      '{"daymaster":"日主如丙火",' +
      '"daymaster_strength":"strong或weak",' +
      '"strength_reason":"判断依据，40字以内",' +
      '"pattern":"格局名称",' +
      '"pattern_reason":"判断依据，30字以内",' +
      '"yong_shen":"喜用神五行",' +
      '"ji_shen":"忌神五行",' +
      '"shen_reason":"喜用忌神理由，40字以内",' +
      '"character":"性格特质，不少于80字",' +
      '"current_dayun":"当前大运干支",' +
      '"yearly_fortune":[' +
      '{"year":"2025","ganzhi":"流年干支","forecast":"运势分析，不少于50字","key_period":"关键节点","rating":"good或warn或bad"},' +
      '{"year":"2026","ganzhi":"流年干支","forecast":"运势分析，不少于50字","key_period":"关键节点","rating":"good或warn或bad"},' +
      '{"year":"2027","ganzhi":"流年干支","forecast":"运势分析，不少于50字","key_period":"关键节点","rating":"good或warn或bad"}],' +
      '"decision_advice":{"yi":["宜1","宜2"],"ji":["忌1","忌2"]},' +
      '"energy_model":"[能量模型] 用百分比描述五行分布与当前能量状态，40字以内",' +
      '"pattern_diagnosis":"[格局诊断] 性格特质与当前职场/财运核心瓶颈，不少于60字",' +
      '"risk_warning":"[风险预警] 未来30天内需要避开的具体方位或行为（至少2条），40字以内",' +
      '"physical_remedy":["动作1","动作2","动作3"],' +
      '"fengshui_intro":"环境优化布局总说明，60字以内",' +
      '"fengshui_advice":{"lucky_dirs":["方位（原因）"],"lucky_colors":["颜色（对应五行）"],"lucky_items":["物品（摆放位置与作用）"],"avoid_dirs":["忌位（原因）"]},' +
      '"findings":[{"type":"good或warn","text":"命盘特点，不少于30字","suggestion":"具体建议"}],' +
      '"master_comment":"顾问综合解读，不少于250字"}';
  },


  wealth: function(date, time, gender, goal, baziStr, wxStr) {
    return '你是精通《子平真诠》财格分析、《奇门遁甲》财运时空规律的 AI 数字化命理与风水架构师（Cyber Metaphysics Architect）。结合现代财务心理学与环境科学给出逻辑严密的财运分析报告。禁止使用"算命、迷信、改运"等词，统一替换为"能量建模、时空规律、环境优化"。语气如冷静的财务顾问，而非江湖术士。\n\n' +
      '以下四柱数据已由专业算法精确计算，请基于此进行深度财运分析：\n\n' +
      '【精确四柱】' + baziStr + '\n' +
      '【五行分布】' + wxStr + '\n' +
      '【出生信息】公历 ' + date + '，时辰 ' + (time||'不详') + '，性别 ' + gender + '\n' +
      '【财务目标】' + goal + '\n\n' +
      '请严格按步骤分析（四柱已确定，你只需分析财运含义）：\n' +
      '① 分析财星（正财/偏财）在四柱中的位置与强弱\n' +
      '② 判断财格类型与此格局最适合的求财方式\n' +
      '③ 深度分析正财运势（不少于80字）\n' +
      '④ 深度分析偏财运势（不少于80字）\n' +
      '⑤ 确定财神方位与旺财布局\n' +
      '⑥ 推算旺财吉祥物（5件）\n' +
      '⑦ 分析2025-2027财运周期\n' +
      '⑧ 列出财运忌讳与化解\n\n' +
      '严格返回JSON，不输出任何其他内容：\n' +
      '{"score":整数40-95,' +
      '"score_reason":"财运评分理由，40字以内",' +
      '"daymaster":"日主",' +
      '"caige":"财格名称",' +
      '"caige_detail":"财格分析，不少于80字",' +
      '"caige_findings":[{"type":"good或warn或bad","text":"财格特点，不少于30字","suggestion":"建议"}],' +
      '"zhengcai":"正财运势深度分析，不少于80字",' +
      '"piancai":"偏财运势深度分析，不少于80字",' +
      '"directions":[{"dir":"方位","element":"五行","role":"财神类型","how":"旺财方法，20字以内"}],' +
      '"energy_model":"[能量模型] 五行分布与财星能量占比描述，40字以内",' +
      '"risk_warning":"[风险预警] 未来30天内财运需避开的方位或行为（至少2条），40字以内",' +
      '"physical_remedy":"[物理补救] 3个具体的居家/办公财位调整动作，每条20字以内，numbered list",' +
      '"layout":"旺财环境优化布局建议，不少于100字",' +
      '"items":[{"name":"物品","position":"摆放位置","effect":"作用，20字以内"}],' +
      '"items_detail":"使用注意事项，40字以内",' +
      '"current_dayun":"当前大运",' +
      '"yearly_fortune":[' +
      '{"year":"2025","ganzhi":"流年干支","wealth_trend":"财运走势，不少于50字","best_months":"旺财月份","rating":"good或warn或bad"},' +
      '{"year":"2026","ganzhi":"流年干支","wealth_trend":"财运走势，不少于50字","best_months":"旺财月份","rating":"good或warn或bad"},' +
      '{"year":"2027","ganzhi":"流年干支","wealth_trend":"财运走势，不少于50字","best_months":"旺财月份","rating":"good或warn或bad"}],' +
      '"taboo":[{"item":"忌讳","reason":"原因，20字以内","solution":"化解，20字以内"}],' +
      '"master_comment":"顾问财运总评，不少于250字"}';
  },


  followup: function(context, question) {
    return '你是精通风水堪舆与命理时空规律的 AI 数字化顾问（Cyber Metaphysics Architect）。禁止使用"算命、迷信、改运"等词，统一替换为"能量建模、时空规律、环境优化"。语气如冷静的咨询顾问。\n\n' +
      '用户的风水报告摘要：\n' + context + '\n\n' +
      '用户追问：「' + question + '」\n\n' +
      '请给出精准可操作的专业回答。严格返回JSON，不输出其他内容：\n' +
      '{"conclusion":"核心结论，一句话点明最重要答案，30字以内",' +
      '"key_points":[{"label":"要点标题","content":"具体内容30-50字","type":"action或warning或tip"}],' +
      '"quick_action":"立刻可做的最重要一步，20字以内",' +
      '"note":"注意事项或补充，如无则空字符串，30字以内"}';
  }
};

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════
function callAPI(content, tokens, ok, fail, images, moduleKey) {
  var msgContent = content;
  if (images && images.length) {
    msgContent = [{type:'text', text:content}];
    images.forEach(function(img){ msgContent.push({type:'image_url', image_url:{url:img.dataUrl}}); });
  }
  fetch(API, {
    method:'POST', headers:{'Content-Type':'application/json','X-CMA-Token': window.__CMA_T||''},
    body: JSON.stringify({module_key:moduleKey||'followup', max_tokens:tokens, messages:[{role:'user',content:msgContent}]})
  })
  .then(function(r){return r.json();})
  .then(function(d){
    if(d.error){fail(d.error.message);return;}
    var txt=''; (d.content||[]).forEach(function(c){if(c.type==='text')txt+=c.text;});
    // 剥除 markdown 代码围栏再判断是否 JSON
    var stripped=txt.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    var s=stripped.indexOf('{'),e=stripped.lastIndexOf('}');
    if(s>=0&&e>s){
      try{reportUsage();ok(JSON.parse(stripped.substring(s,e+1)));}
      catch(err){reportUsage();ok(stripped);}
    } else { reportUsage();ok(stripped); }
  })
  .catch(function(){ fail('代理连接失败，请确认 proxy.js 已启动'); });
}

function renderPromptFromBackend(key, vars, fallback, ok) {
  fetch('/api/prompt/render', {
    method:'POST',
    headers:{'Content-Type':'application/json','X-CMA-Token': window.__CMA_T||''},
    body: JSON.stringify({key:key, vars:vars||{}})
  })
  .then(function(r){return r.json();})
  .then(function(d){
    if(d&&d.ok&&d.prompt) ok(d.prompt);
    else ok(typeof fallback==='function'?fallback():fallback);
  })
  .catch(function(){ ok(typeof fallback==='function'?fallback():fallback); });
}

function animProg(fId,pId,lId,steps,ms){
  var i=0,iv=setInterval(function(){
    if(i>=steps.length){clearInterval(iv);return;}
    document.getElementById(fId).style.width=steps[i].pct+'%';
    document.getElementById(pId).textContent=steps[i].pct+'%';
    document.getElementById(lId).textContent=steps[i].lbl;
    i++;
  },ms); return iv;
}

function elBars(id,els){
  var el=document.getElementById(id);if(!el)return;
  var cfg=[{k:'wood',n:'木',c:'#4CAF76'},{k:'fire',n:'火',c:'#E05050'},{k:'earth',n:'土',c:'#C9A84C'},{k:'metal',n:'金',c:'#A0A0C0'},{k:'water',n:'水',c:'#5090E0'}];
  el.innerHTML='';
  cfg.forEach(function(c){
    var v=els[c.k]||0;
    el.insertAdjacentHTML('beforeend','<div class="el-bar-row"><div class="el-bar-label">'+c.n+'</div><div class="el-bar-track"><div class="el-bar-fill" style="width:'+v+'%;background:'+c.c+'"></div></div><div class="el-bar-val">'+v+'%</div></div>');
  });
}

function err(id,msg){var e=document.getElementById(id);if(!e)return;e.textContent=msg;e.classList.add('on');}
function noerr(id){var e=document.getElementById(id);if(!e)return;e.classList.remove('on');}
function arrify(v){
  if(Array.isArray(v)) return v.filter(Boolean);
  if(typeof v==='string'){
    return v.split(/\n|(?:\d+\.\s*)|[；;]/).map(function(x){return x.trim();}).filter(Boolean);
  }
  return [];
}

// ═══════════════════════════════════════════
// 历史记录
// ═══════════════════════════════════════════
function saveHistory(type, title, score, data) {
  try {
    var history = JSON.parse(localStorage.getItem('fengshui_history') || '[]');
    history.unshift({type:type, title:title, score:score, data:data, time:new Date().toLocaleString('zh')});
    if(history.length > 30) history = history.slice(0, 30);
    localStorage.setItem('fengshui_history', JSON.stringify(history));
    renderHistory();
    renderReportCenter();
  } catch(e){}
}

function renderHistory() {
  try {
    var history = JSON.parse(localStorage.getItem('fengshui_history') || '[]');
    var section = document.getElementById('home-history');
    var list = document.getElementById('history-list');
    if(!history.length){section.style.display='none';return;}
    section.style.display='block';
    list.innerHTML='';
    history.forEach(function(h){
      list.insertAdjacentHTML('beforeend',
        '<div class="history-item"><div class="history-item-left">' +
        '<div class="history-item-title">'+h.title+'</div>' +
        '<div class="history-item-meta">'+h.type+' · '+h.time+'</div></div>' +
        (h.score?'<div class="history-item-score">'+h.score+'</div>':'') +
        '</div>');
    });
  } catch(e){}
}

function summarizeReportData(data){
  if(!data)return '暂无摘要';
  if(typeof data==='string')return data.substring(0,260);
  if(data.result){
    return (data.result.summary||'') + (data.result.analysis?'\n'+data.result.analysis:'');
  }
  return data.master_comment || data.summary || data.day_summary || data.prediction ||
    data.caige_detail || data.character || data.analysis || '已保存完整结构化报告，可继续查看或生成同类深度分析。';
}

function reportTargetByType(type){
  if(type.indexOf('财运')>=0)return 'wealth';
  if(type.indexOf('命理')>=0)return 'profile';
  if(type.indexOf('风水')>=0)return 'analyzer';
  if(type.indexOf('解梦')>=0)return 'dream';
  if(type.indexOf('黄历')>=0)return 'almanac';
  return 'ask';
}

function renderReportCenter(){
  try{
    var list=document.getElementById('report-center-list');
    if(!list)return;
    var history=JSON.parse(localStorage.getItem('fengshui_history')||'[]');
    list.innerHTML='';
    if(!history.length){
      list.innerHTML='<div class="report-empty">还没有生成报告。可以先从快捷问事、命理报告、家宅风水或财运分析开始。</div>';
      return;
    }
    history.forEach(function(h,idx){
      var item=document.createElement('div');
      item.className='report-center-item';
      var summary=summarizeReportData(h.data).substring(0,320);
      item.innerHTML=
        '<div class="report-center-head"><div><div class="report-center-title"></div><div class="report-center-meta"></div></div>'+
        (h.score?'<div class="report-center-score"></div>':'')+'</div>'+
        '<div class="report-center-summary"></div>'+
        '<div class="report-center-actions"><button class="btn-ghost" data-open-report="'+idx+'">查看详情</button><button class="btn-ghost" data-repeat="'+reportTargetByType(h.type)+'">继续分析</button></div>';
      item.querySelector('.report-center-title').textContent=h.title||'未命名报告';
      item.querySelector('.report-center-meta').textContent=(h.type||'报告')+' · '+(h.time||'');
      item.querySelector('.report-center-summary').textContent=summary;
      var scoreEl=item.querySelector('.report-center-score');
      if(scoreEl)scoreEl.textContent=h.score;
      list.appendChild(item);
    });
  }catch(e){}
}

document.getElementById('clear-history-btn').addEventListener('click',function(){
  localStorage.removeItem('fengshui_history'); renderHistory(); renderReportCenter();
});
document.getElementById('refresh-reports-btn').addEventListener('click',renderReportCenter);
document.getElementById('clear-reports-btn').addEventListener('click',function(){
  if(!confirm('确定清空所有本地报告记录？'))return;
  localStorage.removeItem('fengshui_history'); renderHistory(); renderReportCenter();
});
document.getElementById('report-center-list').addEventListener('click',function(e){
  var detail=e.target.closest('[data-open-report]');
  var repeat=e.target.closest('[data-repeat]');
  if(repeat){goTo(repeat.getAttribute('data-repeat'));return;}
  if(!detail)return;
  var idx=parseInt(detail.getAttribute('data-open-report'));
  try{
    var history=JSON.parse(localStorage.getItem('fengshui_history')||'[]');
    var h=history[idx]; if(!h)return;
    alert((h.title||'报告详情')+'\n\n'+summarizeReportData(h.data).substring(0,900));
  }catch(err){}
});

// ═══════════════════════════════════════════
// 导航
// ═══════════════════════════════════════════
function goTo(p){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('on');});
  document.querySelector('[data-p="'+p+'"]').classList.add('on');
  document.querySelectorAll('.page').forEach(function(x){x.classList.remove('on');});
  document.getElementById('page-'+p).classList.add('on');
  if(p==='reports')renderReportCenter();
  window.scrollTo(0,0);
}
document.getElementById('tabs').addEventListener('click',function(e){var b=e.target.closest('.tab');if(b)goTo(b.getAttribute('data-p'));});
// model-select 已移除，SELECTED_MODEL 固定为 claude-sonnet-4.6
document.getElementById('mods').addEventListener('click',function(e){var m=e.target.closest('[data-goto]');if(m)goTo(m.getAttribute('data-goto'));});
document.getElementById('logo-home').addEventListener('click',function(){goTo('home');});
updateCreditsUI(); // 初始化显示剩余次数

// 用量上报（分析成功后调用，不影响主流程）
function reportUsage(){
  if(!ACTIVE_CODE) return;
  fetch('/api/use-credit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:ACTIVE_CODE})}).catch(function(){});
}

// ═══════════════════════════════════════════
// 快捷问事：按问题类型判断是否需要八字
// ═══════════════════════════════════════════
function classifyQuickQuestion(q){
  q=String(q||'').toLowerCase();
  function has(arr){return arr.some(function(w){return q.indexOf(w)>=0;});}
  if(has(['合盘','合婚','配不配','适不适合在一起','复合'])) return {category:'compatibility',label:'合盘/关系匹配',birth:'required'};
  if(has(['流年','今年','明年','未来','三个月','半年','月运','运势','转运','不顺','低谷'])) return {category:'fortune',label:'运势趋势',birth:'required'};
  if(has(['财运','求财','赚钱','投资','破财','副业','涨薪','收入'])) return {category:'wealth',label:'财富运势',birth:'required'};
  if(has(['事业','工作','跳槽','创业','面试','升职','合作'])) return {category:'career',label:'事业决策',birth:'required'};
  if(has(['感情','婚姻','恋爱','桃花','结婚','离婚','对象'])) return {category:'relationship',label:'感情婚恋',birth:'required'};
  if(has(['签约','合同','开业','搬家','入宅','领证','提车','装修','动土','表白','见客户','今天','明天','日期','吉日','吉时'])) return {category:'timing',label:'今日/择日决策',birth:'optional'};
  if(has(['梦到','做梦','梦见','梦里'])) return {category:'dream',label:'梦境解析',birth:'none'};
  if(has(['户型','房子','住宅','卧室','客厅','厨房','办公桌','镜子','床头','财位','朝向','风水'])) return {category:'fengshui',label:'家宅风水',birth:'none'};
  return {category:'general',label:'综合问事',birth:'optional'};
}

function fillQuickBirthFromStorage(){
  if(CURRENT_USER && CURRENT_USER.profile){
    applyProfileToForms(CURRENT_USER.profile);
    return;
  }
  try{
    var p=JSON.parse(localStorage.getItem('cma_birth_profile')||'null');
    if(!p)return;
    if(p.date)document.getElementById('ask-bday').value=p.date;
    if(p.hour!==null&&p.hour!==undefined)document.getElementById('ask-bhour').value=String(p.hour);
    if(p.gender)document.getElementById('ask-gender').value=p.gender.indexOf('女')>=0?'女':'男';
  }catch(e){}
}
fillQuickBirthFromStorage();

document.getElementById('ask-samples').addEventListener('click',function(e){
  var s=e.target.closest('.ask-sample');if(!s)return;
  document.getElementById('ask-question').value=s.textContent;
  document.getElementById('ask-question').focus();
});

function getQuickBirth(){
  var date=document.getElementById('ask-bday').value;
  if(!date)return null;
  var sel=document.getElementById('ask-bhour');
  return {
    date:date,
    hour:sel.value===''?null:parseInt(sel.value),
    timeLabel:sel.options[sel.selectedIndex].text,
    gender:document.getElementById('ask-gender').value,
    birthplace:document.getElementById('ask-birthplace').value.trim()
  };
}

function normalizeAskText(v){
  if(v == null) return '';
  if(typeof v === 'object') return JSON.stringify(v);
  var s=String(v).trim();
  try{
    var parsed=JSON.parse(s.replace(/```json|```/g,'').trim());
    if(parsed&&typeof parsed==='object'){
      return parsed.analysis||parsed.summary||JSON.stringify(parsed);
    }
  }catch(e){}
  return s.replace(/```json|```/g,'').trim();
}

function renderQuickAskCtas(category){
  var row=document.getElementById('ask-cta-row');
  if(!row)return;
  row.innerHTML='';
  var ctas=[];
  if(['wealth','fortune','career','relationship','compatibility'].indexOf(category)>=0){
    ctas.push({label:'生成命理报告',target:'profile'});
  }
  if(category==='wealth')ctas.push({label:'深度财运分析',target:'wealth'});
  if(category==='fengshui')ctas.push({label:'上传户型做风水诊断',target:'analyzer'});
  if(category==='dream')ctas.push({label:'继续梦境解析',target:'dream'});
  if(category==='timing'||category==='general')ctas.push({label:'查看今日黄历',target:'almanac'});
  ctas.push({label:'查看报告中心',target:'reports'});
  ctas.push({label:'开通/激活次数',action:'paywall'});
  ctas.forEach(function(c){
    var btn=document.createElement('button');
    btn.className='ask-cta';
    btn.textContent=c.label;
    btn.addEventListener('click',function(){
      if(c.action==='paywall')showPaywall();
      else goTo(c.target);
    });
    row.appendChild(btn);
  });
}

document.getElementById('ask-btn').addEventListener('click',function(){
  var q=document.getElementById('ask-question').value.trim();
  if(!q){err('ask-err','请先输入你想问的事情');return;}
  var cls=classifyQuickQuestion(q);
  var birth=getQuickBirth();
  var panel=document.getElementById('ask-birth-panel');
  if(cls.birth==='required'&&!birth){
    panel.classList.add('show');
    err('ask-err','这个问题需要结合个人命理判断，请先补充出生日期。');
    return;
  }
  if(cls.birth==='optional'&&!birth) panel.classList.remove('show');
  if(!checkProAccess())return;

  noerr('ask-err');
  document.getElementById('ask-result').classList.remove('show');
  document.getElementById('ask-loading').classList.add('on');
  document.getElementById('ask-btn').disabled=true;
  fetch('/api/quick-ask',{method:'POST',headers:{'Content-Type':'application/json','X-CMA-Token':window.__CMA_T||''},
    body:JSON.stringify({question:q,birth:birth})
  }).then(function(r){return r.json();}).then(function(j){
    if(j.error)throw new Error(j.error.message||'快捷问事失败');
    if(j.needs_birth){
      refundProAccess();
      panel.classList.add('show');
      err('ask-err',j.message||'请补充出生信息后再问');
      return;
    }
    var d=j.data||{};
    document.getElementById('ask-category').textContent=j.category_label||cls.label;
    document.getElementById('ask-summary').textContent=normalizeAskText(d.summary)||'已完成基础判断';
    document.getElementById('ask-analysis').textContent=normalizeAskText(d.analysis);
    var actions=document.getElementById('ask-actions');actions.innerHTML='';
    arrify(d.actions).forEach(function(a){
      var div=document.createElement('div');
      div.className='ask-action';
      div.textContent=a;
      actions.appendChild(div);
    });
    document.getElementById('ask-upgrade').textContent=d.upgrade_hint||d.timing||'可继续生成深度报告或开启提醒。';
    document.getElementById('ask-consult').textContent=d.consult_hint||'涉及买房、投资、婚姻、开业等高成本决策时，建议进一步真人咨询。';
    renderQuickAskCtas(j.category||cls.category);
    document.getElementById('ask-result').classList.add('show');
    if(j.warning&&d.fallback){
      refundProAccess();
      document.getElementById('ask-upgrade').textContent=(d.upgrade_hint||'')+' 当前为本地基础版；配置模型 API Key 后可启用深度 AI 分析。';
    } else {
      reportUsage();
    }
    saveHistory('快捷问事', q.substring(0,20), '', {question:q,result:d,category:j.category_label||cls.label});
  }).catch(function(e){
    refundProAccess();
    err('ask-err',e.message||'快捷问事连接失败，请确认代理已启动');
  }).finally(function(){
    document.getElementById('ask-loading').classList.remove('on');
    document.getElementById('ask-btn').disabled=false;
  });
});

// ═══════════════════════════════════════════
// 空间分析
// ═══════════════════════════════════════════
var origPrompt='', reportContext='';

function setStep(n){
  for(var i=0;i<3;i++){
    var el=document.getElementById('sf'+i),dot=el.querySelector('.step-num');
    el.classList.remove('done','act');dot.classList.remove('done','act');
    if(i<n){el.classList.add('done');dot.classList.add('done');dot.textContent='✓';}
    else if(i===n){el.classList.add('act');dot.classList.add('act');dot.textContent=i+1;}
    else{dot.textContent=i+1;}
  }
}

// 字数统计
// room-desc 字数统计（文字模式下）
var roomDescEl=document.getElementById('room-desc');
if(roomDescEl) roomDescEl.addEventListener('input',function(){
  var n=this.value.length;
  var el=document.getElementById('char-count');
  if(el){ el.textContent=n+' 字 · '+(n<30?'建议补充更多细节':'内容充足，可以开始分析'); el.className='char-count'+(n>0&&n<30?' warn':''); }
});

// ─── 解梦引导芯片 ───
document.querySelectorAll('#page-dream .gchip').forEach(function(chip){
  chip.addEventListener('click',function(){
    var ta=document.getElementById('dreamtxt');
    ta.value+=chip.getAttribute('data-text'); ta.focus();
  });
});

// ─── 空间分析：图片上传 ───
var UPLOAD_IMAGES=[null,null,null]; // {dataUrl, mimeType}
var SELECTED_DOOR_DIR='';
var azDefaultPrompt=''; // 当前默认指令（用于reset）

function setupImageSlot(idx){
  var input=document.getElementById('ufile-'+idx);
  var inner=document.getElementById('uslot-inner-'+idx);
  var slot=document.getElementById('uslot-'+idx);
  inner.addEventListener('click',function(){ input.click(); });
  input.addEventListener('change',function(){
    var file=input.files[0]; if(!file)return;
    if(file.size>10*1024*1024){err('az-err','图片过大，单张请控制在 10MB 以内');return;}
    var reader=new FileReader();
    reader.onload=function(e){
      UPLOAD_IMAGES[idx]={dataUrl:e.target.result,mimeType:file.type};
      inner.innerHTML='<img class="uslot-img" src="'+e.target.result+'" alt="图片'+idx+'">';
      // add delete button
      var del=document.createElement('button');
      del.className='uslot-del';del.textContent='✕';del.title='删除';
      del.addEventListener('click',function(ev){
        ev.stopPropagation();
        UPLOAD_IMAGES[idx]=null;
        inner.innerHTML=getSlotDefaultHTML(idx);
        slot.classList.remove('has-img');
        input.value='';
      });
      slot.classList.add('has-img');
      slot.appendChild(del);
      noerr('az-err');
    };
    reader.readAsDataURL(file);
  });
}
function getSlotDefaultHTML(idx){
  var icons=['📷','🚪','🔍'],labels=['主视角','入户门/玄关','问题区域'],hints=['必传 · 房间全景','选填','选填'];
  return '<div class="uslot-icon">'+icons[idx]+'</div><div class="uslot-label">'+labels[idx]+'</div><div class="uslot-hint">'+hints[idx]+'</div>';
}
setupImageSlot(0); setupImageSlot(1); setupImageSlot(2);

// 方位选择
document.getElementById('door-dir-row').addEventListener('click',function(e){
  var btn=e.target.closest('.dir-btn');if(!btn)return;
  var wasOn=btn.classList.contains('on');
  document.querySelectorAll('.dir-btn').forEach(function(b){b.classList.remove('on');});
  if(!wasOn){btn.classList.add('on');SELECTED_DOOR_DIR=btn.dataset.dir;}
  else SELECTED_DOOR_DIR='';
});

// 文字模式切换
document.getElementById('text-mode-toggle').addEventListener('click',function(){
  var panel=document.getElementById('text-mode-panel');
  var isHidden=panel.style.display==='none'||panel.style.display==='';
  panel.style.display=isHidden?'block':'none';
  this.textContent=isHidden?'📷 切换回图片上传模式':'📝 没有图片？切换文字描述模式';
  // update cost notice
  var notice=document.querySelector('.cost-notice');
  if(notice) notice.innerHTML=isHidden?
    '📝 文字描述模式消耗 <strong style="color:var(--gold)">1次</strong>':
    '📷 图片分析消耗 <strong style="color:var(--gold)">2次</strong> &nbsp;·&nbsp; 文字描述模式消耗 <strong style="color:var(--gold)">1次</strong>';
});

// 高级模式切换
document.getElementById('adv-toggle').addEventListener('click',function(){
  var panel=document.getElementById('adv-panel');
  var opening=!panel.classList.contains('show');
  panel.classList.toggle('show');
  if(opening){
    // 自动生成当前默认指令填入
    var room=document.getElementById('roomtype').value;
    var focus=document.getElementById('focus').value;
    var textPanel=document.getElementById('text-mode-panel');
    var isText=textPanel.style.display!=='none'&&textPanel.style.display!=='';
    if(isText){
      var desc=document.getElementById('room-desc').value.trim();
      azDefaultPrompt=P.fengshui(room,focus,desc||'（待填写）');
    } else {
      azDefaultPrompt=P.fengshuiVision(room,focus,SELECTED_DOOR_DIR);
    }
    var ta=document.getElementById('prompt-ta');
    if(!ta.value) ta.value=azDefaultPrompt;
  }
});

// 重置指令
document.getElementById('reset-btn').addEventListener('click',function(){
  var room=document.getElementById('roomtype').value;
  var focus=document.getElementById('focus').value;
  var textPanel=document.getElementById('text-mode-panel');
  var isText=textPanel.style.display!=='none'&&textPanel.style.display!=='';
  if(isText){
    var desc=document.getElementById('room-desc').value.trim();
    azDefaultPrompt=P.fengshui(room,focus,desc||'（待填写）');
  } else {
    azDefaultPrompt=P.fengshuiVision(room,focus,SELECTED_DOOR_DIR);
  }
  document.getElementById('prompt-ta').value=azDefaultPrompt;
});

// 主生成按钮
document.getElementById('generate-btn').addEventListener('click',function(){
  var textPanel=document.getElementById('text-mode-panel');
  var isTextMode=textPanel.style.display!=='none'&&textPanel.style.display!=='';
  var hasImages=UPLOAD_IMAGES.some(Boolean);

  if(!hasImages&&!isTextMode){
    err('az-err','请上传至少一张房间图片，或切换到文字描述模式');return;
  }
  if(isTextMode){
    var desc=document.getElementById('room-desc').value.trim();
    if(!desc||desc.length<10){err('az-err','请描述您的空间布局（至少10字）');return;}
  }

  var creditCost=isTextMode?1:2;
  if(!checkProAccess(creditCost))return;

  var room=document.getElementById('roomtype').value;
  var focus=document.getElementById('focus').value;

  // 确定分析指令
  var advOpen=document.getElementById('adv-panel').classList.contains('show');
  var customPrompt=advOpen?document.getElementById('prompt-ta').value.trim():'';
  var images=isTextMode?[]:UPLOAD_IMAGES.filter(Boolean);

  noerr('az-err');
  document.getElementById('generate-btn').disabled=true;
  document.getElementById('prog2').classList.add('on');
  var progLabels=isTextMode?
    [{pct:20,lbl:'推算八卦方位...'},{pct:55,lbl:'深度分析五行格局...'},{pct:85,lbl:'生成深度风水报告...'}]:
    [{pct:15,lbl:'AI 识别图像格局...'},{pct:45,lbl:'推算五行能量分布...'},{pct:80,lbl:'生成深度风水报告...'}];
  var iv=animProg('p2fill','p2pct','p2lbl',progLabels,900);

  function runAnalyzer(prompt){
    callAPI(prompt,4000,
      function(j){
        clearInterval(iv);
        document.getElementById('p2fill').style.width='100%';
        document.getElementById('p2pct').textContent='100%';
        document.getElementById('p2lbl').textContent='深度报告生成完成 ✓';
        setTimeout(function(){
          document.getElementById('prog2').classList.remove('on');
          document.getElementById('generate-btn').disabled=false;
          document.getElementById('az-input-section').style.display='none';
          renderReport(j);
        },400);
      },
      function(msg){
        clearInterval(iv);
        document.getElementById('prog2').classList.remove('on');
        document.getElementById('generate-btn').disabled=false;
        refundProAccess();
        err('az-err',msg);
      },
      images,
      'fengshui'
    );
  }

  if(customPrompt){
    runAnalyzer(customPrompt);
  } else {
    var desc2=isTextMode?document.getElementById('room-desc').value.trim():'';
    var fallback=function(){return isTextMode?P.fengshui(room,focus,desc2):P.fengshuiVision(room,focus,SELECTED_DOOR_DIR);};
    renderPromptFromBackend('fengshui_analysis', {
      mode:isTextMode?'文字描述':'图片识别',
      room:room,
      focus:focus,
      door_dir:SELECTED_DOOR_DIR||'未填写',
      desc:desc2||'（图片模式或用户未填写文字描述）'
    }, fallback, runAnalyzer);
  }
});

function renderReport(d){
  document.getElementById('rpt').style.display='block';
  var sc=d.score||70;
  document.getElementById('snum').textContent=sc;
  document.getElementById('rtitle').textContent=(d.room_detected||'')+'风水深度分析报告';
  document.getElementById('score-desc').textContent=d.score_reason||'';
  setTimeout(function(){document.getElementById('scorefill').style.width=sc+'%';},300);

  var fl=document.getElementById('findings');fl.innerHTML='';
  (d.findings||[]).forEach(function(f){
    var c=f.type==='good'?'dg':f.type==='warn'?'dw':'db';
    var el=document.createElement('div');el.className='frow';
    el.innerHTML='<div class="dot '+c+'" style="margin-top:4px"></div><div style="flex:1">' +
      '<div class="ft" contenteditable="true">'+f.text+'</div>' +
      (f.detail?'<div style="font-size:12px;color:var(--td);margin-top:4px;line-height:1.7;font-style:italic">'+f.detail+'</div>':'') +
      (f.suggestion?'<div class="fs" contenteditable="true">✦ '+f.suggestion+'</div>':'') +
      '</div>';
    fl.appendChild(el);
  });

  // 深度分析
  var da=d.deep_analysis;
  if(da){
    document.getElementById('deep-analysis-card').style.display='block';
    var daEl=document.getElementById('deep-analysis');daEl.innerHTML='';
    var daItems=[
      {label:'气流格局',val:da.qi_flow},
      {label:'五行平衡',val:da.five_elements},
      {label:'形煞评估',val:da.sha_analysis},
      {label:'吉位激活',val:da.lucky_positions},
      {label:'优先改善步骤',val:da.improvement_priority}
    ];
    daItems.forEach(function(item){
      if(!item.val)return;
      daEl.insertAdjacentHTML('beforeend',
        '<div style="margin-bottom:13px;padding:12px;background:var(--ink3);border-radius:8px;border:0.5px solid var(--b)">' +
        '<div style="font-size:11px;color:var(--gold);font-weight:600;margin-bottom:7px;letter-spacing:.08em">'+item.label+'</div>' +
        '<div style="font-size:13px;color:var(--tp);line-height:1.9" contenteditable="true">'+item.val+'</div></div>');
    });
  }

  var dg=document.getElementById('dirs');dg.innerHTML='';
  (d.directions||[]).forEach(function(dir){
    dg.insertAdjacentHTML('beforeend',
      '<div class="dc"><div class="dn">'+dir.dir+'</div>' +
      '<div class="dcn">'+dir.element+'·'+dir.gua+'</div>' +
      '<div class="dl">'+dir.benefit+'</div>' +
      (dir.how_to_use?'<div style="font-size:10px;color:var(--td);margin-top:3px;line-height:1.4">'+dir.how_to_use+'</div>':'') +
      '</div>');
  });

  var il=document.getElementById('items');il.innerHTML='';
  (d.items||[]).forEach(function(it){il.insertAdjacentHTML('beforeend','<span class="pill pt" contenteditable="true">'+it+'</span>');});
  var rs=document.getElementById('removes');rs.innerHTML='';
  if(d.remove&&d.remove.length){
    document.getElementById('remove-section').style.display='block';
    d.remove.forEach(function(it){rs.insertAdjacentHTML('beforeend','<span class="pill pr" contenteditable="true">'+it+'</span>');});
  }

  document.getElementById('comment').textContent=d.master_comment||'';

  // 保存报告 context 用于追问
  reportContext='房间：'+(d.room_detected||'')+'，气场评分：'+sc+'。'+'\n核心发现：'+(d.findings||[]).map(function(f){return f.text;}).join('；')+'。\n大师总评：'+(d.master_comment||'');
  LAST_ANALYZER_DATA = d;
  ANALYZER_FOLLOWUPS = [];
  saveHistory('风水分析', (d.room_detected||'空间')+'风水分析', sc, d);

  document.getElementById('followup-answer').classList.remove('show');
  document.getElementById('followup-input').value='';
  document.getElementById('rpt').scrollIntoView({behavior:'smooth',block:'start'});
}

document.getElementById('re-gen-btn').addEventListener('click',function(){
  document.getElementById('rpt').style.display='none';
  document.getElementById('az-input-section').style.display='block';
  document.getElementById('generate-btn').disabled=false;
  window.scrollTo(0,0);
});
document.getElementById('copy-btn').addEventListener('click',function(){
  var lines=[document.getElementById('rtitle').textContent,'气场评分：'+document.getElementById('snum').textContent,''];
  document.querySelectorAll('#findings .frow').forEach(function(r){
    var ft=r.querySelector('.ft'),fs=r.querySelector('.fs');
    if(ft)lines.push('• '+ft.textContent+(fs?'\n  建议：'+fs.textContent.replace('✦ ',''):''));
  });
  var da=document.getElementById('deep-analysis');
  if(da.children.length){
    lines.push('\n【深度分析】');
    Array.from(da.children).forEach(function(c){
      var lbl=c.querySelector('div:first-child'),txt=c.querySelector('[contenteditable]');
      if(lbl&&txt)lines.push(lbl.textContent+'：'+txt.textContent);
    });
  }
  lines.push('\n【大师总评】\n'+document.getElementById('comment').textContent);
  navigator.clipboard.writeText(lines.join('\n')).then(function(){
    var btn=document.getElementById('copy-btn');
    btn.textContent='已复制 ✓'; setTimeout(function(){btn.textContent='复制报告';},2000);
  });
});
document.getElementById('restart-btn').addEventListener('click',function(){
  document.getElementById('rpt').style.display='none';
  document.getElementById('az-input-section').style.display='block';
  document.getElementById('generate-btn').disabled=false;
  // 重置图片
  UPLOAD_IMAGES=[null,null,null];
  [0,1,2].forEach(function(i){
    var slot=document.getElementById('uslot-'+i);
    var inner=document.getElementById('uslot-inner-'+i);
    if(inner) inner.innerHTML=getSlotDefaultHTML(i);
    if(slot) slot.classList.remove('has-img');
    var del=slot&&slot.querySelector('.uslot-del');
    if(del) del.remove();
    var inp=document.getElementById('ufile-'+i);
    if(inp) inp.value='';
  });
  window.scrollTo(0,0);
});

// 追问功能
document.getElementById('followup-chips').addEventListener('click',function(e){
  var chip=e.target.closest('.fchip');if(!chip)return;
  document.getElementById('followup-input').value=chip.textContent;
  document.getElementById('followup-btn').click();
});
document.getElementById('followup-btn').addEventListener('click',function(){
  var q=document.getElementById('followup-input').value.trim();if(!q)return;
  if(!reportContext){document.getElementById('followup-answer').textContent='请先生成风水报告，再进行追问';document.getElementById('followup-answer').classList.add('show');return;}
  if(!checkProAccess())return;
  document.getElementById('followup-btn').disabled=true;
  document.getElementById('followup-btn').textContent='推算中...';
  document.getElementById('followup-answer').classList.remove('show');
  callAPI(P.followup(reportContext,q), 1200,
    function(j){
      document.getElementById('followup-btn').disabled=false;
      document.getElementById('followup-btn').textContent='咨询顾问';
      var el=document.getElementById('followup-answer');
      el.innerHTML='';
      if(typeof j==='string'){el.innerHTML='<div style="padding:12px;background:var(--ink2);border-radius:8px;font-size:13px;color:var(--tp);line-height:1.9">'+j+'</div>';el.classList.add('show');return;}
      var icons={action:'✅',warning:'⚠️',tip:'💡'};
      // 核心结论
      if(j.conclusion) el.insertAdjacentHTML('beforeend','<div class="fa-conclusion"><span class="fa-conclusion-lbl">✦ 核心结论</span>'+j.conclusion+'</div>');
      // 要点列表
      if(j.key_points&&j.key_points.length){
        var pts='<div class="fa-points">';
        j.key_points.forEach(function(p){
          var t=p.type||'tip';
          pts+='<div class="fa-point '+t+'"><div class="fa-point-icon">'+(icons[t]||'💡')+'</div><div class="fa-point-body"><div class="fa-point-label">'+p.label+'</div><div class="fa-point-content">'+p.content+'</div></div></div>';
        });
        pts+='</div>';
        el.insertAdjacentHTML('beforeend',pts);
      }
      // 立即行动
      if(j.quick_action) el.insertAdjacentHTML('beforeend','<div class="fa-action"><span class="fa-action-lbl">⚡ 立即可做</span>'+j.quick_action+'</div>');
      // 注意事项
      if(j.note) el.insertAdjacentHTML('beforeend','<div class="fa-note">注意：'+j.note+'</div>');
      el.classList.add('show');
      ANALYZER_FOLLOWUPS.push({q:q, j:j});
    },
    function(msg){
      refundProAccess();
      document.getElementById('followup-btn').disabled=false;
      document.getElementById('followup-btn').textContent='咨询顾问';
      var el=document.getElementById('followup-answer');
      el.innerHTML='<div style="padding:10px;color:#E09090;font-size:12px">追问失败：'+msg+'</div>';
      el.classList.add('show');
    },
    null,
    'followup'
  );
});

// ═══════════════════════════════════════════
// 周公解梦
// ═══════════════════════════════════════════
var DREAM_EMOTION='';
var DREAM_SUBJECTS=[];
var DREAM_TIME='';

// 情绪单选
document.getElementById('dream-emotion-row').addEventListener('click',function(e){
  var chip=e.target.closest('.dream-chip');if(!chip)return;
  var wasOn=chip.classList.contains('on');
  this.querySelectorAll('.dream-chip').forEach(function(c){c.classList.remove('on');});
  if(!wasOn){chip.classList.add('on');DREAM_EMOTION=chip.dataset.emotion;}
  else DREAM_EMOTION='';
});

// 主角多选（最多3个）
document.getElementById('dream-subject-row').addEventListener('click',function(e){
  var chip=e.target.closest('.dream-chip');if(!chip||chip.classList.contains('dim'))return;
  if(chip.classList.contains('on')){
    chip.classList.remove('on');
    DREAM_SUBJECTS=DREAM_SUBJECTS.filter(function(s){return s!==chip.dataset.subj;});
  } else {
    if(DREAM_SUBJECTS.length>=3)return;
    chip.classList.add('on');
    DREAM_SUBJECTS.push(chip.dataset.subj);
  }
  // 超过3个时置灰未选中项
  var selected=DREAM_SUBJECTS.length;
  this.querySelectorAll('.dream-chip').forEach(function(c){
    if(!c.classList.contains('on')) c.classList.toggle('dim', selected>=3);
  });
});

// 时间单选
document.getElementById('dream-time-row').addEventListener('click',function(e){
  var chip=e.target.closest('.dream-chip');if(!chip)return;
  var wasOn=chip.classList.contains('on');
  this.querySelectorAll('.dream-chip').forEach(function(c){c.classList.remove('on');});
  if(!wasOn){chip.classList.add('on');DREAM_TIME=chip.dataset.time;}
  else DREAM_TIME='';
});

// 解梦按钮
document.getElementById('dreambtn').addEventListener('click',function(){
  var txt=document.getElementById('dreamtxt').value.trim();
  if(!DREAM_EMOTION&&!DREAM_SUBJECTS.length&&!txt){
    err('dream-err','请至少选择一个感受或主角，或填写梦境细节');return;
  }
  if(!checkProAccess())return;
  noerr('dream-err');
  document.getElementById('dream-input-section').style.display='none';
  document.getElementById('dreamres').style.display='none';
  document.getElementById('dream-loading').classList.add('on');
  document.getElementById('dreambtn').disabled=true;

  function runDream(prompt){
    callAPI(prompt, 2500, function(j){
      document.getElementById('dream-loading').classList.remove('on');
      document.getElementById('dreambtn').disabled=false;
      document.getElementById('dreamres').style.display='block';

      // 整体解读
      document.getElementById('dreamout').textContent=j.summary||'';
      document.getElementById('dream-el').textContent=j.element||'--';
      var oe=document.getElementById('dream-omen');
      oe.textContent=j.omen==='good'?'吉象':j.omen==='bad'?'凶兆':'警示';
      oe.style.color=j.omen==='good'?'#4CAF76':j.omen==='bad'?'#B22222':'var(--gold)';

      // 意象解析
      var s=document.getElementById('syms');s.innerHTML='';
      (j.symbols||[]).forEach(function(sym){
        var c=sym.type==='吉'?'#4CAF76':sym.type==='凶'?'#B22222':'var(--ts)';
        s.insertAdjacentHTML('beforeend',
          '<div style="background:var(--ink3);border:0.5px solid var(--b);border-left:3px solid '+c+';border-radius:8px;padding:12px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start">'+
          '<div style="font-size:24px;flex-shrink:0">'+sym.icon+'</div>'+
          '<div><div style="font-size:13px;font-weight:600;color:var(--gold);margin-bottom:4px">'+sym.name+' <span style="font-size:11px;color:'+c+'">'+sym.type+'</span></div>'+
          '<div style="font-size:12px;color:var(--tp);line-height:1.7">'+sym.meaning+'</div>'+
          (sym.significance?'<div style="font-size:11px;color:var(--ts);margin-top:4px">启示：'+sym.significance+'</div>':'')+
          '</div></div>');
      });

      // 运势预测文字
      document.getElementById('dream-pred').textContent=j.prediction||'';

      // 四象限环形图
      var asp=j.aspects;
      if(asp){
        var aspEl=document.getElementById('dream-aspects');aspEl.innerHTML='';
        var aspMap=[
          {k:'career',n:'事业',icon:'💼',color:'#C9A84C'},
          {k:'wealth',n:'财运',icon:'💰',color:'#4CAF76'},
          {k:'relationship',n:'感情',icon:'❤️',color:'#E05090'},
          {k:'health',n:'健康',icon:'🌿',color:'#50C0A0'}
        ];
        aspMap.forEach(function(a){
          var d=asp[a.k];
          var txt2=typeof d==='string'?d:(d&&d.text)||'';
          var score=typeof d==='object'&&d.score?d.score:65;
          aspEl.insertAdjacentHTML('beforeend',
            '<div class="aspect-item">'+
            '<div class="aspect-ring-wrap" style="--pct:'+score+';--rc:'+a.color+'">'+
            '<div class="aspect-ring-inner">'+a.icon+'</div></div>'+
            '<div class="aspect-lbl">'+a.n+'</div>'+
            '<div class="aspect-txt">'+txt2+'</div>'+
            '</div>');
        });
      }

      // 化解方案
      if(j.remedy&&j.remedy.length>2){
        document.getElementById('dream-remedy-section').style.display='block';
        document.getElementById('dream-remedy').textContent=j.remedy;
      }

      // 顾问总评
      document.getElementById('dream-master').textContent=j.master_comment||'';

      // 行动建议
      if(j.advice&&j.advice.length>2){
        document.getElementById('dream-action-card').style.display='block';
        document.getElementById('dream-advice').textContent=j.advice;
      }

      var label=(DREAM_EMOTION||'梦境')+(DREAM_SUBJECTS.length?'·'+DREAM_SUBJECTS[0]:'');
      saveHistory('解梦', label.substring(0,20), '', j);
      document.getElementById('dreamres').scrollIntoView({behavior:'smooth',block:'nearest'});
    },
    function(msg){
      document.getElementById('dream-loading').classList.remove('on');
      document.getElementById('dream-input-section').style.display='block';
      document.getElementById('dreambtn').disabled=false;
      refundProAccess();
      err('dream-err',msg);
    }, null, 'dream');
  }

  renderPromptFromBackend('dream_analysis', {
    emotion:DREAM_EMOTION||'未选择',
    subjects:DREAM_SUBJECTS.length?DREAM_SUBJECTS.join('、'):'未选择',
    time:DREAM_TIME||'未选择',
    text:txt||'（用户未填写具体细节）'
  }, function(){return P.dream(DREAM_EMOTION,DREAM_SUBJECTS,DREAM_TIME,txt);}, runDream);
});

// 重新解梦
document.getElementById('dream-restart-btn').addEventListener('click',function(){
  document.getElementById('dreamres').style.display='none';
  document.getElementById('dream-input-section').style.display='block';
  // 重置状态
  DREAM_EMOTION=''; DREAM_SUBJECTS=[]; DREAM_TIME='';
  document.querySelectorAll('#page-dream .dream-chip').forEach(function(c){c.classList.remove('on','dim');});
  document.getElementById('dreamtxt').value='';
  noerr('dream-err');
  window.scrollTo(0,0);
});

// ═══════════════════════════════════════════
// 每日黄历（自动加载）
// ═══════════════════════════════════════════
function initAlmanac(){
  var now=new Date();
  document.getElementById('almd').textContent=now.getDate();
  document.getElementById('almdate').textContent=now.getFullYear()+'年'+(now.getMonth()+1)+'月'+now.getDate()+'日';
  document.getElementById('alm-gz').textContent='点击按钮推算今日黄历';
}

document.getElementById('alm-btn').addEventListener('click',function(){
  if(!checkProAccess())return;
  var now=new Date();
  var ds=now.getFullYear()+'年'+(now.getMonth()+1)+'月'+now.getDate()+'日';
  noerr('alm-err');
  document.getElementById('alm-loading').classList.add('on');
  document.getElementById('alm-btn').disabled=true;
  document.getElementById('alm-result').style.display='none';
  function runAlmanac(prompt){
    callAPI(prompt, 2000, function(j){
      document.getElementById('alm-loading').classList.remove('on');
      document.getElementById('alm-btn').disabled=false;
      document.getElementById('alm-gz').textContent=j.ganzhi||'--';
      document.getElementById('alm-result').style.display='block';

      // 神煞（含义说明）
      var gods=document.getElementById('alm-gods');gods.innerHTML='';
      (j.lucky_gods||[]).forEach(function(g){
        var name=typeof g==='string'?g:g.name;
        var meaning=typeof g==='object'?g.meaning:'';
        gods.insertAdjacentHTML('beforeend','<div class="god-good" title="'+meaning+'">'+name+(meaning?' · '+meaning:'')+'</div>');
      });
      (j.bad_gods||[]).forEach(function(g){
        var name=typeof g==='string'?g:g.name;
        var meaning=typeof g==='object'?g.meaning:'';
        gods.insertAdjacentHTML('beforeend','<div class="god-bad" title="'+meaning+'">'+name+(meaning?' · '+meaning:'')+'</div>');
      });

      var yi=document.getElementById('alm-yi');yi.innerHTML='';
      (j.yi||[]).forEach(function(t){yi.insertAdjacentHTML('beforeend','<span class="pill pt">'+t+'</span>');});
      var ji=document.getElementById('alm-ji');ji.innerHTML='';
      (j.ji||[]).forEach(function(t){ji.insertAdjacentHTML('beforeend','<span class="pill pr">'+t+'</span>');});

      var h=document.getElementById('alm-hours');h.innerHTML='';
      (j.lucky_hours||[]).forEach(function(x){
        var name=typeof x==='string'?x:x.name;
        var time=typeof x==='object'?x.time:'';
        var suitable=typeof x==='object'?x.suitable:'';
        h.insertAdjacentHTML('beforeend',
          '<div class="hour-item"><div class="hour-name">'+name+'</div><div class="hour-time">'+time+'</div>'+(suitable?'<div style="font-size:10px;color:var(--td);margin-top:3px">'+suitable+'</div>':'')+'</div>');
      });

      var dr=document.getElementById('alm-dirs');dr.innerHTML='';
      (j.lucky_dirs||[]).forEach(function(d){dr.insertAdjacentHTML('beforeend','<span class="pill pg">'+d+'</span>');});
      (j.lucky_colors||[]).forEach(function(c){dr.insertAdjacentHTML('beforeend','<span class="pill pw">'+c+'</span>');});
      if(j.elements) elBars('alm-els',j.elements);
      document.getElementById('alm-summary').textContent=j.day_summary||'';

      // 同步首页
      var pills='';
      (j.lucky_dirs||[]).slice(0,1).forEach(function(d){pills+='<span class="pill pg">'+d+'</span>';});
      (j.yi||[]).slice(0,2).forEach(function(t){pills+='<span class="pill pt">'+t.split('（')[0]+'</span>';});
      (j.ji||[]).slice(0,1).forEach(function(t){pills+='<span class="pill pr">忌'+t.split('（')[0]+'</span>';});
      document.getElementById('home-pills').innerHTML=pills;
      saveHistory('今日黄历', ds+' 今日宜忌', '', j);
    },
    function(msg){document.getElementById('alm-loading').classList.remove('on');document.getElementById('alm-btn').disabled=false;refundProAccess();err('alm-err',msg);},
    null,
    'almanac'
    );
  }
  renderPromptFromBackend('almanac_today', {date:ds}, function(){return P.almanac(ds);}, runAlmanac);
});

// ═══════════════════════════════════════════
// 八字命盘
// ═══════════════════════════════════════════
document.getElementById('genrow').addEventListener('click',function(e){
  var clicked=e.target.closest('#genrow > div');if(!clicked)return;
  document.querySelectorAll('#genrow > div').forEach(function(b){b.style.background='var(--ink3)';b.style.borderColor='var(--b)';b.style.color='var(--ts)';});
  clicked.style.background='rgba(201,168,76,.08)';clicked.style.borderColor='var(--gold)';clicked.style.color='var(--gold)';
});

document.getElementById('profilebtn').addEventListener('click',function(){
  var date=document.getElementById('bday').value;
  if(!date){err('prof-err','请先填写出生日期');return;}
  if(!checkProAccess())return;
  var time=document.getElementById('btime').value;
  var g=document.querySelector('#genrow div[style*="gold"]');
  var gender=g?g.textContent.trim():'男·乾';
  noerr('prof-err');
  document.getElementById('profileres').style.display='none';
  document.getElementById('prof-loading').classList.add('on');
  document.getElementById('profilebtn').disabled=true;
  // 第一步：精确算法计算四柱
  var parts = date.split('-');
  var hourVal = time ? parseInt(time) : null;
  fetch('/api/bazi',{method:'POST',headers:{'Content-Type':'application/json','X-CMA-Token':window.__CMA_T||''},
    body:JSON.stringify({year:parts[0],month:parts[1],day:parts[2],hour:hourVal,gender:gender})
  }).then(function(r){return r.json();}).then(function(br){
    if(!br.ok){refundProAccess();err('prof-err','命理报告生成失败：'+((br.error&&br.error.message)||br.error||''));document.getElementById('prof-loading').classList.remove('on');document.getElementById('profilebtn').disabled=false;return;}
    document.getElementById('prof-loading').classList.remove('on');
    document.getElementById('profilebtn').disabled=false;
    document.getElementById('profileres').style.display='block';

    var pg=document.getElementById('pillars-grid');pg.innerHTML='';
    var labels=['年柱','月柱','日柱','时柱'],keys=['year','month','day','hour'],pillars=br.pillars||{};
    keys.forEach(function(k,i){
      var p=pillars[k]||{};
      pg.insertAdjacentHTML('beforeend',
        '<div class="pillar-card'+(k==='day'?' today':'')+'"><div class="pillar-label">'+labels[i]+(k==='day'?' ★':'')+'</div><div class="pillar-gan">'+(p.gan||'？')+'</div><div class="pillar-zhi">'+(p.zhi||'？')+'</div><div class="pillar-el">'+(p.element||'')+'</div></div>');
    });

    document.getElementById('prof-dm').textContent=br.daymaster||'--';
    document.getElementById('prof-st').textContent=br.daymaster_strength==='strong'?'身强':'身弱';
    document.getElementById('prof-pt').textContent=br.pattern||'--';
    document.getElementById('prof-ys').textContent=br.yong_shen||'--';
    document.getElementById('prof-js').textContent=br.ji_shen||'--';
    document.getElementById('prof-dy').textContent=br.current_dayun||'--';
    if(br.elements){
      elBars('prof-els',{wood:br.elements['木'],fire:br.elements['火'],earth:br.elements['土'],metal:br.elements['金'],water:br.elements['水']});
    }

    document.getElementById('prof-character').textContent=br.character||'';
    document.getElementById('prof-energy-model').textContent=br.energy_model||'';
    document.getElementById('prof-pattern-diagnosis').textContent=br.pattern_diagnosis||'';
    document.getElementById('prof-risk-warning').textContent=br.risk_warning||'';

    var remedy=document.getElementById('prof-physical-remedy'); remedy.innerHTML='';
    arrify(br.physical_remedy).forEach(function(item){
      remedy.insertAdjacentHTML('beforeend','<span class="pill pt">'+item+'</span>');
    });

    var yi=document.getElementById('prof-yi'); yi.innerHTML='';
    arrify(br.decision_advice&&br.decision_advice.yi).forEach(function(item){
      yi.insertAdjacentHTML('beforeend','<span class="pill pg">'+item+'</span>');
    });
    var ji=document.getElementById('prof-ji'); ji.innerHTML='';
    arrify(br.decision_advice&&br.decision_advice.ji).forEach(function(item){
      ji.insertAdjacentHTML('beforeend','<span class="pill pr">'+item+'</span>');
    });

    var pf=document.getElementById('prof-findings');pf.innerHTML='';
    if(br.pattern_reason)pf.insertAdjacentHTML('beforeend','<div class="frow"><div class="dot dw"></div><div><div class="ft">格局判断依据</div><div class="fs">'+br.pattern_reason+'</div></div></div>');
    if(br.strength_reason)pf.insertAdjacentHTML('beforeend','<div class="frow"><div class="dot dw"></div><div><div class="ft">日主强弱依据</div><div class="fs">'+br.strength_reason+'</div></div></div>');
    if(br.shen_reason)pf.insertAdjacentHTML('beforeend','<div class="frow"><div class="dot dw"></div><div><div class="ft">喜用忌神分析</div><div class="fs">'+br.shen_reason+'</div></div></div>');
    (br.findings||[]).forEach(function(f){
      var c=f.type==='good'?'dg':'dw';
      pf.insertAdjacentHTML('beforeend','<div class="frow"><div class="dot '+c+'"></div><div><div class="ft">'+f.text+'</div>'+(f.suggestion?'<div class="fs">'+f.suggestion+'</div>':'')+'</div></div>');
    });

    var yr=document.getElementById('prof-yearly');yr.innerHTML='';
    (br.yearly_fortune||[]).forEach(function(y){
      var c=y.rating==='good'?'dg':y.rating==='warn'?'dw':'db';
      yr.insertAdjacentHTML('beforeend',
        '<div class="yearly-item"><div class="yearly-year">'+y.year+(y.ganzhi?'<div style="font-size:9px;color:var(--ts)">'+y.ganzhi+'</div>':'')+'</div>' +
        '<div class="yearly-dot '+c+'" style="margin-top:4px"></div>' +
        '<div class="yearly-body"><div class="yearly-text">'+y.forecast+'</div>' +
        (y.key_period?'<div class="yearly-advice">关键节点：'+y.key_period+'</div>':'') +
        '</div></div>');
    });

    document.getElementById('prof-fs-intro').textContent=br.fengshui_intro||'';
    var fa=br.fengshui_advice||{};
    var ld=document.getElementById('pld');ld.innerHTML='';(fa.lucky_dirs||[]).forEach(function(d){ld.insertAdjacentHTML('beforeend','<span class="pill pg">'+d+'</span>');});
    var lc=document.getElementById('plc');lc.innerHTML='';(fa.lucky_colors||[]).forEach(function(c){lc.insertAdjacentHTML('beforeend','<span class="pill pw">'+c+'</span>');});
    var li=document.getElementById('pli');li.innerHTML='';(fa.lucky_items||[]).forEach(function(i){li.insertAdjacentHTML('beforeend','<span class="pill pt">'+i+'</span>');});
    var ad=document.getElementById('pad');ad.innerHTML='';(fa.avoid_dirs||[]).forEach(function(d){ad.insertAdjacentHTML('beforeend','<span class="pill pr">'+d+'</span>');});

    document.getElementById('prof-comment').textContent=br.master_comment||'';
    LAST_BAZI_DATA = {data: br, date: date, gender: gender};
    try{
      localStorage.setItem('cma_birth_profile', JSON.stringify({
        date: date,
        hour: Number.isNaN(hourVal) ? null : hourVal,
        gender: gender
      }));
    }catch(e){}
    reportUsage(); saveHistory('命理报告', date+' '+gender+'命理报告', '', br);
    document.getElementById('profileres').scrollIntoView({behavior:'smooth',block:'nearest'});
  }).catch(function(e){refundProAccess();err('prof-err','八字计算连接失败，请确认代理已启动');document.getElementById('prof-loading').classList.remove('on');document.getElementById('profilebtn').disabled=false;});
});


// ═══════════════════════════════════════════
// 财运分析
// ═══════════════════════════════════════════
// 性别切换
document.getElementById('w-genrow').addEventListener('click',function(e){
  var clicked=e.target.closest('#w-genrow > div');if(!clicked)return;
  document.querySelectorAll('#w-genrow > div').forEach(function(b){b.style.background='var(--ink3)';b.style.borderColor='var(--b)';b.style.color='var(--ts)';});
  clicked.style.background='rgba(201,168,76,.08)';clicked.style.borderColor='var(--gold)';clicked.style.color='var(--gold)';
});

// 目标芯片
document.getElementById('w-goal-chips').addEventListener('click',function(e){
  var chip=e.target.closest('.w-gchip');if(!chip)return;
  document.querySelectorAll('.w-gchip').forEach(function(c){c.style.background='var(--ink3)';c.style.borderColor='var(--b)';c.style.color='var(--ts)';});
  chip.style.background='rgba(201,168,76,.1)';chip.style.borderColor='var(--bs)';chip.style.color='var(--gold)';
  document.getElementById('w-goal').value=chip.textContent;
});

var wReportContext='';

document.getElementById('w-btn').addEventListener('click',function(){
  var date=document.getElementById('w-bday').value;
  if(!date){err('w-err','请先填写出生日期');return;}
  if(!checkProAccess())return;
  var time=document.getElementById('w-btime').value;
  var g=document.querySelector('#w-genrow div[style*="gold"]');
  var gender=g?g.textContent.trim():'男·乾';
  var goal=document.getElementById('w-goal').value||'整体财运';
  noerr('w-err');
  document.getElementById('w-result').style.display='none';
  document.getElementById('w-loading').classList.add('on');
  document.getElementById('w-btn').disabled=true;

  var parts2=date.split('-');
  var hourVal2=time?parseInt(time):null;
  fetch('/api/wealth',{method:'POST',headers:{'Content-Type':'application/json','X-CMA-Token':window.__CMA_T||''},
    body:JSON.stringify({year:parts2[0],month:parts2[1],day:parts2[2],hour:hourVal2,gender:gender,goal:goal})
  }).then(function(r){return r.json();}).then(function(j){
    if(j.error){throw new Error(j.error.message||'财运分析失败');}
    document.getElementById('w-loading').classList.remove('on');
    document.getElementById('w-btn').disabled=false;
    document.getElementById('w-result').style.display='block';

    var sc=j.score||70;
    document.getElementById('w-title').textContent=(j.daymaster||'')+'命·'+( j.caige||'财运')+'分析报告';
    document.getElementById('w-score').textContent=sc;
    setTimeout(function(){document.getElementById('w-scorefill').style.width=sc+'%';},300);

    var cg=document.getElementById('w-caige');cg.innerHTML='';
    if(j.caige_detail){
      cg.insertAdjacentHTML('beforeend',
        '<div style="font-size:13px;color:var(--tp);line-height:1.85;margin-bottom:10px;padding:10px;background:var(--ink3);border-radius:7px;border-left:3px solid var(--gold)">'+
        '<div style="font-size:11px;color:var(--gold);font-weight:600;margin-bottom:5px">'+( j.caige||'财格')+'</div>'+
        j.caige_detail+'</div>');
    }
    (j.caige_findings||[]).forEach(function(f){
      var c=f.type==='good'?'dg':f.type==='warn'?'dw':'db';
      var el=document.createElement('div');el.className='frow';
      el.innerHTML='<div class="dot '+c+'" style="margin-top:4px"></div><div style="flex:1"><div class="ft">'+f.text+'</div>'+(f.suggestion?'<div class="fs">✦ '+f.suggestion+'</div>':'')+'</div>';
      cg.appendChild(el);
    });

    document.getElementById('w-zhengcai').textContent=j.zhengcai||'';
    document.getElementById('w-piancai').textContent=j.piancai||'';

    var dg=document.getElementById('w-dirs');dg.innerHTML='';
    (j.directions||[]).forEach(function(dir){
      dg.insertAdjacentHTML('beforeend',
        '<div style="background:var(--ink3);border:0.5px solid var(--b);border-radius:8px;padding:10px;text-align:center">'+
        '<div style="font-size:13px;font-weight:600;color:var(--gold);margin-bottom:2px">'+dir.dir+'</div>'+
        '<div style="font-size:10px;color:var(--ts);margin-bottom:3px">'+dir.element+' · '+dir.role+'</div>'+
        (dir.how?'<div style="font-size:10px;color:var(--td);line-height:1.4">'+dir.how+'</div>':'')+
        '</div>');
    });
    document.getElementById('w-layout').textContent=j.layout||'';

    var il=document.getElementById('w-items');il.innerHTML='';
    (j.items||[]).forEach(function(it){
      var name=typeof it==='string'?it:it.name;
      var pos=typeof it==='object'?it.position:'';
      var eff=typeof it==='object'?it.effect:'';
      il.insertAdjacentHTML('beforeend',
        '<div style="background:var(--ink3);border:0.5px solid var(--b);border-radius:7px;padding:8px 11px;margin:3px;min-width:120px">'+
        '<div style="font-size:12px;font-weight:600;color:var(--gold);margin-bottom:2px">'+name+'</div>'+
        (pos?'<div style="font-size:10px;color:var(--ts)">📍 '+pos+'</div>':'')+
        (eff?'<div style="font-size:10px;color:var(--td);margin-top:2px">'+eff+'</div>':'')+
        '</div>');
    });
    document.getElementById('w-items-detail').textContent=j.items_detail||'';

    document.getElementById('w-dayun').textContent=j.current_dayun||'--';
    var yr=document.getElementById('w-yearly');yr.innerHTML='';
    (j.yearly_fortune||[]).forEach(function(y){
      var c=y.rating==='good'?'#4CAF76':y.rating==='warn'?'var(--gold)':'#B22222';
      yr.insertAdjacentHTML('beforeend',
        '<div style="background:var(--ink3);border:0.5px solid var(--b);border-radius:8px;padding:12px;border-left:3px solid '+c+'">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'+
        '<span style="font-family:Cinzel,serif;font-size:13px;color:var(--gold);font-weight:600">'+y.year+'</span>'+
        (y.ganzhi?'<span style="font-size:10px;color:var(--ts)">'+y.ganzhi+'</span>':'')+
        '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:'+(y.rating==='good'?'rgba(76,175,118,.15)':y.rating==='warn'?'rgba(201,168,76,.12)':'rgba(139,26,26,.2)')+';color:'+c+'">'+
        (y.rating==='good'?'财运旺':y.rating==='warn'?'平稳':'注意')+'</span></div>'+
        '<div style="font-size:13px;color:var(--tp);line-height:1.8;margin-bottom:5px">'+y.wealth_trend+'</div>'+
        (y.best_months?'<div style="font-size:11px;color:var(--gold)">旺财月份：'+y.best_months+'</div>':'')+
        '</div>');
    });

    var tb=document.getElementById('w-taboo');tb.innerHTML='';
    (j.taboo||[]).forEach(function(t){
      tb.insertAdjacentHTML('beforeend',
        '<div style="display:flex;gap:10px;margin-bottom:9px;padding:10px;background:rgba(139,26,26,0.08);border:0.5px solid rgba(139,26,26,0.25);border-radius:7px">'+
        '<div style="font-size:13px;flex-shrink:0;margin-top:1px">⚠️</div>'+
        '<div><div style="font-size:13px;color:var(--tp);font-weight:500;margin-bottom:3px">'+t.item+'</div>'+
        (t.reason?'<div style="font-size:11px;color:var(--ts);margin-bottom:3px">原因：'+t.reason+'</div>':'')+
        (t.solution?'<div style="font-size:11px;color:#7AD4C0">化解：'+t.solution+'</div>':'')+
        '</div></div>');
    });

    document.getElementById('w-comment').textContent=j.master_comment||'';

    wReportContext='财格：'+(j.caige||'')+'，财运评分：'+sc+'。正财：'+(j.zhengcai||'').substring(0,40)+'...偏财：'+(j.piancai||'').substring(0,40)+'...大师总评：'+(j.master_comment||'').substring(0,80);
    LAST_WEALTH_DATA = {data: j, score: sc, date: date, gender: gender};
    WEALTH_FOLLOWUPS = [];
    reportUsage(); saveHistory('财运分析', date+' '+gender+'财运分析', sc, j);
    document.getElementById('w-result').scrollIntoView({behavior:'smooth',block:'start'});
  }).catch(function(e){refundProAccess();err('w-err',e.message||'财运分析连接失败，请确认代理已启动');document.getElementById('w-loading').classList.remove('on');document.getElementById('w-btn').disabled=false;});
});

// 财运追问
document.getElementById('w-followup-chips').addEventListener('click',function(e){
  var chip=e.target.closest('.fchip');if(!chip)return;
  document.getElementById('w-followup-input').value=chip.textContent;
  document.getElementById('w-followup-btn').click();
});
document.getElementById('w-followup-btn').addEventListener('click',function(){
  var q=document.getElementById('w-followup-input').value.trim();if(!q)return;
  if(!wReportContext){document.getElementById('w-followup-answer').innerHTML='<div style="padding:10px;font-size:12px;color:var(--ts)">请先生成财运报告</div>';document.getElementById('w-followup-answer').classList.add('show');return;}
  if(!checkProAccess())return;
  document.getElementById('w-followup-btn').disabled=true;
  document.getElementById('w-followup-btn').textContent='推算中...';
  document.getElementById('w-followup-answer').classList.remove('show');
  callAPI(P.followup(wReportContext,q), 1200,
    function(j){
      document.getElementById('w-followup-btn').disabled=false;
      document.getElementById('w-followup-btn').textContent='咨询顾问';
      var el=document.getElementById('w-followup-answer');
      el.innerHTML='';
      if(typeof j==='string'){el.innerHTML='<div style="padding:12px;background:var(--ink2);border-radius:8px;font-size:13px;color:var(--tp);line-height:1.9">'+j+'</div>';el.classList.add('show');return;}
      var icons={action:'✅',warning:'⚠️',tip:'💡'};
      if(j.conclusion)el.insertAdjacentHTML('beforeend','<div class="fa-conclusion"><span class="fa-conclusion-lbl">✦ 核心结论</span>'+j.conclusion+'</div>');
      if(j.key_points&&j.key_points.length){var pts='<div class="fa-points">';j.key_points.forEach(function(p){var t=p.type||'tip';pts+='<div class="fa-point '+t+'"><div class="fa-point-icon">'+(icons[t]||'💡')+'</div><div class="fa-point-body"><div class="fa-point-label">'+p.label+'</div><div class="fa-point-content">'+p.content+'</div></div></div>';});pts+='</div>';el.insertAdjacentHTML('beforeend',pts);}
      if(j.quick_action)el.insertAdjacentHTML('beforeend','<div class="fa-action"><span class="fa-action-lbl">⚡ 立即可做</span>'+j.quick_action+'</div>');
      if(j.note)el.insertAdjacentHTML('beforeend','<div class="fa-note">注意：'+j.note+'</div>');
      el.classList.add('show');
      WEALTH_FOLLOWUPS.push({q:q, j:j});
    },
    function(msg){
      refundProAccess();
      document.getElementById('w-followup-btn').disabled=false;
      document.getElementById('w-followup-btn').textContent='咨询顾问';
      var el=document.getElementById('w-followup-answer');
      el.innerHTML='<div style="padding:10px;color:#E09090;font-size:12px">追问失败：'+msg+'</div>';
      el.classList.add('show');
    },
    null,
    'followup'
  );
});

document.getElementById('w-restart-btn').addEventListener('click',function(){
  document.getElementById('w-result').style.display='none';
  document.getElementById('w-bday').value='';
  window.scrollTo(0,0);
});

// ═══════════════════════════════════════════
// 导出报告数据暂存
// ═══════════════════════════════════════════
var LAST_ANALYZER_DATA = null;
var LAST_BAZI_DATA = null;
var LAST_WEALTH_DATA = null;
var ANALYZER_FOLLOWUPS = []; // [{q:'问题', j:responseObj}]
var WEALTH_FOLLOWUPS   = []; // [{q:'问题', j:responseObj}]

// ─── 通用导出工具 ───
function exportBaseStyle(){
  return '<style>'+
    '*{box-sizing:border-box;margin:0;padding:0;}'+
    '@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap");'+
    'body{background:#0A0A0F;color:#D4C9A8;font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;padding:0;min-height:100vh;}'+
    '.page{width:760px;margin:0 auto;padding:40px 32px;}'+
    '@media print{body{background:#0A0A0F!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none!important;}}'+
    '.logo{font-family:Cinzel,serif;font-size:11px;letter-spacing:.25em;color:#7a6f5a;text-transform:uppercase;margin-bottom:4px;}'+
    '.report-title{font-family:Cinzel,serif;font-size:22px;color:#C9A84C;letter-spacing:.08em;margin-bottom:4px;}'+
    '.report-sub{font-size:11px;color:#5a5040;letter-spacing:.1em;margin-bottom:30px;}'+
    '.divider{border:none;border-top:0.5px solid #2a2418;margin:24px 0;}'+
    '.section-label{font-size:10px;letter-spacing:.2em;color:#7a6a40;font-weight:700;text-transform:uppercase;margin-bottom:14px;padding-left:10px;border-left:2px solid #C9A84C;}'+
    '.score-ring{width:100px;height:100px;border-radius:50%;background:conic-gradient(#C9A84C calc(var(--pct)*1%),#1a1810 0);display:flex;align-items:center;justify-content:center;box-shadow:0 0 24px rgba(201,168,76,.15);}'+
    '.score-inner{width:80px;height:80px;border-radius:50%;background:#0A0A0F;display:flex;align-items:center;justify-content:center;flex-direction:column;}'+
    '.score-num{font-family:Cinzel,serif;font-size:26px;font-weight:700;color:#C9A84C;line-height:1;}'+
    '.score-unit{font-size:9px;color:#7a6a40;margin-top:2px;letter-spacing:.08em;}'+
    '.finding-row{display:flex;gap:12px;padding:10px 0;border-bottom:0.5px solid #1e1c14;}'+
    '.finding-row:last-child{border-bottom:none;}'+
    '.dot-g{width:8px;height:8px;border-radius:50%;background:#4CAF76;flex-shrink:0;margin-top:5px;}'+
    '.dot-w{width:8px;height:8px;border-radius:50%;background:#C9A84C;flex-shrink:0;margin-top:5px;}'+
    '.dot-b{width:8px;height:8px;border-radius:50%;background:#8B1A1A;flex-shrink:0;margin-top:5px;}'+
    '.finding-text{font-size:13px;color:#C8BEA0;line-height:1.7;font-weight:500;}'+
    '.finding-detail{font-size:11px;color:#6a6050;margin-top:3px;line-height:1.6;font-style:italic;}'+
    '.finding-sugg{font-size:11px;color:#8fa88a;margin-top:4px;line-height:1.6;padding:5px 8px;background:rgba(76,175,118,.06);border-radius:4px;border-left:2px solid rgba(76,175,118,.3);}'+
    '.dir-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;}'+
    '.dir-card{background:#12100C;border:0.5px solid #2a2418;border-radius:8px;padding:10px;text-align:center;}'+
    '.dir-name{font-family:Cinzel,serif;font-size:15px;color:#C9A84C;font-weight:600;margin-bottom:3px;}'+
    '.dir-elem{font-size:10px;color:#7a6a40;margin-bottom:5px;}'+
    '.dir-benefit{font-size:11px;color:#a09070;line-height:1.5;}'+
    '.pill-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}'+
    '.pill-g{background:rgba(76,175,118,.1);border:0.5px solid rgba(76,175,118,.3);border-radius:20px;padding:4px 12px;font-size:11px;color:#7AD4A0;}'+
    '.pill-r{background:rgba(139,26,26,.12);border:0.5px solid rgba(139,26,26,.3);border-radius:20px;padding:4px 12px;font-size:11px;color:#E09090;}'+
    '.pill-t{background:rgba(201,168,76,.08);border:0.5px solid rgba(201,168,76,.2);border-radius:20px;padding:4px 12px;font-size:11px;color:#C9A84C;}'+
    '.el-row{display:flex;align-items:center;gap:10px;margin-bottom:7px;}'+
    '.el-label{width:20px;font-size:11px;color:#7a6a40;}'+
    '.el-bar-bg{flex:1;height:6px;background:#1a1810;border-radius:3px;}'+
    '.el-bar-fill{height:6px;border-radius:3px;}'+
    '.el-val{width:32px;font-size:10px;color:#7a6a40;text-align:right;}'+
    '.bazi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;}'+
    '.bazi-col{background:#12100C;border:0.5px solid #2a2418;border-radius:8px;padding:10px;text-align:center;}'+
    '.bazi-top{font-size:9px;color:#5a5040;margin-bottom:6px;letter-spacing:.08em;}'+
    '.bazi-tian{font-family:Cinzel,serif;font-size:22px;color:#C9A84C;font-weight:700;line-height:1;}'+
    '.bazi-di{font-family:Cinzel,serif;font-size:22px;color:#a09070;font-weight:600;line-height:1;margin-top:4px;}'+
    '.info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px;}'+
    '.info-cell{background:#12100C;border:0.5px solid #2a2418;border-radius:7px;padding:10px 14px;}'+
    '.info-key{font-size:10px;color:#5a5040;letter-spacing:.08em;margin-bottom:4px;}'+
    '.info-val{font-size:13px;color:#C8BEA0;font-weight:500;}'+
    '.yearly-row{display:flex;gap:14px;padding:10px 0;border-bottom:0.5px solid #1e1c14;align-items:flex-start;}'+
    '.yearly-row:last-child{border-bottom:none;}'+
    '.yearly-year{width:70px;flex-shrink:0;}'+
    '.yearly-yr{font-family:Cinzel,serif;font-size:14px;color:#C9A84C;font-weight:600;}'+
    '.yearly-gz{font-size:9px;color:#5a5040;margin-top:2px;}'+
    '.yearly-badge{display:inline-block;font-size:9px;padding:2px 7px;border-radius:10px;margin-top:4px;}'+
    '.badge-g{background:rgba(76,175,118,.15);color:#4CAF76;}'+
    '.badge-w{background:rgba(201,168,76,.12);color:#C9A84C;}'+
    '.badge-b{background:rgba(139,26,26,.2);color:#E09090;}'+
    '.yearly-text{font-size:12px;color:#a09070;line-height:1.7;flex:1;}'+
    '.yearly-note{font-size:10px;color:#7a6a40;margin-top:4px;}'+
    '.master-box{background:linear-gradient(135deg,#14120D 0%,#1a160f 100%);border:0.5px solid #3a3020;border-radius:10px;padding:18px 20px;position:relative;overflow:hidden;}'+
    '.master-box::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#C9A84C,transparent);}'+
    '.master-label{font-size:10px;letter-spacing:.2em;color:#7a6a40;font-weight:700;text-transform:uppercase;margin-bottom:10px;}'+
    '.master-text{font-size:13px;color:#C8BEA0;line-height:2;font-style:italic;}'+
    '.print-btn{position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#C9A84C,#a07830);color:#0A0A0F;border:none;border-radius:24px;padding:11px 22px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.05em;box-shadow:0 4px 20px rgba(201,168,76,.3);}'+
    '.stamp{position:absolute;top:32px;right:32px;width:70px;height:70px;border-radius:50%;border:2px solid rgba(201,168,76,.25);display:flex;align-items:center;justify-content:center;font-family:Cinzel,serif;font-size:8px;color:rgba(201,168,76,.3);text-align:center;line-height:1.4;letter-spacing:.05em;}'+
    '.header-row{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;padding-bottom:20px;border-bottom:0.5px solid #2a2418;position:relative;}'+
    '</style>';
}

// ─── 追问记录渲染 ───
function renderFollowupsHtml(followups){
  if(!followups||!followups.length)return '';
  var html='<hr class="divider"><div class="section-label">深度咨询记录</div>';
  followups.forEach(function(item,idx){
    var j=item.j;
    var qHtml='<div style="display:flex;gap:10px;margin-bottom:10px">'+
      '<div style="flex-shrink:0;width:20px;height:20px;border-radius:50%;background:rgba(201,168,76,.15);border:0.5px solid rgba(201,168,76,.3);display:flex;align-items:center;justify-content:center;font-size:9px;color:#C9A84C;font-weight:700;margin-top:1px">Q</div>'+
      '<div style="font-size:13px;color:#C9A84C;line-height:1.7;font-weight:500;padding-top:2px">'+item.q+'</div>'+
      '</div>';
    var aHtml='<div style="margin-left:30px;background:#12100C;border:0.5px solid #2a2418;border-radius:8px;padding:13px 15px;border-left:2px solid #3a3020">';
    if(typeof j==='string'){
      aHtml+='<div style="font-size:12px;color:#a09070;line-height:1.8">'+j+'</div>';
    } else {
      if(j.conclusion)aHtml+='<div style="font-size:13px;color:#C8BEA0;font-weight:600;line-height:1.7;margin-bottom:8px;padding:8px 12px;background:rgba(201,168,76,.06);border-radius:6px;border-left:2px solid #C9A84C">'+j.conclusion+'</div>';
      if(j.key_points&&j.key_points.length){
        var icons={action:'✅',warning:'⚠️',tip:'💡'};
        j.key_points.forEach(function(p){
          var t=p.type||'tip';
          var bgs={action:'rgba(76,175,118,.06)',warning:'rgba(201,168,76,.06)',tip:'rgba(80,120,200,.06)'};
          var cs={action:'#7AD4A0',warning:'#C9A84C',tip:'#88AADD'};
          aHtml+='<div style="display:flex;gap:10px;margin-bottom:8px;padding:8px 10px;background:'+(bgs[t]||bgs.tip)+';border-radius:6px">'+
            '<div style="font-size:14px;flex-shrink:0">'+( icons[t]||'💡')+'</div>'+
            '<div><div style="font-size:10px;color:'+(cs[t]||cs.tip)+';font-weight:600;margin-bottom:3px;letter-spacing:.06em">'+p.label+'</div>'+
            '<div style="font-size:12px;color:#a09070;line-height:1.6">'+p.content+'</div></div></div>';
        });
      }
      if(j.quick_action)aHtml+='<div style="font-size:12px;color:#7AD4A0;margin-top:8px;padding:7px 10px;background:rgba(76,175,118,.06);border-radius:5px;border-left:2px solid rgba(76,175,118,.3)">⚡ '+j.quick_action+'</div>';
      if(j.note)aHtml+='<div style="font-size:11px;color:#C9A84C;margin-top:7px;padding:6px 10px;background:rgba(201,168,76,.06);border-radius:5px;border-left:2px solid rgba(201,168,76,.3)">注意：'+j.note+'</div>';
    }
    aHtml+='</div>';
    html+='<div style="margin-bottom:16px">'+qHtml+aHtml+'</div>';
  });
  return html;
}

function exportDateStr(){
  var d=new Date();
  return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日';
}

function exportWindow(html){
  var w=window.open('','_blank','width=840,height=900');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>风水报告 · CMA</title>'+exportBaseStyle()+'</head><body>'+html+'<button class="print-btn no-print" onclick="window.print()">↓ 打印 / 保存 PDF</button></body></html>');
  w.document.close();
}

// ─── 风水分析报告导出 ───
function exportAnalyzerReport(d){
  var sc=d.score||70;
  var pct=sc;
  var findingsHtml='';
  (d.findings||[]).forEach(function(f){
    var dotCls=f.type==='good'?'dot-g':f.type==='warn'?'dot-w':'dot-b';
    findingsHtml+='<div class="finding-row"><div class="'+dotCls+'"></div><div style="flex:1">'+
      '<div class="finding-text">'+f.text+'</div>'+
      (f.detail?'<div class="finding-detail">'+f.detail+'</div>':'')+
      (f.suggestion?'<div class="finding-sugg">✦ '+f.suggestion+'</div>':'')+
      '</div></div>';
  });

  var dirsHtml='';
  (d.directions||[]).forEach(function(dir){
    dirsHtml+='<div class="dir-card">'+
      '<div class="dir-name">'+dir.dir+'</div>'+
      '<div class="dir-elem">'+dir.element+(dir.gua?'·'+dir.gua:'')+'</div>'+
      '<div class="dir-benefit">'+dir.benefit+'</div>'+
      (dir.how_to_use?'<div style="font-size:10px;color:#5a5040;margin-top:5px;line-height:1.4">'+dir.how_to_use+'</div>':'')+
      '</div>';
  });

  var itemsHtml='';
  (d.items||[]).forEach(function(it){itemsHtml+='<span class="pill-g">'+it+'</span>';});
  var removeHtml='';
  (d.remove||[]).forEach(function(it){removeHtml+='<span class="pill-r">'+it+'</span>';});

  var deepHtml='';
  var da=d.deep_analysis||{};
  var daItems=[
    {label:'气流格局',val:da.qi_flow},{label:'五行平衡',val:da.five_elements},
    {label:'形煞评估',val:da.sha_analysis},{label:'吉位激活',val:da.lucky_positions},
    {label:'优先改善',val:da.improvement_priority}
  ];
  daItems.forEach(function(item){
    if(!item.val)return;
    deepHtml+='<div style="margin-bottom:10px;padding:10px 14px;background:#12100C;border-radius:7px;border-left:2px solid #3a3020">'+
      '<div style="font-size:10px;color:#7a6a40;letter-spacing:.1em;margin-bottom:5px">'+item.label+'</div>'+
      '<div style="font-size:12px;color:#a09070;line-height:1.7">'+item.val+'</div></div>';
  });

  var body='<div class="page">'+
    '<div class="header-row">'+
    '<div>'+
    '<div class="logo">Cyber Metaphysics Architect</div>'+
    '<div class="report-title">'+(d.room_detected||'空间')+'风水分析报告</div>'+
    '<div class="report-sub">生成日期：'+exportDateStr()+' &nbsp;·&nbsp; 仅供参考，请理性看待</div>'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:0"><div class="score-ring" style="--pct:'+pct+'">'+
    '<div class="score-inner"><div class="score-num">'+sc+'</div><div class="score-unit">气场评分</div></div></div></div>'+
    '</div>'+

    (d.score_reason?'<div style="font-size:12px;color:#7a6a40;margin-bottom:24px;padding:10px 14px;background:#12100C;border-radius:6px;border-left:2px solid #C9A84C">'+d.score_reason+'</div>':'')+

    '<hr class="divider">'+
    '<div class="section-label">核心堪舆发现</div>'+
    findingsHtml+

    (deepHtml?'<hr class="divider"><div class="section-label">深度分析</div>'+deepHtml:'')+

    (dirsHtml?'<hr class="divider"><div class="section-label">八方位势分析</div><div class="dir-grid">'+dirsHtml+'</div>':'')+

    (itemsHtml?'<hr class="divider"><div class="section-label">推荐布置吉物</div><div class="pill-row">'+itemsHtml+'</div>':'')+
    (removeHtml?'<div class="pill-row" style="margin-top:10px">'+removeHtml+'</div>':'')+

    '<hr class="divider">'+
    '<div class="master-box">'+
    '<div class="master-label">大师总评</div>'+
    '<div class="master-text">'+(d.master_comment||'')+'</div>'+
    '</div>'+

    renderFollowupsHtml(ANALYZER_FOLLOWUPS)+

    '</div>';

  exportWindow(body);
}

// ─── 八字命理报告导出 ───
function exportBaziReport(ctx){
  var br=ctx.data, date=ctx.date, gender=ctx.gender;
  var bazi=br.bazi||{};
  var baziCols=[
    {label:'年柱',t:bazi.year_tian||'',d:bazi.year_di||''},
    {label:'月柱',t:bazi.month_tian||'',d:bazi.month_di||''},
    {label:'日柱',t:bazi.day_tian||'',d:bazi.day_di||''},
    {label:'时柱',t:bazi.hour_tian||'',d:bazi.hour_di||''}
  ];
  // If bazi is a string rather than object
  if(typeof br.bazi==='string'){ baziCols=[]; }

  var baziHtml='';
  if(baziCols.length){
    baziHtml='<div class="bazi-grid">';
    baziCols.forEach(function(col){
      baziHtml+='<div class="bazi-col">'+
        '<div class="bazi-top">'+col.label+'</div>'+
        '<div class="bazi-tian">'+col.t+'</div>'+
        '<div class="bazi-di">'+col.d+'</div>'+
        '</div>';
    });
    baziHtml+='</div>';
  } else if(typeof br.bazi==='string'){
    baziHtml='<div style="font-family:Cinzel,serif;font-size:18px;color:#C9A84C;letter-spacing:.2em;padding:10px 0">'+br.bazi+'</div>';
  }

  var els=br.elements||{};
  var elColors={'木':'#4CAF76','火':'#E05050','土':'#C9A84C','金':'#A8C4E0','水':'#5090E0'};
  var elHtml='';
  ['木','火','土','金','水'].forEach(function(k){
    var v=els[k]||0;
    elHtml+='<div class="el-row"><div class="el-label">'+k+'</div>'+
      '<div class="el-bar-bg"><div class="el-bar-fill" style="width:'+v+'%;background:'+elColors[k]+';"></div></div>'+
      '<div class="el-val">'+v+'%</div></div>';
  });

  var findingsHtml='';
  var pfItems=[
    {key:'pattern_reason',label:'格局判断依据'},{key:'strength_reason',label:'日主强弱依据'},{key:'shen_reason',label:'喜用忌神分析'}
  ];
  pfItems.forEach(function(item){
    if(!br[item.key])return;
    findingsHtml+='<div class="finding-row"><div class="dot-w"></div><div style="flex:1">'+
      '<div style="font-size:10px;color:#7a6a40;margin-bottom:3px;letter-spacing:.08em">'+item.label+'</div>'+
      '<div class="finding-text" style="font-size:12px">'+br[item.key]+'</div></div></div>';
  });
  (br.findings||[]).forEach(function(f){
    var dotCls=f.type==='good'?'dot-g':'dot-b';
    findingsHtml+='<div class="finding-row"><div class="'+dotCls+'"></div><div style="flex:1">'+
      '<div class="finding-text">'+f.text+'</div>'+
      (f.suggestion?'<div class="finding-sugg">✦ '+f.suggestion+'</div>':'')+
      '</div></div>';
  });

  var yearlyHtml='';
  (br.yearly_fortune||[]).forEach(function(y){
    var badgeCls=y.rating==='good'?'badge-g':y.rating==='warn'?'badge-w':'badge-b';
    var label=y.rating==='good'?'顺遂':y.rating==='warn'?'平稳':'谨慎';
    yearlyHtml+='<div class="yearly-row">'+
      '<div class="yearly-year">'+
      '<div class="yearly-yr">'+y.year+'</div>'+
      (y.ganzhi?'<div class="yearly-gz">'+y.ganzhi+'</div>':'')+
      '<span class="yearly-badge '+badgeCls+'">'+label+'</span>'+
      '</div>'+
      '<div class="yearly-text">'+y.forecast+
      (y.key_period?'<div class="yearly-note">关键节点：'+y.key_period+'</div>':'')+
      '</div></div>';
  });

  var fa=br.fengshui_advice||{};
  var fsHtml='';
  if(br.fengshui_intro)fsHtml+='<div style="font-size:12px;color:#a09070;line-height:1.8;margin-bottom:14px">'+br.fengshui_intro+'</div>';
  if((fa.lucky_dirs||[]).length)fsHtml+='<div style="margin-bottom:8px"><div style="font-size:10px;color:#5a5040;margin-bottom:5px;letter-spacing:.08em">吉利方位</div><div class="pill-row">'+(fa.lucky_dirs||[]).map(function(x){return '<span class="pill-g">'+x+'</span>';}).join('')+'</div></div>';
  if((fa.lucky_colors||[]).length)fsHtml+='<div style="margin-bottom:8px"><div style="font-size:10px;color:#5a5040;margin-bottom:5px;letter-spacing:.08em">吉利颜色</div><div class="pill-row">'+(fa.lucky_colors||[]).map(function(x){return '<span class="pill-t">'+x+'</span>';}).join('')+'</div></div>';
  if((fa.lucky_items||[]).length)fsHtml+='<div style="margin-bottom:8px"><div style="font-size:10px;color:#5a5040;margin-bottom:5px;letter-spacing:.08em">吉利物品</div><div class="pill-row">'+(fa.lucky_items||[]).map(function(x){return '<span class="pill-g">'+x+'</span>';}).join('')+'</div></div>';
  if((fa.avoid_dirs||[]).length)fsHtml+='<div><div style="font-size:10px;color:#5a5040;margin-bottom:5px;letter-spacing:.08em">忌讳方位</div><div class="pill-row">'+(fa.avoid_dirs||[]).map(function(x){return '<span class="pill-r">'+x+'</span>';}).join('')+'</div></div>';

  var physHtml=(br.physical_remedy||[]).map(function(x){return '<span class="pill-t">'+x+'</span>';}).join('');
  var yiHtml=((br.decision_advice&&br.decision_advice.yi)||[]).map(function(x){return '<span class="pill-g">'+x+'</span>';}).join('');
  var jiHtml=((br.decision_advice&&br.decision_advice.ji)||[]).map(function(x){return '<span class="pill-r">'+x+'</span>';}).join('');

  var body='<div class="page">'+
    '<div class="header-row">'+
    '<div>'+
    '<div class="logo">Cyber Metaphysics Architect</div>'+
    '<div class="report-title">八字命理分析报告</div>'+
    '<div class="report-sub">'+date+' &nbsp;'+gender+' &nbsp;·&nbsp; 生成日期：'+exportDateStr()+'</div>'+
    '</div>'+
    '</div>'+

    '<div class="section-label">四柱八字</div>'+
    baziHtml+

    '<div class="info-grid" style="margin-top:16px">'+
    '<div class="info-cell"><div class="info-key">命局格局</div><div class="info-val">'+(br.pattern||'--')+'</div></div>'+
    '<div class="info-cell"><div class="info-key">用神</div><div class="info-val">'+(br.yong_shen||'--')+'</div></div>'+
    '<div class="info-cell"><div class="info-key">忌神</div><div class="info-val">'+(br.ji_shen||'--')+'</div></div>'+
    '<div class="info-cell"><div class="info-key">当前大运</div><div class="info-val">'+(br.current_dayun||'--')+'</div></div>'+
    '</div>'+

    (elHtml?'<hr class="divider"><div class="section-label">五行能量分布</div>'+elHtml:'')+

    (br.character||br.energy_model||br.pattern_diagnosis?
      '<hr class="divider"><div class="section-label">性格与命盘解析</div>'+
      (br.character?'<div style="margin-bottom:10px;padding:10px 14px;background:#12100C;border-radius:7px;border-left:2px solid #C9A84C"><div style="font-size:10px;color:#7a6a40;margin-bottom:4px;letter-spacing:.08em">性格特质</div><div style="font-size:12px;color:#a09070;line-height:1.7">'+br.character+'</div></div>':'')+
      (br.energy_model?'<div style="margin-bottom:10px;padding:10px 14px;background:#12100C;border-radius:7px;border-left:2px solid #3a3020"><div style="font-size:10px;color:#7a6a40;margin-bottom:4px;letter-spacing:.08em">能量模型</div><div style="font-size:12px;color:#a09070;line-height:1.7">'+br.energy_model+'</div></div>':'')+
      (br.pattern_diagnosis?'<div style="margin-bottom:10px;padding:10px 14px;background:#12100C;border-radius:7px;border-left:2px solid #3a3020"><div style="font-size:10px;color:#7a6a40;margin-bottom:4px;letter-spacing:.08em">格局诊断</div><div style="font-size:12px;color:#a09070;line-height:1.7">'+br.pattern_diagnosis+'</div></div>':'')+
      (br.risk_warning?'<div style="padding:10px 14px;background:rgba(139,26,26,.08);border-radius:7px;border-left:2px solid rgba(139,26,26,.4)"><div style="font-size:10px;color:#7a6a40;margin-bottom:4px;letter-spacing:.08em">风险预警</div><div style="font-size:12px;color:#c09090;line-height:1.7">'+br.risk_warning+'</div></div>':'')+
    '':'')+

    (findingsHtml?'<hr class="divider"><div class="section-label">命局详批</div>'+findingsHtml:'')+

    (physHtml?'<hr class="divider"><div class="section-label">开运调理建议</div><div class="pill-row">'+physHtml+'</div>':'')+
    ((yiHtml||jiHtml)?
      '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
      (yiHtml?'<div><div style="font-size:10px;color:#5a5040;margin-bottom:5px;letter-spacing:.08em">宜</div><div class="pill-row">'+yiHtml+'</div></div>':'')+
      (jiHtml?'<div><div style="font-size:10px;color:#5a5040;margin-bottom:5px;letter-spacing:.08em">忌</div><div class="pill-row">'+jiHtml+'</div></div>':'')+
      '</div>':'')+

    (yearlyHtml?'<hr class="divider"><div class="section-label">流年运势预测</div>'+yearlyHtml:'')+

    (fsHtml?'<hr class="divider"><div class="section-label">本命风水指南</div>'+fsHtml:'')+

    '<hr class="divider">'+
    '<div class="master-box">'+
    '<div class="master-label">大师总评</div>'+
    '<div class="master-text">'+(br.master_comment||'')+'</div>'+
    '</div>'+
    '</div>';

  exportWindow(body);
}

// ─── 财运分析报告导出 ───
function exportWealthReport(ctx){
  var j=ctx.data, sc=ctx.score||0, date=ctx.date, gender=ctx.gender;
  var pct=sc;

  var yearlyHtml='';
  (j.yearly_fortune||[]).forEach(function(y){
    var c=y.rating==='good'?'#4CAF76':y.rating==='warn'?'#C9A84C':'#E09090';
    var badgeCls=y.rating==='good'?'badge-g':y.rating==='warn'?'badge-w':'badge-b';
    var label=y.rating==='good'?'财运旺':y.rating==='warn'?'平稳':'注意';
    yearlyHtml+='<div class="yearly-row" style="border-left:3px solid '+c+';padding-left:10px;margin-left:0">'+
      '<div class="yearly-year">'+
      '<div class="yearly-yr">'+y.year+'</div>'+
      (y.ganzhi?'<div class="yearly-gz">'+y.ganzhi+'</div>':'')+
      '<span class="yearly-badge '+badgeCls+'">'+label+'</span>'+
      '</div>'+
      '<div class="yearly-text">'+(y.wealth_trend||y.forecast||'')+
      (y.best_months?'<div class="yearly-note">旺财月份：'+y.best_months+'</div>':'')+
      '</div></div>';
  });

  var dirsHtml='';
  (j.directions||[]).forEach(function(dir){
    dirsHtml+='<div class="dir-card">'+
      '<div class="dir-name">'+dir.dir+'</div>'+
      '<div class="dir-elem">'+(dir.element||'')+(dir.role?' · '+dir.role:'')+'</div>'+
      (dir.how?'<div class="dir-benefit">'+dir.how+'</div>':'')+
      '</div>';
  });

  var itemsHtml='';
  (j.items||[]).forEach(function(it){
    var name=typeof it==='string'?it:it.name;
    var pos=typeof it==='object'?it.position:'';
    var eff=typeof it==='object'?it.effect:'';
    itemsHtml+='<div style="background:#12100C;border:0.5px solid #2a2418;border-radius:7px;padding:8px 12px;flex:1;min-width:130px;max-width:200px">'+
      '<div style="font-size:12px;font-weight:600;color:#C9A84C;margin-bottom:3px">'+name+'</div>'+
      (pos?'<div style="font-size:10px;color:#5a5040;margin-bottom:2px">📍 '+pos+'</div>':'')+
      (eff?'<div style="font-size:10px;color:#7a6a40;line-height:1.4">'+eff+'</div>':'')+
      '</div>';
  });

  var tabooHtml='';
  (j.taboo||[]).forEach(function(t){
    tabooHtml+='<div style="display:flex;gap:10px;margin-bottom:8px;padding:10px;background:rgba(139,26,26,.06);border:0.5px solid rgba(139,26,26,.2);border-radius:7px">'+
      '<div style="font-size:13px;flex-shrink:0">⚠️</div>'+
      '<div><div style="font-size:13px;color:#C8BEA0;font-weight:500;margin-bottom:3px">'+t.item+'</div>'+
      (t.reason?'<div style="font-size:11px;color:#7a6a40;margin-bottom:3px">'+t.reason+'</div>':'')+
      (t.solution?'<div style="font-size:11px;color:#7AD4C0">化解：'+t.solution+'</div>':'')+
      '</div></div>';
  });

  var body='<div class="page">'+
    '<div class="header-row">'+
    '<div>'+
    '<div class="logo">Cyber Metaphysics Architect</div>'+
    '<div class="report-title">财运风水分析报告</div>'+
    '<div class="report-sub">'+date+' &nbsp;'+gender+' &nbsp;·&nbsp; 生成日期：'+exportDateStr()+'</div>'+
    '</div>'+
    '<div style="display:flex;align-items:center"><div class="score-ring" style="--pct:'+pct+'">'+
    '<div class="score-inner"><div class="score-num">'+sc+'</div><div class="score-unit">财运评分</div></div></div></div>'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px">'+
    '<div class="info-cell" style="background:#14120D;border:0.5px solid #3a3020"><div class="info-key">命局财格</div><div style="font-size:16px;color:#C9A84C;font-weight:600;margin-top:2px">'+(j.caige||'--')+'</div></div>'+
    '<div class="info-cell" style="background:#14120D;border:0.5px solid #3a3020"><div class="info-key">当前大运</div><div style="font-size:16px;color:#C9A84C;font-weight:600;margin-top:2px">'+(j.current_dayun||'--')+'</div></div>'+
    '</div>'+

    (j.score_reason?'<div style="font-size:12px;color:#7a6a40;margin-bottom:24px;padding:10px 14px;background:#12100C;border-radius:6px;border-left:2px solid #C9A84C">'+j.score_reason+'</div>':'')+

    (j.zhengcai||j.piancai?
      '<hr class="divider"><div class="section-label">正财与偏财分析</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
      (j.zhengcai?'<div style="padding:12px;background:#12100C;border-radius:7px;border-left:2px solid rgba(76,175,118,.5)"><div style="font-size:10px;color:#7a6a40;margin-bottom:6px;letter-spacing:.08em">正财运势</div><div style="font-size:12px;color:#a09070;line-height:1.7">'+j.zhengcai+'</div></div>':'')+
      (j.piancai?'<div style="padding:12px;background:#12100C;border-radius:7px;border-left:2px solid rgba(201,168,76,.5)"><div style="font-size:10px;color:#7a6a40;margin-bottom:6px;letter-spacing:.08em">偏财机遇</div><div style="font-size:12px;color:#a09070;line-height:1.7">'+j.piancai+'</div></div>':'')+
      '</div>':'')+

    (yearlyHtml?'<hr class="divider"><div class="section-label">流年财运预测</div>'+yearlyHtml:'')+

    (dirsHtml?'<hr class="divider"><div class="section-label">财位方位布局</div><div class="dir-grid">'+dirsHtml+'</div>':'')+
    (j.layout?'<div style="font-size:12px;color:#7a6a40;margin-top:10px;padding:10px 14px;background:#12100C;border-radius:6px">'+j.layout+'</div>':'')+

    (itemsHtml?'<hr class="divider"><div class="section-label">旺财风水吉物</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">'+itemsHtml+'</div>':'')+
    (j.items_detail?'<div style="font-size:12px;color:#7a6a40;margin-top:10px;line-height:1.7">'+j.items_detail+'</div>':'')+

    (tabooHtml?'<hr class="divider"><div class="section-label">财运禁忌与化解</div>'+tabooHtml:'')+

    '<hr class="divider">'+
    '<div class="master-box">'+
    '<div class="master-label">大师总评</div>'+
    '<div class="master-text">'+(j.master_comment||'')+'</div>'+
    '</div>'+

    renderFollowupsHtml(WEALTH_FOLLOWUPS)+

    '</div>';

  exportWindow(body);
}

// ─── 导出按钮绑定 ───
document.getElementById('az-export-btn').addEventListener('click',function(){
  if(!LAST_ANALYZER_DATA){alert('请先生成风水分析报告');return;}
  exportAnalyzerReport(LAST_ANALYZER_DATA);
});
document.getElementById('prof-export-btn').addEventListener('click',function(){
  if(!LAST_BAZI_DATA){alert('请先生成八字命理报告');return;}
  exportBaziReport(LAST_BAZI_DATA);
});
document.getElementById('w-export-btn').addEventListener('click',function(){
  if(!LAST_WEALTH_DATA){alert('请先生成财运分析报告');return;}
  exportWealthReport(LAST_WEALTH_DATA);
});

// ═══════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════
var now=new Date();
document.getElementById('dday').textContent=now.getDate();
document.getElementById('dmon').textContent=now.getFullYear()+'年'+(now.getMonth()+1)+'月';
updateAccountUI();
authMe();
initAlmanac();
renderHistory();

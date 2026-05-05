// ============================================================
//  Prism — 游戏化系统层 ST 扩展
//  v1.0.1 — Per-chat isolation
// ============================================================

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';

const EXT_NAME = 'prism-system';
const EXT_DISPLAY = 'Prism（监管者系统） v1.0.11';

// ── Global settings (shared across all chats) ───────────────
const DEFAULT_GLOBAL_SETTINGS = {
    enabled: true,
};

// ── Per-chat settings (isolated by chatId) ──────────────────
const DEFAULT_CHAT_SETTINGS = {
    activeSystems: ['truth'],   // 当前只有实话系统
    points: 100,
    currentTasks: [],           // 当前5个任务
    completedTasks: [],         // 最近5条完成记录
    judgmentLog: [],            // 最近5条判定记录
    taskRefreshUnlocked: false, // 完成1个任务后解锁刷新
};

// ── Current chat state ──────────────────────────────────────
let currentChatId = null;

// ── Task database ───────────────────────────────────────────
const TASK_DB = [
    // 互动类 5分
    { id: 1,  cat: '互动', pts: 5,  text: '和对方一起吃一顿饭' },
    { id: 2,  cat: '互动', pts: 5,  text: '让对方给你讲一个他的童年故事' },
    { id: 3,  cat: '互动', pts: 5,  text: '主动给对方带一份礼物' },
    { id: 4,  cat: '互动', pts: 5,  text: '和对方一起散步超过3轮对话' },
    { id: 5,  cat: '互动', pts: 5,  text: '问对方一个他不想回答的问题' },
    { id: 6,  cat: '互动', pts: 5,  text: '让对方教你一项他擅长的技能' },
    { id: 7,  cat: '互动', pts: 5,  text: '和对方玩一个小游戏（猜拳、打赌等）' },
    { id: 8,  cat: '互动', pts: 5,  text: '故意说一句假话看对方反应' },
    { id: 9,  cat: '互动', pts: 5,  text: '在对方面前假装接到别人的暧昧电话' },
    { id: 10, cat: '互动', pts: 5,  text: '请对方帮你挑一件衣服' },
    // 试探类 10分
    { id: 11, cat: '试探', pts: 10, text: '成功识破对方的一次谎言' },
    { id: 12, cat: '试探', pts: 10, text: '让对方主动提起一件旧事' },
    { id: 13, cat: '试探', pts: 10, text: '在对话中让对方不小心说漏嘴' },
    { id: 14, cat: '试探', pts: 10, text: '故意提起对方的敏感话题观察反应' },
    { id: 15, cat: '试探', pts: 10, text: '用系统验证对方的一句承诺' },
    { id: 16, cat: '试探', pts: 10, text: '让对方对你做出一个具体承诺' },
    { id: 17, cat: '试探', pts: 10, text: '在对方撒谎时不拆穿，引导他继续编' },
    { id: 18, cat: '试探', pts: 10, text: '成功让对方自相矛盾' },
    { id: 19, cat: '试探', pts: 10, text: '让对方解释一件他之前回避的事' },
    { id: 20, cat: '试探', pts: 10, text: '在对方试探你时反向试探他' },
    // 整蛊/社交类 5分
    { id: 21, cat: '整蛊', pts: 5,  text: '整蛊对方一次（不过分）' },
    { id: 22, cat: '整蛊', pts: 5,  text: '让对方吃醋' },
    { id: 23, cat: '整蛊', pts: 5,  text: '故意冷落对方一轮看他反应' },
    { id: 24, cat: '整蛊', pts: 5,  text: '在别人面前夸对方看他什么表情' },
    { id: 25, cat: '整蛊', pts: 5,  text: '假装忘记对方说过的重要的话' },
    { id: 26, cat: '整蛊', pts: 5,  text: '让对方替你做一件小事' },
    { id: 27, cat: '整蛊', pts: 5,  text: '模仿对方的说话方式跟他对话' },
    { id: 28, cat: '整蛊', pts: 5,  text: '故意曲解对方的意思看他怎么纠正' },
    { id: 29, cat: '整蛊', pts: 5,  text: '在对方得意时泼冷水' },
    { id: 30, cat: '整蛊', pts: 5,  text: '假装对别的NPC感兴趣' },
    // 剧情推进类 15分
    { id: 31, cat: '剧情', pts: 15, text: '发现对方隐瞒的一个关键事实' },
    { id: 32, cat: '剧情', pts: 15, text: '让对方第一次对你说真心话' },
    { id: 33, cat: '剧情', pts: 15, text: '触发对方的一次情绪失控' },
    { id: 34, cat: '剧情', pts: 15, text: '完成一次关键剧情对峙' },
    { id: 35, cat: '剧情', pts: 15, text: '让对方主动向你道歉' },
];

// ── Skill definitions ───────────────────────────────────────
const SKILLS = [
    { id: 'detect',    name: '主动测谎',   cost: 30, shortDesc: '锁定下一句，强制真假判定', desc: '指定对方下一句话，系统强制判定真假',
      trigger: '用户已激活 Prism 技能「主动测谎」。【上下文约束：分析必须严格基于 char 的人设、user 的人设、世界书设定，以及主楼最近5楼内容；禁止脱离已知设定凭空推断。】【视角约束：Prism 与 user 视角一致，只能分析 user 当前能直接感知的内容。】【输出时机约束：必须等到 char 正在与 user 直接互动（面对面/通话/发消息）的轮次才输出结果；若当前轮次 char 不在与 user 互动，不输出任何 [PRISM: ...] 内容。】当 char 正在与 user 互动时，对 char 的下一句话进行真假判定。被动播报照常输出，技能结果紧跟其后，格式：[PRISM: 真话/谎言/半真半假。（详细依据）]。本楼共两条 [PRISM:]：第一条是被动播报，第二条是技能结果。【格式排他约束：本轮技能结果必须且只能使用「主动测谎」格式（真话/谎言/半真半假），严禁输出「深度分析」「情绪透视」「谎言回溯」「弱点探测」等其他技能的格式。】' },
    { id: 'analyze',   name: '深度分析',   cost: 80, shortDesc: '拆开表层话术，读取真实动机', desc: '分析对方某句话背后的真实动机和隐藏信息',
      trigger: '用户已激活 Prism 技能「深度分析」。【上下文约束：分析必须严格基于 char 的人设、user 的人设、世界书设定，以及主楼最近5楼内容；禁止脱离已知设定凭空推断。】【视角约束：Prism 与 user 视角一致，只能分析 user 当前能直接感知的内容。】【输出时机约束：必须等到 char 正在与 user 直接互动（面对面/通话/发消息）的轮次才输出结果；若当前轮次 char 不在与 user 互动，不输出任何 [PRISM: ...] 内容。】当 char 正在与 user 互动时，深度分析 char 最近对 user 说的话背后的真实动机。被动播报照常输出，技能结果紧跟其后，严格使用格式：[PRISM: 表面：... 实际：... 目的：...]。禁止使用测谎格式。本楼共两条 [PRISM:]：第一条是被动播报，第二条是技能结果。【格式排他约束：本轮技能结果必须且只能使用「深度分析」格式（表面/实际/目的），严禁输出「主动测谎」的真话/谎言格式，严禁输出「情绪透视」「谎言回溯」「弱点探测」等其他技能的格式。】' },
    { id: 'emotion',   name: '情绪透视',   cost: 50, shortDesc: '看见表情背后真实情绪', desc: '查看对方当前真实情绪状态（不是表面表现的）',
      trigger: '用户已激活 Prism 技能「情绪透视」。【上下文约束：分析必须严格基于 char 的人设、user 的人设、世界书设定，以及主楼最近5楼内容；禁止脱离已知设定凭空推断。】【视角约束：Prism 与 user 视角一致，只能分析 user 当前能直接感知的内容。】【输出时机约束：必须等到 char 正在与 user 直接互动（面对面/通话/发消息）的轮次才输出结果；若当前轮次 char 不在与 user 互动，不输出任何 [PRISM: ...] 内容。】当 char 正在与 user 互动时，透视 char 的真实内心和生理信号。被动播报照常输出，技能结果紧跟其后，严格使用格式：[PRISM: 真实内心：...（char 的内在真实状态，必须如实反映，不是表面能看到的）生理信号：...（char 的生理细节，必须是 user 肉眼看不到的内在反应，如心跳加速、后槽牙咬紧、手心出汗、瞳孔收缩等）]。注意：不要描写外在表现（user 自己能看到），只写 user 看不到的内心和生理反应。示例：[PRISM: 真实内心：吃醋吃飞了 生理信号：后槽牙都快咬碎了]。禁止使用测谎格式。本楼共两条 [PRISM:]：第一条是被动播报，第二条是技能结果。【格式排他约束：本轮技能结果必须且只能使用「情绪透视」格式（真实内心/生理信号），严禁输出「深度分析」的「表面/实际/目的」格式，严禁输出「主动测谎」的真话/谎言格式，严禁输出其他技能的格式。】' },
    { id: 'retrospect',name: '谎言回溯',   cost: 10, shortDesc: '回看最近对话，串起可疑点', desc: '系统回顾最近对话，标记所有可疑陈述',
      trigger: '用户已激活 Prism 技能「谎言回溯」。【上下文约束：分析必须严格基于 char 的人设、user 的人设、世界书设定，以及主楼最近5楼内容；禁止脱离已知设定凭空推断。】【视角约束：Prism 与 user 视角一致。本技能回顾的是 char 曾经对 user 说过的话（面对面/通话/发消息），不包括 char 的内心独白、char 独处时的行为、char 与第三方的互动。】【输出时机约束：必须等到 char 正在与 user 直接互动的轮次才输出结果；若当前轮次 char 不在与 user 互动，不输出任何 [PRISM: ...] 内容，等待下一次互动时再输出。】当 char 正在与 user 互动时，回顾 char 此前对 user 说过的可疑陈述。被动播报照常输出，技能结果紧跟其后，严格使用格式：[PRISM: 可疑点1：... 可疑点2：... 关联：...]。禁止使用测谎格式。本楼共两条 [PRISM:]：第一条是被动播报，第二条是技能结果。【格式排他约束：本轮技能结果必须且只能使用「谎言回溯」格式（可疑点/关联），严禁输出「主动测谎」的真话/谎言格式，严禁输出其他技能的格式。】' },
    { id: 'weakness',  name: '弱点探测',   cost: 30, shortDesc: '找出最不愿被碰的方向', desc: '系统提示对方当前最在意/最想隐藏的话题方向',
      trigger: '用户已激活 Prism 技能「弱点探测」。【上下文约束：分析必须严格基于 char 的人设、user 的人设、世界书设定，以及主楼最近5楼内容；禁止脱离已知设定凭空推断。】【视角约束：Prism 与 user 视角一致，只能分析 user 当前能直接感知的内容。】【输出时机约束：必须等到 char 正在与 user 直接互动（面对面/通话/发消息）的轮次才输出结果；若当前轮次 char 不在与 user 互动，不输出任何 [PRISM: ...] 内容。】当 char 正在与 user 互动时，探测 char（不是 user）当前最在意、最想隐藏的弱点。注意：分析对象是 char，绝对不是 user。被动播报照常输出，技能结果紧跟其后，严格使用格式：[PRISM: 核心弱点：...]。禁止使用测谎格式。本楼共两条 [PRISM:]：第一条是被动播报，第二条是技能结果。【格式排他约束：本轮技能结果必须且只能使用「弱点探测」格式（核心弱点），严禁输出「主动测谎」的真话/谎言格式，严禁输出其他技能的格式。】【重要：弱点探测的对象永远是 char，不是 user。禁止分析 user 的弱点。】' },
];

// ── Completion quips ────────────────────────────────────────
const COMPLETION_QUIPS = [
    'Prism已记录。干得不错。',
    '任务完成。你比预期的聪明一点。',
    '数据已归档。继续保持。',
    '记录在案。Prism对你的表现表示认可。',
    '完成确认。你的操作效率令人满意。',
    '归档完毕。下次试试更快？',
    'Prism已更新评估。暂时不会降低你的等级。',
    '确认。保持这种水平，也许你能获得更多授权。',
];
const COMPLETION_FOOTER = '请勿作弊。Prism 监管者 is watching you.';

// ── Task list prompt (dynamic only — base rules live in World Info) ──
// ── Base passive broadcast rules (fallback when World Info doesn't fire) ──
const PASSIVE_BROADCAST_RULES = `[Prism 被动播报规则——强制执行，不可省略]
【此规则优先级最高，不受其他指令覆盖】
当 char 正在与 user 直接互动（面对面/通话/发消息）时，每轮输出末尾必须附加一条被动播报：
[PRISM: （15字以内毒舌吐槽，基于 char 本轮言行的真假/情绪判断）]
- 若 char 不在与 user 互动，不输出任何 [PRISM: ...] 内容
- 每一轮 char 与 user 互动的回复都必须包含 [PRISM: ...]，没有例外
- 如果本轮输出缺少 [PRISM: ...]，视为输出不完整，必须补上`;

const TASK_PROMPT_TEMPLATE = `[Prism 当前任务列表]
以下是user当前的活跃任务。当你观察到user在对话中完成了其中某个任务，在本轮输出末尾追加标记：
[PRISM_TASK: <任务id> | status: complete | reason: <简述>]

{{ACTIVE_TASKS}}

{{PASSIVE_RULES}}

[Prism 上下文约束]
- 分析必须严格基于 char 的人设、user 的人设、世界书设定，以及主楼最近5楼内容
- 禁止脱离已知设定凭空推断

[Prism 视角约束]
Prism 与 user 视角完全一致。Prism 只能观察和分析 user 当前能直接感知的内容：
- ✅ 可分析：char 对 user 说的话、char 的表情动作（当 user 在场时）、char 发给 user 的消息/语音/视频
- ❌ 不可分析：char 独处时的内心想法、char 不在 user 面前时的行为、char 的内心 OS、char 单独场景的描写
- 当 char 不在 user 视线范围内（不同场景/不在通话中），Prism 不输出任何内容
- 只在 char 与 user 直接互动时（面对面对话、通话、发消息）才输出分析`;

// ============================================================
//  Helper: HTML escape (prevent XSS from AI output)
// ============================================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// Strip HTML tags and decode entities to get clean plain text
function stripHtml(str) {
    const div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent || div.innerText || '';
}

// ============================================================
//  Helper: settings access (per-chat isolation)
// ============================================================
function getGlobalSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = { global: structuredClone(DEFAULT_GLOBAL_SETTINGS), chats: {} };
    }
    // Migrate old flat structure to new two-tier structure
    const root = extension_settings[EXT_NAME];
    if (!root.global && !root.chats) {
        console.log('[Prism] Migrating old settings to per-chat structure');
        const oldChatData = {};
        for (const k of Object.keys(DEFAULT_CHAT_SETTINGS)) {
            if (k in root) oldChatData[k] = root[k];
        }
        root.global = { enabled: true };
        root.chats = Object.keys(oldChatData).length ? { 'migrated': oldChatData } : {};
        // Remove old flat keys
        for (const k of [...Object.keys(DEFAULT_CHAT_SETTINGS), 'enabled']) {
            delete root[k];
        }
        saveSettingsDebounced();
    }
    if (!root.global) root.global = structuredClone(DEFAULT_GLOBAL_SETTINGS);
    if (!root.chats) root.chats = {};
    const g = extension_settings[EXT_NAME].global;
    g.enabled = true;
    return g;
}

function getChatSettings(chatId) {
    if (!chatId) chatId = currentChatId;
    if (!chatId) return structuredClone(DEFAULT_CHAT_SETTINGS); // fallback for no active chat
    
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = { global: structuredClone(DEFAULT_GLOBAL_SETTINGS), chats: {} };
    }
    const root = extension_settings[EXT_NAME];
    if (!root.chats) root.chats = {};
    if (!root.chats[chatId]) {
        root.chats[chatId] = structuredClone(DEFAULT_CHAT_SETTINGS);
    }
    const s = root.chats[chatId];
    // backfill missing keys
    for (const [k, v] of Object.entries(DEFAULT_CHAT_SETTINGS)) {
        if (!(k in s)) s[k] = structuredClone(v);
    }
    return s;
}

function getSettings() {
    // Convenience: returns merged view (global + current chat)
    const g = getGlobalSettings();
    const c = getChatSettings();
    return { ...g, ...c };
}

function saveSettings() {
    saveSettingsDebounced();
}

// ============================================================
//  Task helpers
// ============================================================
function drawTasks(count = 5) {
    const s = getChatSettings();
    const completedIds = new Set(s.completedTasks.map(t => t.id));
    const available = TASK_DB.filter(t => !completedIds.has(t.id));
    // Fisher-Yates partial shuffle
    const pool = [...available];
    const n = Math.min(count, pool.length);
    for (let i = pool.length - 1; i > pool.length - 1 - n && i >= 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    s.currentTasks = pool.slice(-n).map(t => ({ ...t, done: false }));
    s.taskRefreshUnlocked = false;
    saveSettings();
    return s.currentTasks;
}

function completeTask(taskId, reason = '') {
    const s = getChatSettings();
    const task = s.currentTasks.find(t => t.id === taskId);
    if (!task || task.done) return null;
    task.done = true;
    s.points += task.pts;
    s.completedTasks.unshift({ id: task.id, text: task.text, pts: task.pts, reason, ts: Date.now() });
    if (s.completedTasks.length > 5) s.completedTasks = s.completedTasks.slice(0, 5);

    const allDone = s.currentTasks.length > 0 && s.currentTasks.every(t => t.done);
    if (allDone) {
        drawTasks();
    } else {
        s.taskRefreshUnlocked = true;
        saveSettings();
    }

    return { ...task, autoRefreshed: allDone };
}

function useSkill(skillId) {
    const s = getChatSettings();
    const skill = SKILLS.find(sk => sk.id === skillId);
    if (!skill) return { ok: false, reason: '未知技能' };
    if (s.points < skill.cost) return { ok: false, reason: `积分不足（需要${skill.cost}，当前${s.points}）` };
    s.points -= skill.cost;
    saveSettings();
    return { ok: true, skill };
}

function addJudgment(text) {
    const s = getChatSettings();
    s.judgmentLog.unshift({ text, ts: Date.now() });
    if (s.judgmentLog.length > 5) s.judgmentLog = s.judgmentLog.slice(0, 5);
    saveSettings();
}

// ============================================================
//  Prompt injection
// ============================================================
function buildPromptInjection() {
    const g = getGlobalSettings();
    const s = getChatSettings();
    if (!g.enabled || !s.activeSystems.includes('truth')) return '';

    const taskLines = s.currentTasks
        .filter(t => !t.done)
        .map(t => `  - ID:${t.id} 「${t.text}」(${t.cat} ${t.pts}分)`)
        .join('\n');

    return TASK_PROMPT_TEMPLATE
        .replace('{{ACTIVE_TASKS}}', taskLines || '  （无当前任务）')
        .replace('{{PASSIVE_RULES}}', PASSIVE_BROADCAST_RULES);
}

// ============================================================
//  Toast notification
// ============================================================
function showTaskToast(task, quip) {
    const toast = document.createElement('div');
    toast.className = 'prism-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
        <div class="prism-toast-header">TASK COMPLETE</div>
        <div class="prism-toast-body">
            <div class="prism-toast-task">${task.text} <span class="prism-toast-pts">+${task.pts}</span></div>
            <div class="prism-toast-quip">${quip}</div>
            <div class="prism-toast-footer">${COMPLETION_FOOTER}</div>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('prism-toast-exit');
        setTimeout(() => toast.remove(), 260);
    }, 4500);
    renderPanel();
}

// ============================================================
//  UI — Extension settings panel (layer 1)
// ============================================================
function buildSettingsHtml() {
    return `
    <div id="prism-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Prism（监管者系统）</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div id="prism-status" class="prism-status-line"></div>
            </div>
        </div>
    </div>`;
}

function bindSettingsEvents() {
    const s = getChatSettings();
    if (s.currentTasks.length === 0) drawTasks();
    updateStatusLine();
}

function updateStatusLine() {
    const el = document.getElementById('prism-status');
    if (!el) return;
    const c = getChatSettings();
    el.textContent = `▸ ACTIVE | ${c.points} PTS`;
}

// ============================================================
//  UI — Desktop floating icon + panel (layer 2)
// ============================================================
let panelOpen = false;
let _panelOpenedAt = 0; // timestamp when panel was opened (suppress immediate close)

// Touch device detection (same logic as mochi-phone)
const IS_TOUCH_DEVICE = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    || (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches);

function removeDesktopIcon() {
    document.getElementById('prism-desktop-icon')?.remove();
}

function positionPanelForMobile() {
    const panel = document.getElementById('prism-panel');
    if (!IS_TOUCH_DEVICE || !panel) return;

    const vv = window.visualViewport;
    const viewportWidth = vv ? vv.width : window.innerWidth;
    const viewportHeight = vv ? vv.height : window.innerHeight;
    const offsetLeft = vv ? vv.offsetLeft : 0;
    const offsetTop = vv ? vv.offsetTop : 0;

    panel.style.setProperty('position', 'fixed', 'important');
    panel.style.setProperty('width', `min(420px, calc(${Math.floor(viewportWidth)}px - 24px))`, 'important');
    panel.style.setProperty('maxWidth', `calc(${Math.floor(viewportWidth)}px - 24px)`, 'important');
    panel.style.setProperty('maxHeight', `calc(${Math.floor(viewportHeight)}px - 24px)`, 'important');
    panel.style.setProperty('left', '-9999px', 'important');
    panel.style.setProperty('top', '-9999px', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
    panel.style.setProperty('margin', '0', 'important');
    panel.style.setProperty('transform', 'none', 'important');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('visibility', 'visible', 'important');
    panel.style.setProperty('opacity', '1', 'important');
    panel.style.setProperty('zIndex', '2147483646', 'important');

    requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        const left = offsetLeft + Math.max(12, Math.round((viewportWidth - rect.width) / 2));
        const top = offsetTop + Math.max(12, Math.round((viewportHeight - rect.height) / 2));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
    });
}

function attachMobilePanelViewportHandlers() {
    if (!IS_TOUCH_DEVICE || window.__prismPanelViewportBound) return;
    const onViewportChange = () => {
        if (!panelOpen) return;
        positionPanelForMobile();
    };
    window.__prismPanelViewportBound = onViewportChange;
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
}

function ensurePanelContainer() {
    if (document.getElementById('prism-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'prism-panel';
    panel.className = 'prism-panel';
    panel.style.display = 'none';
    document.body.appendChild(panel);
}

function createDesktopIcon() {
    if (document.getElementById('prism-desktop-icon')) return;

    const icon = document.createElement('div');
    icon.id = 'prism-desktop-icon';
    icon.className = 'prism-desktop-icon';
    icon.innerHTML = 'P';
    icon.title = 'Prism';
    icon.addEventListener('click', togglePanel);
    document.body.appendChild(icon);

    // Init FAB drag after creation
    initIconDrag();
}

function updateDesktopIcon() {
    const g = getGlobalSettings();
    const icon = document.getElementById('prism-desktop-icon');
    const panel = document.getElementById('prism-panel');
    if (!icon || !panel) return;
    const show = g.enabled;
    icon.style.display = show ? 'flex' : 'none';
    icon.style.visibility = show ? 'visible' : 'hidden';
    icon.style.opacity = show ? '1' : '0';
    if (show && IS_TOUCH_DEVICE) {
        icon.style.setProperty('position', 'fixed', 'important');
        icon.style.setProperty('left', 'auto', 'important');
        icon.style.setProperty('bottom', 'auto', 'important');
        icon.style.setProperty('right', '12px', 'important');
        icon.style.setProperty('top', '88px', 'important');
        icon.style.setProperty('margin', '0', 'important');
        icon.style.setProperty('transform', 'none', 'important');
    }
    if (!show) {
        closePanel();
    }
}

function togglePanel() {
    panelOpen = !panelOpen;
    const panel = document.getElementById('prism-panel');
    if (!panel) return;
    if (panelOpen) {
        _panelOpenedAt = Date.now();
        panel.style.display = 'block';
        renderPanel();
        makeDraggable();
        if (IS_TOUCH_DEVICE) {
            positionPanelForMobile();
            attachMobilePanelViewportHandlers();
        } else {
            restorePanelPosition();
        }
    } else {
        closePanel();
    }
}

function closePanel() {
    panelOpen = false;
    const panel = document.getElementById('prism-panel');
    if (!panel) return;
    panel.style.display = 'none';
}

window.PrismTogglePanel = () => togglePanel();
window.PrismOpenPanel = () => {
    const g = getGlobalSettings();
    if (!g.enabled) return;
    if (!panelOpen) togglePanel();
};
window.PrismClosePanel = () => closePanel();

// ============================================================
//  FAB icon drag-to-move (mouse + touch, like mochi-phone)
// ============================================================
function initIconDrag() {
    const fab = document.getElementById('prism-desktop-icon');
    if (!fab || fab._prismDrag) return;
    fab._prismDrag = true;

    let dragging = false, moved = false;

    function startDrag(cx, cy) {
        dragging = true; moved = false;
        const r = fab.getBoundingClientRect();
        fab._dx = cx; fab._dy = cy;
        fab._il = r.left; fab._it = r.top;
        fab.style.setProperty('right',  'auto',        'important');
        fab.style.setProperty('bottom', 'auto',        'important');
        fab.style.setProperty('left',   r.left + 'px', 'important');
        fab.style.setProperty('top',    r.top  + 'px', 'important');
        fab.style.cursor = 'grabbing'; fab.style.transition = 'none';
    }

    function moveDrag(cx, cy) {
        if (!dragging) return;
        const dx = cx - fab._dx, dy = cy - fab._dy;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        const nL = Math.max(0, Math.min(window.innerWidth  - fab.offsetWidth,  fab._il + dx));
        const nT = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, fab._it + dy));
        fab.style.setProperty('left', nL + 'px', 'important');
        fab.style.setProperty('top',  nT + 'px', 'important');
    }

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        fab.style.cursor = 'grab'; fab.style.transition = '';
        if (moved) {
            const posKey = IS_TOUCH_DEVICE ? 'prism_fab_pos_mobile' : 'prism_fab_pos';
            localStorage.setItem(posKey, JSON.stringify({ left: fab.style.left, top: fab.style.top }));
        }
        moved = false;
    }

    // Mouse
    fab.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);
        const mm = e2 => moveDrag(e2.clientX, e2.clientY);
        const mu = () => { endDrag(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup', mu);
    });

    // Touch
    fab.addEventListener('touchstart', e => {
        const t = e.touches[0]; startDrag(t.clientX, t.clientY);
        const tm = e2 => { e2.preventDefault(); const t2 = e2.touches[0]; moveDrag(t2.clientX, t2.clientY); };
        const te = () => { endDrag(); fab.removeEventListener('touchmove', tm); fab.removeEventListener('touchend', te); };
        fab.addEventListener('touchmove', tm, { passive: false });
        fab.addEventListener('touchend', te);
    }, { passive: true });

    // Block click after drag (prevent togglePanel firing after a drag)
    fab.addEventListener('click', e => { if (moved) { moved = false; e.stopImmediatePropagation(); } }, true);

    // Restore saved position
    restoreIconPosition(fab);
}

function restoreIconPosition(fab) {
    if (!fab) fab = document.getElementById('prism-desktop-icon');
    if (!fab) return;

    // Mobile/touch devices: hard-anchor inside viewport near top-right.
    // Avoid restoring saved left/top or using bottom anchoring, which can
    // land outside the visible mobile viewport depending on browser UI.
    if (IS_TOUCH_DEVICE) {
        fab.style.setProperty('position', 'fixed', 'important');
        fab.style.setProperty('left', 'auto', 'important');
        fab.style.setProperty('bottom', 'auto', 'important');
        fab.style.setProperty('right', '12px', 'important');
        fab.style.setProperty('top', '88px', 'important');
        fab.style.setProperty('margin', '0', 'important');
        fab.style.setProperty('transform', 'none', 'important');
        return;
    }

    try {
        const posKey = IS_TOUCH_DEVICE ? 'prism_fab_pos_mobile' : 'prism_fab_pos';
        const s = JSON.parse(localStorage.getItem(posKey) || 'null');
        if (s) {
            const fw = Math.max(fab.offsetWidth, 46);
            const fh = Math.max(fab.offsetHeight, 46);
            const l = Math.max(0, Math.min(window.innerWidth  - fw, parseFloat(s.left)));
            const t = Math.max(0, Math.min(window.innerHeight - fh, parseFloat(s.top)));
            fab.style.setProperty('right',  'auto',      'important');
            fab.style.setProperty('bottom', 'auto',      'important');
            fab.style.setProperty('left',   l + 'px',    'important');
            fab.style.setProperty('top',    t + 'px',    'important');
        }
    } catch(e) {}
}

// ============================================================
//  Panel drag support (PC only, from header)
// ============================================================
function makeDraggable() {
    const panel = document.getElementById('prism-panel');
    if (!panel) return;
    if (panel._prismDragBound) return;
    panel._prismDragBound = true;

    let dragging = false, moved = false, ox = 0, oy = 0, ex = 0, ey = 0;
    const posKey = IS_TOUCH_DEVICE ? 'prism_panel_pos_mobile' : 'prism_panel_pos';

    function isInteractiveTarget(target) {
        return !!target.closest('button, select, option, input, textarea, a, [contenteditable="true"]');
    }

    function isScrollableArea(target) {
        return !!target.closest('.prism-side-scroll');
    }

    function startDrag(cx, cy, target) {
        if (IS_TOUCH_DEVICE) return false;
        if (!target.closest('#prism-panel-drag-zone')) return false;
        if (isInteractiveTarget(target)) return false;
        if (isScrollableArea(target)) return false;

        dragging = true;
        moved = false;
        const r = panel.getBoundingClientRect();
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = r.left + 'px';
        panel.style.top = r.top + 'px';
        ox = r.left; oy = r.top;
        ex = cx; ey = cy;
        return true;
    }

    function moveDrag(cx, cy) {
        if (!dragging) return;
        const dx = cx - ex;
        const dy = cy - ey;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
        const newLeft = ox + dx;
        const newTop = oy + dy;
        const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
        panel.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        panel.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
    }

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        if (moved) {
            localStorage.setItem(posKey, JSON.stringify({ left: panel.style.left, top: panel.style.top }));
        }
        moved = false;
    }

    panel.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (!startDrag(e.clientX, e.clientY, e.target)) return;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);

    panel.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (!t) return;
        if (!startDrag(t.clientX, t.clientY, e.target)) return;
    }, { passive: true });

    panel.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        const t = e.touches[0];
        if (!t) return;
        e.preventDefault();
        moveDrag(t.clientX, t.clientY);
    }, { passive: false });

    panel.addEventListener('touchend', endDrag);
}

function restorePanelPosition() {
    const panel = document.getElementById('prism-panel');
    if (!panel) return;
    if (IS_TOUCH_DEVICE) return;
    const posKey = IS_TOUCH_DEVICE ? 'prism_panel_pos_mobile' : 'prism_panel_pos';
    try {
        const raw = localStorage.getItem(posKey);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (!s || !s.left || !s.top) return;
        const w = panel.offsetWidth || 0;
        const h = panel.offsetHeight || 0;
        const left = Math.max(0, Math.min(parseFloat(s.left), Math.max(0, window.innerWidth - w)));
        const top = Math.max(0, Math.min(parseFloat(s.top), Math.max(0, window.innerHeight - h)));
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
    } catch(e) {}
}

// ============================================================
//  Click outside → close panel
// ============================================================
function bindClickOutside() {
    document.addEventListener('click', (e) => {
        if (!panelOpen) return;
        // Debounce: ignore clicks within 300ms of opening (same-frame synthetic click)
        if (Date.now() - _panelOpenedAt < 300) return;
        // Ignore clicks inside panel or on the icon
        if (e.target.closest('#prism-panel, #prism-desktop-icon')) return;
        // Ignore if target was removed from DOM during event propagation
        if (!document.contains(e.target)) return;
        // Close
        closePanel();
    });
}

function renderPanel() {
    const panel = document.getElementById('prism-panel');
    if (!panel) return;
    const s = getChatSettings();

    const taskHtml = s.currentTasks.length
        ? s.currentTasks.map(t => `
            <div class="prism-task ${t.done ? 'prism-task-done' : ''} ${!t.done ? 'prism-task-clickable' : ''}" ${!t.done ? `data-tid="${t.id}" role="button" tabindex="0"` : ''}>
                <div class="prism-task-main">
                    <b class="prism-task-text">${t.text}</b>
                    <div class="prism-task-meta">${t.cat}任务 <span>+${t.pts} pts</span></div>
                </div>
            </div>`).join('')
        : '<div class="prism-empty">暂无任务</div>';

    const refreshBtn = s.taskRefreshUnlocked
        ? '<button id="prism-refresh-tasks" class="prism-btn">刷新任务</button>'
        : '<button class="prism-btn prism-btn-disabled" disabled>完成任务后解锁刷新</button>';

    const skillsHtml = SKILLS.map(sk => {
        const isDisabled = s.points < sk.cost;
        const isPending = pendingSkillUI && pendingSkillUI.id === sk.id;
        const isLocked = pendingSkillUI && !isPending;
        const btnClass = isPending ? 'prism-skill-btn prism-skill-pending' : (isLocked ? 'prism-skill-btn prism-skill-locked' : (isDisabled ? 'prism-skill-btn prism-skill-insufficient' : 'prism-skill-btn'));
        const statusHtml = isPending
            ? `<span class="prism-skill-status">等待回复...</span>`
            : `<span class="prism-skill-status">${sk.shortDesc || sk.desc}</span>`;
        const cancelBtn = isPending ? `<button class="prism-skill-cancel" data-skill="${sk.id}" title="取消技能，退回积分">取消</button>` : '';
        return `
        <div class="prism-skill">
            <div class="prism-skill-row">
                <button class="${btnClass}" data-skill="${sk.id}" ${isPending || isLocked ? 'disabled' : ''}>
                    <span class="prism-skill-cost-ring">${sk.cost}</span>
                    <span class="prism-skill-copy">
                        <span class="prism-skill-name">${sk.name}</span>
                        ${statusHtml}
                    </span>
                </button>
                ${cancelBtn}
            </div>
        </div>`;
    }).join('');

    const logHtml = s.judgmentLog.length
        ? s.judgmentLog.map(j => `<div class="prism-log-entry prism-whisper-entry"><span class="prism-log-time">${new Date(j.ts).toLocaleTimeString()}</span><span class="prism-log-text">${escapeHtml(j.text)}</span></div>`).join('')
        : '<div class="prism-empty">暂无记录</div>';

    const completedHtml = s.completedTasks.length
        ? s.completedTasks.map(c => `<div class="prism-log-entry prism-done-entry"><span class="prism-log-time">${new Date(c.ts).toLocaleTimeString()}</span><span class="prism-log-text">${c.text}</span><span class="prism-task-pts">+${c.pts}</span></div>`).join('')
        : '<div class="prism-empty">暂无已完成任务</div>';

    panel.innerHTML = `
        <div class="prism-panel-shell prism-oracle-shell">
            <div class="prism-glow-layer"></div>
            <div class="prism-stage-decor">
                <div class="prism-leaf l1"><svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(192,168,236,.46)"/><path d="M8 2v13" stroke="rgba(243,235,255,.55)" stroke-width=".8"/></svg></div>
                <div class="prism-leaf l2"><svg width="14" height="16" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(171,139,237,.38)"/></svg></div>
                <div class="prism-leaf l3"><svg width="18" height="20" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(214,187,255,.42)"/></svg></div>
                <div class="prism-leaf l4"><svg width="13" height="15" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(181,148,246,.42)"/></svg></div>
                <div class="prism-leaf l5"><svg width="17" height="19" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(210,181,255,.36)"/></svg></div>
                <div class="prism-leaf l6"><svg width="15" height="17" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(163,128,235,.4)"/></svg></div>
                <div class="prism-leaf l7"><svg width="14" height="16" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(195,169,247,.36)"/></svg></div>
                <div class="prism-leaf l8"><svg width="17" height="19" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(181,148,246,.32)"/></svg></div>
                <div class="prism-leaf l9"><svg width="12" height="14" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(210,181,255,.28)"/></svg></div>
                <div class="prism-leaf l10"><svg width="14" height="16" viewBox="0 0 16 18" fill="none"><path d="M8 1c4 3 6 6 6 9 0 4-2.7 6.5-6 7-3.3-.5-6-3-6-7 0-3 2-6 6-9Z" fill="rgba(163,128,235,.28)"/></svg></div>
            </div>
            <div class="prism-particle-layer">
                <span class="prism-particle p1"></span><span class="prism-particle p2"></span><span class="prism-particle p3"></span><span class="prism-particle p4"></span><span class="prism-particle p5"></span><span class="prism-particle p6"></span><span class="prism-particle p7"></span><span class="prism-particle p8"></span><span class="prism-particle p9"></span><span class="prism-particle p10"></span><span class="prism-particle p11"></span><span class="prism-particle p12"></span>
            </div>
                <div id="prism-panel-drag-zone" class="prism-drag-handle" aria-hidden="true"></div>
            <button id="prism-panel-close" class="prism-floating-close" aria-label="关闭面板">✕</button>

            <div class="prism-oracle-grid">
                <aside class="prism-oracle-left prism-col-card">
                    <div class="prism-brand-block">
                        <div class="prism-brand-mark">P</div>
                        <div class="prism-brand-meta">
                            <b>PRISM</b>
                            <span>ORACLE KERNEL / LATENT READING · v1.0.7</span>
                        </div>
                    </div>
                    <div class="prism-points-block">
                        <div class="prism-points-cap">capacity</div>
                        <div class="prism-points-val">${s.points} PTS</div>
                        <div class="prism-points-sub">剩余积分</div>
                    </div>
                    <div class="prism-system-pill-wrap">
                        <div class="prism-system-pill-display" aria-hidden="true">
                            <span class="prism-system-dot"></span>
                            <span>实话系统</span>
                        </div>
                        <select class="prism-system-pill-hitbox" aria-label="选择系统">
                            <option value="truth" selected>实话系统</option>
                            <option disabled>未完待更新……</option>
                        </select>
                    </div>
                    <div class="prism-side-scroll prism-left-scroll">
                        <div class="prism-section-title">Whispers · Archive</div>
                        <div class="prism-log prism-whisper-list">${logHtml}</div>
                    </div>
                </aside>

                <main class="prism-oracle-center prism-col-card">
                    <div class="prism-focus-badge">Latent Reading · Tier II</div>
                    <h2 class="prism-focus-title" data-text="深层回声">深层回声</h2>
                    <p class="prism-focus-desc">你听见的未必是假，但真相往往藏在那句被轻轻带过的话里。<br>Prism 不替你审判，只替你照见裂隙。</p>
                    <div class="prism-center-section prism-section-skills">
                        <div class="prism-skills prism-skills-desktop">${skillsHtml}</div>
                        <div class="prism-skill-hint" aria-live="polite">✦ 上方 5 个按钮可点击使用技能，请按需触发 ✦</div>
                    </div>
                </main>

                <aside class="prism-oracle-right prism-col-card">
                    <div class="prism-side-scroll prism-side-scroll-right">
                        <div class="prism-section-title">Echo Tasks · ${s.currentTasks.length || 0} loaded</div>
                        <div style="margin:2px 0 12px;font-size:10px;letter-spacing:.08em;color:rgba(196,177,226,.52);line-height:1.4;">任务列表-完成任务获得积分</div>
                        <div class="prism-task-list prism-task-list-desktop">${taskHtml}</div>
                        <div class="prism-task-actions">
                            ${refreshBtn}
                            ${s.currentTasks.length === 0 ? '<button id="prism-draw-tasks" class="prism-btn">抽取任务</button>' : ''}
                        </div>

                        <div class="prism-section-title prism-subsection-gap">Completed</div>
                        <div class="prism-log prism-completed-list">${completedHtml}</div>
                    </div>
                </aside>
            </div>
        </div>
    `;

    document.getElementById('prism-panel-close')?.addEventListener('click', togglePanel);
    document.getElementById('prism-refresh-tasks')?.addEventListener('click', () => { drawTasks(); renderPanel(); });
    document.getElementById('prism-draw-tasks')?.addEventListener('click', () => { drawTasks(); renderPanel(); });

    panel.querySelectorAll('.prism-task-clickable').forEach(item => {
        const trigger = () => {
            const tid = parseInt(item.dataset.tid, 10);
            const completed = completeTask(tid, '手动完成');
            if (completed) {
                const quip = COMPLETION_QUIPS[Math.floor(Math.random() * COMPLETION_QUIPS.length)];
                showTaskToast(completed, completed.autoRefreshed ? `${quip} 五项任务已清空，列表已自动刷新。` : quip);
            }
            renderPanel();
        };
        item.addEventListener('click', trigger);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                trigger();
            }
        });
    });

    panel.querySelectorAll('.prism-skill-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            const skillId = btn.dataset.skill;
            cancelPendingSkill(skillId);
        });
    });

    panel.querySelectorAll('.prism-skill-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const skillId = btn.dataset.skill;
            const skill = SKILLS.find(sk => sk.id === skillId);
            if (!skill) return;
            const s = getChatSettings();
            if (s.points < skill.cost) {
                showPrismNotice(`积分不足（需要${skill.cost}，当前${s.points}）`);
                return;
            }
            if (pendingSkillUI) {
                showPrismNotice('宿主，请不要过于贪心，一次只能用一种能力哦！');
                return;
            }
            const ok = await showPrismConfirm(`花费 ${skill.cost} 积分使用「${skill.name}」？`);
            if (!ok) return;
            const result = useSkill(skillId);
            if (!result.ok) {
                showPrismNotice(result.reason);
                return;
            }
            const ctx = getContext();
            const chat = ctx.chat;
            const nextMesId = chat ? chat.length : 0;
            lastUsedSkill = { skillId, cost: skill.cost, mesId: nextMesId };
            injectSkillActivation(result.skill);
            console.log(`[Prism] Skill activated: ${result.skill.id}`);
            activateSkillPrompt(result.skill);
            showPrismNotice(`${result.skill.name} 已激活，将在下一条消息生效`);
            renderPanel();
        });
    });
}

// ============================================================
//  Skill activation injection
// ============================================================
let pendingSkill = null;      // for prompt injection (cleared after injected)
let pendingSkillUI = null;    // for UI state (cleared after char responds)
let lastUsedSkill = null;     // { skillId, cost, mesId } for refund tracking
let _skillActivatedAtMesId = -1; // floor number when skill was activated
let _skillFired = false;      // true once char responds with [PRISM: ...] after skill activation

function injectSkillActivation(skill) {
    pendingSkill = skill;
    pendingSkillUI = skill;    // keep UI locked until char responds
    _skillFired = false;       // reset: skill hasn't produced output yet
    // Record current chat length (next message will be at this index)
    const ctx = getContext();
    _skillActivatedAtMesId = ctx.chat ? ctx.chat.length - 1 : -1;
    console.log(`[Prism] Skill activated at floor ${_skillActivatedAtMesId}`);
}

// ============================================================
//  Confirm dialog (styled to match Prism)
// ============================================================
function showPrismConfirm(text) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'prism-confirm-overlay';
        overlay.innerHTML = `
            <div class="prism-confirm-box">
                <div class="prism-confirm-header">PRISM</div>
                <div class="prism-confirm-body">${escapeHtml(text)}</div>
                <div class="prism-confirm-actions">
                    <button class="prism-confirm-btn prism-confirm-yes">确认</button>
                    <button class="prism-confirm-btn prism-confirm-no">取消</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const box = overlay.querySelector('.prism-confirm-box');
        let detachViewportHandlers = null;

        const positionMobileConfirmBox = () => {
            if (!IS_TOUCH_DEVICE || !box) return;
            const vv = window.visualViewport;
            const viewportWidth = vv ? vv.width : window.innerWidth;
            const viewportHeight = vv ? vv.height : window.innerHeight;
            const offsetLeft = vv ? vv.offsetLeft : 0;
            const offsetTop = vv ? vv.offsetTop : 0;

            box.style.position = 'fixed';
            box.style.width = `min(420px, calc(${Math.max(320, Math.floor(viewportWidth))}px - 32px))`;
            box.style.maxWidth = `calc(${Math.floor(viewportWidth)}px - 32px)`;
            box.style.left = '-9999px';
            box.style.top = '-9999px';
            box.style.transform = 'none';

            requestAnimationFrame(() => {
                const rect = box.getBoundingClientRect();
                const left = offsetLeft + Math.max(16, Math.round((viewportWidth - rect.width) / 2));
                const top = offsetTop + Math.max(16, Math.round((viewportHeight - rect.height) / 2));
                box.style.left = `${left}px`;
                box.style.top = `${top}px`;
                box.style.margin = '0';
            });
        };

        if (IS_TOUCH_DEVICE) {
            positionMobileConfirmBox();
            const onViewportChange = () => positionMobileConfirmBox();
            window.addEventListener('resize', onViewportChange);
            window.addEventListener('orientationchange', onViewportChange);
            window.visualViewport?.addEventListener('resize', onViewportChange);
            window.visualViewport?.addEventListener('scroll', onViewportChange);
            detachViewportHandlers = () => {
                window.removeEventListener('resize', onViewportChange);
                window.removeEventListener('orientationchange', onViewportChange);
                window.visualViewport?.removeEventListener('resize', onViewportChange);
                window.visualViewport?.removeEventListener('scroll', onViewportChange);
            };
        }

        const close = (val) => {
            detachViewportHandlers?.();
            overlay.remove();
            resolve(val);
        };
        overlay.querySelector('.prism-confirm-yes').addEventListener('click', () => close(true));
        overlay.querySelector('.prism-confirm-no').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
}

// ============================================================
//  Notice (lightweight)
// ============================================================
function showPrismNotice(text) {
    const el = document.createElement('div');
    el.className = 'prism-notice';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = text;
    document.body.appendChild(el);

    let detachViewportHandlers = null;

    const positionMobileNotice = () => {
        if (!IS_TOUCH_DEVICE || !el) return;
        const vv = window.visualViewport;
        const viewportWidth = vv ? vv.width : window.innerWidth;
        const viewportHeight = vv ? vv.height : window.innerHeight;
        const offsetLeft = vv ? vv.offsetLeft : 0;
        const offsetTop = vv ? vv.offsetTop : 0;

        el.style.position = 'fixed';
        el.style.maxWidth = `calc(${Math.floor(viewportWidth)}px - 32px)`;
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        el.style.transform = 'none';

        requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            const left = offsetLeft + Math.max(16, Math.round((viewportWidth - rect.width) / 2));
            const top = offsetTop + Math.max(16, Math.round((viewportHeight - rect.height) / 2));
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
            el.style.margin = '0';
        });
    };

    if (IS_TOUCH_DEVICE) {
        positionMobileNotice();
        const onViewportChange = () => positionMobileNotice();
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('orientationchange', onViewportChange);
        window.visualViewport?.addEventListener('resize', onViewportChange);
        window.visualViewport?.addEventListener('scroll', onViewportChange);
        detachViewportHandlers = () => {
            window.removeEventListener('resize', onViewportChange);
            window.removeEventListener('orientationchange', onViewportChange);
            window.visualViewport?.removeEventListener('resize', onViewportChange);
            window.visualViewport?.removeEventListener('scroll', onViewportChange);
        };
    }

    requestAnimationFrame(() => el.classList.add('prism-notice-show'));
    setTimeout(() => {
        el.classList.remove('prism-notice-show');
        el.classList.add('prism-notice-hide');
        detachViewportHandlers?.();
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 2500);
}

// ============================================================
//  Event hooks
// ============================================================
// ============================================================
//  Scan & beautify all existing [PRISM: ...] in chat
//  (handles greetings / messages rendered before extension init)
//  Pure render pass — no side effects (no addJudgment, no completeTask)
// ============================================================
function beautifyPrismTags(html) {
    // Helper: optional wrapping tags that ST's markdown engine may add
    // Handles <strong>, <em>, <q>, <strong><em>, <em><strong>, nested or solo
    const wrapOpen  = '(?:<(?:strong|em|b|i|q)>\\s*)*';
    const wrapClose = '(?:\\s*</(?:strong|em|b|i|q)>)*';

    // 1) Strip PRISM_TASK tags completely (side-effect-free; data already extracted in onMessageReceived)
    const taskRe = new RegExp(wrapOpen + '\\[PRISM_TASK:[^\\]]*\\]' + wrapClose, 'gi');
    let out = html.replace(taskRe, '');
    // Clean up empty <q></q> tags and empty block tags left behind
    out = out.replace(/<q>\s*<\/q>/gi, '');
    out = out.replace(/<(p|div|li)>\s*<\/\1>/gi, '');

    // 2) Beautify [PRISM: ...] tags into styled spans
    // Content may contain HTML tags injected by ST's markdown engine (<q>, <p>, <em>, etc.)
    // Strip them to get clean plain text before displaying
    const prismRe = new RegExp(wrapOpen + '\\[PRISM:\\s*([^\\]]+)\\]' + wrapClose, 'g');
    out = out.replace(prismRe,
        (_, content) => {
            const clean = stripHtml(content).trim();
            return `<span class="prism-inline-msg"><span class="prism-tag">PRISM</span><span class="prism-inline-content">${escapeHtml(clean)}</span></span>`;
        }
    );
    // Final cleanup: remove empty block/inline tags left behind after PRISM tag extraction
    out = out.replace(/<(p|div|li|q|blockquote)>\s*<\/\1>/gi, '');
    return out;
}

// ============================================================
//  PRISM tag rendering — MutationObserver (event-driven)
//  Only processes elements that actually changed, batched per frame.
// ============================================================
function tryBeautifyEl(el) {
    if (!el) return;
    const html = el.innerHTML;
    if (!html.includes('[PRISM:') && !html.includes('[PRISM_TASK:')) return;
    if (!/\[PRISM:\s*[^\]]+\]/.test(html) && !/\[PRISM_TASK:[^\]]*\]/.test(html)) return;
    el.innerHTML = beautifyPrismTags(html);
}

function setupChatObserver() {
    const chat = document.getElementById('chat');
    if (!chat) return;

    let pending = new Set();
    let scheduled = false;

    function flush() {
        scheduled = false;
        for (const el of pending) tryBeautifyEl(el);
        pending.clear();
    }

    function enqueue(el) {
        pending.add(el);
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(flush);
        }
    }

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            let target = m.target;
            if (target.nodeType === Node.TEXT_NODE) target = target.parentElement;
            const mesText = target?.closest?.('.mes_text');
            if (mesText) { enqueue(mesText); continue; }
            for (const node of m.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.classList?.contains('mes_text')) enqueue(node);
                else { const inner = node.querySelector?.('.mes_text'); if (inner) enqueue(inner); }
            }
        }
    });

    observer.observe(chat, { childList: true, subtree: true, characterData: true });
}

function onChatChanged() {
    const ctx = getContext();
    const newChatId = ctx?.chatId || (ctx?.characterId != null ? 'char_' + ctx.characterId : null);
    
    // Refund points if skill was pending in old chat
    if (currentChatId && lastUsedSkill && !_skillFired) {
        const oldChat = getChatSettings(currentChatId);
        oldChat.points += lastUsedSkill.cost;
        saveSettings();
    }
    
    // Switch to new chat
    currentChatId = newChatId;
    console.log(`[Prism] Chat switched to: ${currentChatId}`);
    
    // Clear skill states on chat switch
    if (pendingSkill) { pendingSkill = null; }
    if (pendingSkillUI) { pendingSkillUI = null; }
    _skillActivatedAtMesId = -1;
    clearSkillPrompt();
    lastUsedSkill = null;
    _skillFired = false;
    
    // Auto-draw tasks if new chat has none
    const g = getGlobalSettings();
    const s = getChatSettings();
    if (g.enabled && s.currentTasks.length === 0) {
        drawTasks();
    }
    
    document.querySelectorAll('#chat .mes .mes_text').forEach(tryBeautifyEl);
    renderPanel();
    updateStatusLine();
}

function onMessageReceived(messageId) {
    // Note: do NOT modify msg.mes here — that would pollute raw message data with HTML.
    // Beautification is handled in onMessageRendered (DOM layer only).
    const g = getGlobalSettings();
    if (!g.enabled) return;

    const ctx = getContext();
    const msg = ctx.chat?.[messageId];
    if (!msg || msg.is_user || !msg.mes) return;

    // 1) 仅记录“技能触发后的技能结果”，不记录日常被动播报。
    //    约定：如果同一楼里有多条 [PRISM: ...]，最后一条视为技能结果。
    const prismRe = /\[PRISM:\s*([^\]]+)\]/g;
    const prismMatches = [];
    let pm;
    while ((pm = prismRe.exec(msg.mes)) !== null) {
        prismMatches.push(pm[1].trim());
    }

    const hasPrism = prismMatches.length > 0;
    // Skill reply requires at least 2 PRISM tags (passive broadcast + skill result)
    const isSkillReply = prismMatches.length >= 2 && _skillActivatedAtMesId >= 0 && messageId > _skillActivatedAtMesId;

    if (isSkillReply) {
        addJudgment(prismMatches[prismMatches.length - 1]);
        _skillFired = true;
        console.log(`[Prism] Skill fired successfully at floor ${messageId}`);
    }

    // 2) Task auto-completion detection
    if (msg.mes.includes('[PRISM_TASK')) {
        const taskRe = /\[PRISM_TASK:\s*(\d+)\s*\|\s*status:\s*complete\s*\|\s*reason:\s*([^\]]*)\]/gi;
        let m;
        while ((m = taskRe.exec(msg.mes)) !== null) {
            const tid = parseInt(m[1], 10);
            const reason = m[2].trim();
            const completed = completeTask(tid, reason);
            if (completed) {
                const quip = COMPLETION_QUIPS[Math.floor(Math.random() * COMPLETION_QUIPS.length)];
                showTaskToast(completed, completed.autoRefreshed ? `${quip} 五项任务已清空，列表已自动刷新。` : quip);
            }
        }
    }

    // 3) Unlock skills when char replies after skill activation (floor-based check)
    //    Unlock as long as char replied (new floor), regardless of whether [PRISM: ...] appeared.
    if (pendingSkillUI && _skillActivatedAtMesId >= 0 && messageId > _skillActivatedAtMesId) {
        console.log(`[Prism] Char replied at floor ${messageId} (skill was at ${_skillActivatedAtMesId}), unlocking`);
        
        // If skill didn't fire (not enough PRISM output for skill result), refund points
        if (!_skillFired) {
            const refundSkill = SKILLS.find(sk => sk.id === pendingSkillUI.id);
            if (refundSkill && lastUsedSkill) {
                const s = getChatSettings();
                s.points += refundSkill.cost;
                saveSettings();
                showPrismNotice(`Prism 信号受干扰，本轮未能捕获数据，积分已返还给宿主。`);
                console.log(`[Prism] Skill ${pendingSkillUI.id} not fired, refunded ${refundSkill.cost} pts`);
            }
            lastUsedSkill = null;
        } else {
            lastUsedSkill = null;
        }
        
        pendingSkillUI = null;
        _skillActivatedAtMesId = -1;
        renderPanel();
    }
    // 4) Passive broadcast missing — silent (char may not be interacting with user)
    //    No notice needed; only skill failures get user-facing feedback.
}

// (onMessageRendered removed — handled inline in init via MESSAGE_RENDERED event)

// ============================================================
//  Prompt injection via ST's setExtensionPrompt
// ============================================================
// ============================================================
//  Prompt injection — always keep extension prompt up to date
// ============================================================
let _skillPromptText = '';  // persists until GENERATION_STOPPED clears it

function refreshExtensionPrompt() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        console.warn('[Prism] setExtensionPrompt not available');
        return;
    }
    const g = getGlobalSettings();
    if (!g.enabled) {
        ctx.setExtensionPrompt(EXT_NAME, '', 0, 0);
        ctx.setExtensionPrompt(EXT_NAME + '_skill', '', 0, 0);
        _skillPromptText = '';
        console.log('[Prism] Extension disabled, cleared prompt');
        return;
    }
    
    // Base prompt: task list only (base rules are in World Info)
    let basePrompt = buildPromptInjection();
    ctx.setExtensionPrompt(EXT_NAME, basePrompt, 0, 0);
    console.log('[Prism] Base prompt updated (task list)');
    
    // Skill prompt: managed separately, persists until generation completes
    // _skillPromptText is set by activateSkillPrompt() and cleared by clearSkillPrompt()
    if (_skillPromptText) {
        ctx.setExtensionPrompt(EXT_NAME + '_skill', _skillPromptText, 0, 0);
        console.log('[Prism] Skill prompt still active (preserved)');
    } else {
        ctx.setExtensionPrompt(EXT_NAME + '_skill', '', 0, 0);
    }
}

function activateSkillPrompt(skill) {
    const fullSkill = SKILLS.find(sk => sk.id === skill.id);
    const triggerText = fullSkill?.trigger || `[PRISM_SKILL: ${skill.id}]`;
    _skillPromptText = `[System — Prism 技能触发指令]
${triggerText}`;
    
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt === 'function') {
        ctx.setExtensionPrompt(EXT_NAME + '_skill', _skillPromptText, 0, 0);
        console.log(`[Prism] ✅ Skill prompt activated: ${skill.id}`);
    }
}

function clearSkillPrompt() {
    _skillPromptText = '';
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt === 'function') {
        ctx.setExtensionPrompt(EXT_NAME + '_skill', '', 0, 0);
        console.log('[Prism] Skill prompt cleared');
    }
}

function setupPromptInjection() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') return;

    // GENERATION_STARTED: just clear pendingSkill flag, do NOT touch the prompt
    // The skill prompt is already written and must persist until generation completes
    eventSource.on(event_types.GENERATION_STARTED, () => {
        if (pendingSkill) {
            console.log(`[Prism] Generation started, pendingSkill cleared (prompt preserved)`);
            pendingSkill = null;
        }
    });

    // GENERATION_STOPPED: skill prompt cleanup + conditional unlock
    eventSource.on(event_types.GENERATION_STOPPED, () => {
        if (pendingSkillUI) {
            // Generation stopped without a new char message (interrupted/failed) — keep locked, keep prompt
            console.log('[Prism] GENERATION_STOPPED: no char reply yet, keeping locked for next turn');
            if (pendingSkillUI) activateSkillPrompt(pendingSkillUI);
        } else {
            clearSkillPrompt();
        }
        refreshExtensionPrompt();
    });

    eventSource.on(event_types.SETTINGS_UPDATED, refreshExtensionPrompt);

    // Initial prompt setup
    refreshExtensionPrompt();
}

// Refund logic (swipe/delete triggered)
function checkRefund() {
    if (!lastUsedSkill) return;
    // If skill already fired, no refund — user is just swiping the char reply
    if (_skillFired) {
        lastUsedSkill = null;
        return;
    }
    const s = getChatSettings();
    s.points += lastUsedSkill.cost;
    saveSettings();
    if (pendingSkillUI && pendingSkillUI.id === lastUsedSkill.skillId) {
        pendingSkillUI = null;
    }
    clearSkillPrompt();
    showPrismNotice(`技能未生效，已退回 ${lastUsedSkill.cost} 积分`);
    lastUsedSkill = null;
    _skillFired = false;
    _skillActivatedAtMesId = -1;
    renderPanel();
}

// Cancel a pending skill manually (user clicks cancel button)
function cancelPendingSkill(skillId) {
    if (!pendingSkillUI || pendingSkillUI.id !== skillId) return;
    const skill = SKILLS.find(sk => sk.id === skillId);
    const cost = skill ? skill.cost : (lastUsedSkill ? lastUsedSkill.cost : 0);
    // Refund points
    if (cost > 0) {
        const s = getChatSettings();
        s.points += cost;
        saveSettings();
    }
    // Clear all skill state
    pendingSkill = null;
    pendingSkillUI = null;
    lastUsedSkill = null;
    _skillFired = false;
    _skillActivatedAtMesId = -1;
    clearSkillPrompt();
    showPrismNotice(`「${skill ? skill.name : '技能'}」已取消，退回 ${cost} 积分`);
    renderPanel();
}

// ============================================================
//  Init
// ============================================================
function registerSlashCommands() {
    if (window.__prismSlashRegistered) return;
    window.__prismSlashRegistered = true;

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'prism',
        aliases: ['prime'],
        callback: (_args, value) => {
            const g = getGlobalSettings();
            if (!g.enabled) return '';

            const action = String(value || '').trim().toLowerCase();
            if (action === 'open') {
                window.PrismOpenPanel();
                return '';
            }
            if (action === 'close') {
                window.PrismClosePanel();
                return '';
            }
            if (action === 'toggle' || action === '') {
                window.PrismTogglePanel();
                return '';
            }
            return '';
        },
        helpString: '打开或关闭 Prism 面板。用法：/prism open、/prism close、/prism toggle',
    }));
}

jQuery(async () => {
    // Initialize settings structure
    getGlobalSettings();
    
    // Sync to current chat
    const ctx = getContext();
    currentChatId = ctx?.chatId || (ctx?.characterId != null ? 'char_' + ctx.characterId : null);
    console.log(`[Prism] Init with chatId: ${currentChatId}`);

    // Inject settings HTML into ST extensions panel
    const settingsHtml = buildSettingsHtml();
    $('#extensions_settings').append(settingsHtml);
    bindSettingsEvents();

    // Create panel container only; floating icon removed
    removeDesktopIcon();
    ensurePanelContainer();
    bindClickOutside();
    registerSlashCommands();
    refreshExtensionPrompt();

    // Setup prompt injection
    setupPromptInjection();

    // Hook events
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_RENDERED, (messageId) => {
        const ctx = getContext();
        const msg = ctx.chat?.[messageId];
        const el = document.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`);
        if (el) tryBeautifyEl(el);
        // Clear UI pending state when char responds (floor-based, handled in onMessageReceived)
        // No action needed here — onMessageReceived already unlocks based on floor number
        // Note: lastUsedSkill is NOT cleared here — kept for swipe refund
    });
    eventSource.on(event_types.MESSAGE_DELETED, checkRefund);
    eventSource.on(event_types.MESSAGE_SWIPED, checkRefund);
    // User sends next message — do NOT clear lastUsedSkill here.
    // It's cleared only when skill fires (GENERATION_STOPPED) or on refund (swipe/delete/chat change).
    // eventSource.on(event_types.MESSAGE_SENT, ...) intentionally removed.

    // Event-driven rendering via MutationObserver (no polling)
    setupChatObserver();

    console.log(`[${EXT_DISPLAY}] Loaded v1.0.1 (per-chat isolation)`);
});

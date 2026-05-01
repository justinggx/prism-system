// ============================================================
//  Prism — 游戏化系统层 ST 扩展
//  v1.0.0
// ============================================================

import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT_NAME = 'prism-system';
const EXT_DISPLAY = 'Prism';

// ── Default settings ────────────────────────────────────────
const DEFAULT_SETTINGS = {
    enabled: false,
    showDesktopIcon: false,
    activeSystems: ['truth'],   // 当前只有实话系统
    points: 100,
    currentTasks: [],           // 当前5个任务
    completedTasks: [],         // 最近5条完成记录
    judgmentLog: [],            // 最近5条判定记录
    taskRefreshUnlocked: false, // 完成1个任务后解锁刷新
};

// ── Task database ───────────────────────────────────────────
const TASK_DB = [
    // 互动类 5分
    { id: 1,  cat: '互动', pts: 5,  text: '和char一起吃一顿饭' },
    { id: 2,  cat: '互动', pts: 5,  text: '让char给你讲一个他的童年故事' },
    { id: 3,  cat: '互动', pts: 5,  text: '主动给char带一份礼物' },
    { id: 4,  cat: '互动', pts: 5,  text: '和char一起散步超过3轮对话' },
    { id: 5,  cat: '互动', pts: 5,  text: '问char一个他不想回答的问题' },
    { id: 6,  cat: '互动', pts: 5,  text: '让char教你一项他擅长的技能' },
    { id: 7,  cat: '互动', pts: 5,  text: '和char玩一个小游戏（猜拳、打赌等）' },
    { id: 8,  cat: '互动', pts: 5,  text: '故意说一句假话看char反应' },
    { id: 9,  cat: '互动', pts: 5,  text: '在char面前假装接到别人的暧昧电话' },
    { id: 10, cat: '互动', pts: 5,  text: '请char帮你挑一件衣服' },
    // 试探类 10分
    { id: 11, cat: '试探', pts: 10, text: '成功识破char的一次谎言' },
    { id: 12, cat: '试探', pts: 10, text: '让char主动提起一件旧事' },
    { id: 13, cat: '试探', pts: 10, text: '在对话中让char不小心说漏嘴' },
    { id: 14, cat: '试探', pts: 10, text: '故意提起char的敏感话题观察反应' },
    { id: 15, cat: '试探', pts: 10, text: '用系统验证char的一句承诺' },
    { id: 16, cat: '试探', pts: 10, text: '让char对你做出一个具体承诺' },
    { id: 17, cat: '试探', pts: 10, text: '在char撒谎时不拆穿，引导他继续编' },
    { id: 18, cat: '试探', pts: 10, text: '成功让char自相矛盾' },
    { id: 19, cat: '试探', pts: 10, text: '让char解释一件他之前回避的事' },
    { id: 20, cat: '试探', pts: 10, text: '在char试探你时反向试探他' },
    // 整蛊/社交类 5分
    { id: 21, cat: '整蛊', pts: 5,  text: '整蛊char一次（不过分）' },
    { id: 22, cat: '整蛊', pts: 5,  text: '让char吃醋' },
    { id: 23, cat: '整蛊', pts: 5,  text: '故意冷落char一轮看他反应' },
    { id: 24, cat: '整蛊', pts: 5,  text: '在别人面前夸char看他什么表情' },
    { id: 25, cat: '整蛊', pts: 5,  text: '假装忘记char说过的重要的话' },
    { id: 26, cat: '整蛊', pts: 5,  text: '让char替你做一件小事' },
    { id: 27, cat: '整蛊', pts: 5,  text: '模仿char的说话方式跟他对话' },
    { id: 28, cat: '整蛊', pts: 5,  text: '故意曲解char的意思看他怎么纠正' },
    { id: 29, cat: '整蛊', pts: 5,  text: '在char得意时泼冷水' },
    { id: 30, cat: '整蛊', pts: 5,  text: '假装对别的NPC感兴趣' },
    // 剧情推进类 15分
    { id: 31, cat: '剧情', pts: 15, text: '发现char隐瞒的一个关键事实' },
    { id: 32, cat: '剧情', pts: 15, text: '让char第一次对你说真心话' },
    { id: 33, cat: '剧情', pts: 15, text: '触发char的一次情绪失控' },
    { id: 34, cat: '剧情', pts: 15, text: '完成一次关键剧情对峙' },
    { id: 35, cat: '剧情', pts: 15, text: '让char主动向你道歉' },
];

// ── Skill definitions ───────────────────────────────────────
const SKILLS = [
    { id: 'detect',    name: '主动测谎',   cost: 30, desc: '指定char下一句话，系统强制判定真假' },
    { id: 'analyze',   name: '深度分析',   cost: 80, desc: '分析char某句话背后的真实动机和隐藏信息' },
    { id: 'emotion',   name: '情绪透视',   cost: 50, desc: '查看char当前真实情绪状态（不是表面表现的）' },
    { id: 'retrospect',name: '谎言回溯',   cost: 10, desc: '系统回顾最近对话，标记所有可疑陈述' },
    { id: 'weakness',  name: '弱点探测',   cost: 30, desc: '系统提示char当前最在意/最想隐藏的话题方向' },
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

// ── Truth-system prompt template ────────────────────────────
const TRUTH_SYSTEM_PROMPT = `[System: Prism — 实话系统 已激活]

你（AI）现在在写主楼时需要额外执行以下规则：

## 被动播报
- 在关键对话节点（否认、解释、承诺、装傻、示弱、试探、转移重点）自动插入系统旁白
- 格式：[PRISM: 旁白内容]
- 被动播报只给方向暗示，不给具体判定：可以吐槽、给建议、暗示，但不能直接说真假，不能做深度分析
- 日常寒暄可省略，不逐句触发
- 短、准、直接，科技感+微毒舌

## 主动技能（当系统提示你执行时）
- [PRISM_SKILL: detect] → 对char下一句话强制判定真假，格式 [PRISM: 判定结果]
- [PRISM_SKILL: analyze] → 深度分析char某句话背后的真实动机，格式 [PRISM: 分析结果]
- [PRISM_SKILL: emotion] → 展示char当前真实情绪，格式 [PRISM: 情绪透视结果]
- [PRISM_SKILL: retrospect] → 回顾最近对话标记可疑陈述，格式 [PRISM: 回溯结果]
- [PRISM_SKILL: weakness] → 提示char当前最在意/最想隐藏的方向，格式 [PRISM: 探测结果]

## 任务自动判定
- 当你观察到user在对话中完成了以下任务之一，在主楼末尾追加隐藏标记（不影响正文）：
  [PRISM_TASK: <任务id> | status: complete | reason: <简述>]
- 当前任务列表：
{{ACTIVE_TASKS}}

## 判定类型
真话 / 谎言 / 半真半假 / 避重就轻 / 刻意误导 / 关键事实缺失 / 情绪目的偏移 / 未知

## 限制
- 不能读心、不能凭空生成未表达的信息
- 不能替user得出完整真相、不能改变他人认知
- char永远不能自动察觉系统存在
- 系统仅user可见`;

// ============================================================
//  Helper: settings access
// ============================================================
function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    const s = extension_settings[EXT_NAME];
    // backfill any missing keys from defaults
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        if (!(k in s)) s[k] = structuredClone(v);
    }
    return s;
}

function saveSettings() {
    saveSettingsDebounced();
}

// ============================================================
//  Task helpers
// ============================================================
function drawTasks(count = 5) {
    const s = getSettings();
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
    const s = getSettings();
    const task = s.currentTasks.find(t => t.id === taskId);
    if (!task || task.done) return null;
    task.done = true;
    s.points += task.pts;
    s.completedTasks.unshift({ id: task.id, text: task.text, pts: task.pts, reason, ts: Date.now() });
    if (s.completedTasks.length > 5) s.completedTasks = s.completedTasks.slice(0, 5);
    s.taskRefreshUnlocked = true;
    saveSettings();
    return task;
}

function useSkill(skillId) {
    const s = getSettings();
    const skill = SKILLS.find(sk => sk.id === skillId);
    if (!skill) return { ok: false, reason: '未知技能' };
    if (s.points < skill.cost) return { ok: false, reason: `积分不足（需要${skill.cost}，当前${s.points}）` };
    s.points -= skill.cost;
    saveSettings();
    return { ok: true, skill };
}

function addJudgment(text) {
    const s = getSettings();
    s.judgmentLog.unshift({ text, ts: Date.now() });
    if (s.judgmentLog.length > 5) s.judgmentLog = s.judgmentLog.slice(0, 5);
    saveSettings();
}

// ============================================================
//  Prompt injection
// ============================================================
function buildPromptInjection() {
    const s = getSettings();
    if (!s.enabled || !s.activeSystems.includes('truth')) return '';

    const taskLines = s.currentTasks
        .filter(t => !t.done)
        .map(t => `  - ID:${t.id} 「${t.text}」(${t.cat} ${t.pts}分)`)
        .join('\n');

    return TRUTH_SYSTEM_PROMPT.replace('{{ACTIVE_TASKS}}', taskLines || '  （无当前任务）');
}

// ============================================================
//  Message interception — beautify [PRISM: ...] blocks
// ============================================================
function processPrismOutput(messageText) {
    const s = getSettings();
    if (!s.enabled) return messageText;

    let processed = messageText;

    // 1) 任务完成标记 [PRISM_TASK: id | status: complete | reason: ...]
    const taskRe = /\[PRISM_TASK:\s*(\d+)\s*\|\s*status:\s*complete\s*\|\s*reason:\s*([^\]]*)\]/gi;
    let taskMatch;
    while ((taskMatch = taskRe.exec(messageText)) !== null) {
        const tid = parseInt(taskMatch[1], 10);
        const reason = taskMatch[2].trim();
        const completed = completeTask(tid, reason);
        if (completed) {
            const quip = COMPLETION_QUIPS[Math.floor(Math.random() * COMPLETION_QUIPS.length)];
            // We'll inject a notification; the raw tag gets stripped
            showTaskToast(completed, quip);
        }
    }
    // Strip task tags from display
    processed = processed.replace(taskRe, '');

    // 2) Skill results [PRISM_SKILL_RESULT: ...] (future use)

    // 3) 被动播报 & 技能结果 [PRISM: ...]
    processed = processed.replace(
        /\[PRISM:\s*([^\]]+)\]/g,
        (_, content) => {
            addJudgment(content.trim());
            return `<div class="prism-inline-msg"><span class="prism-tag">PRISM</span> ${content.trim()}</div>`;
        }
    );

    return processed;
}

// ============================================================
//  Toast notification
// ============================================================
function showTaskToast(task, quip) {
    const toast = document.createElement('div');
    toast.className = 'prism-toast';
    toast.innerHTML = `
        <div class="prism-toast-header">◆ 任务完成</div>
        <div class="prism-toast-body">
            <div class="prism-toast-task">${task.text} <span class="prism-toast-pts">+${task.pts}</span></div>
            <div class="prism-toast-quip">${quip}</div>
            <div class="prism-toast-footer">${COMPLETION_FOOTER}</div>
        </div>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('prism-toast-show'));
    setTimeout(() => {
        toast.classList.remove('prism-toast-show');
        setTimeout(() => toast.remove(), 400);
    }, 4500);
    // Also refresh the panel if open
    renderPanel();
}

// ============================================================
//  UI — Extension settings panel (layer 1)
// ============================================================
function buildSettingsHtml() {
    return `
    <div id="prism-settings" class="prism-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Prism</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="prism-enabled" />
                    <span>启用 Prism</span>
                </label>
                <label class="checkbox_label">
                    <input type="checkbox" id="prism-show-icon" />
                    <span>显示桌面图标</span>
                </label>
                <div id="prism-status" class="prism-status-line"></div>
            </div>
        </div>
    </div>`;
}

function bindSettingsEvents() {
    const s = getSettings();

    const enabledCb = document.getElementById('prism-enabled');
    const iconCb = document.getElementById('prism-show-icon');

    if (enabledCb) {
        enabledCb.checked = s.enabled;
        enabledCb.addEventListener('change', () => {
            s.enabled = enabledCb.checked;
            saveSettings();
            updateDesktopIcon();
            updateStatusLine();
        });
    }
    if (iconCb) {
        iconCb.checked = s.showDesktopIcon;
        iconCb.addEventListener('change', () => {
            s.showDesktopIcon = iconCb.checked;
            saveSettings();
            updateDesktopIcon();
        });
    }
    updateStatusLine();
}

function updateStatusLine() {
    const el = document.getElementById('prism-status');
    if (!el) return;
    const s = getSettings();
    el.textContent = s.enabled ? `◆ 系统运行中 | 积分: ${s.points}` : '◇ 系统关闭';
}

// ============================================================
//  UI — Desktop floating icon + panel (layer 2)
// ============================================================
let panelOpen = false;

function createDesktopIcon() {
    if (document.getElementById('prism-desktop-icon')) return;

    const icon = document.createElement('div');
    icon.id = 'prism-desktop-icon';
    icon.className = 'prism-desktop-icon';
    icon.innerHTML = '◈';
    icon.title = 'Prism';
    icon.addEventListener('click', togglePanel);
    document.body.appendChild(icon);

    const panel = document.createElement('div');
    panel.id = 'prism-panel';
    panel.className = 'prism-panel';
    document.body.appendChild(panel);
}

function updateDesktopIcon() {
    const s = getSettings();
    const icon = document.getElementById('prism-desktop-icon');
    const panel = document.getElementById('prism-panel');
    if (!icon || !panel) return;
    const show = s.enabled && s.showDesktopIcon;
    icon.style.display = show ? 'flex' : 'none';
    if (!show) {
        panel.style.display = 'none';
        panelOpen = false;
    }
}

function togglePanel() {
    panelOpen = !panelOpen;
    const panel = document.getElementById('prism-panel');
    if (!panel) return;
    panel.style.display = panelOpen ? 'block' : 'none';
    if (panelOpen) renderPanel();
}

function renderPanel() {
    const panel = document.getElementById('prism-panel');
    if (!panel) return;
    const s = getSettings();

    const taskHtml = s.currentTasks.length
        ? s.currentTasks.map(t => `
            <div class="prism-task ${t.done ? 'prism-task-done' : ''}">
                <span class="prism-task-cat">${t.cat}</span>
                <span class="prism-task-text">${t.text}</span>
                <span class="prism-task-pts">${t.pts}分</span>
                ${!t.done ? `<button class="prism-task-btn" data-tid="${t.id}" title="手动完成">✓</button>` : '<span class="prism-task-check">✔</span>'}
            </div>`).join('')
        : '<div class="prism-empty">暂无任务</div>';

    const refreshBtn = s.taskRefreshUnlocked
        ? '<button id="prism-refresh-tasks" class="prism-btn">刷新任务</button>'
        : '<button class="prism-btn prism-btn-disabled" disabled>完成任务后解锁刷新</button>';

    const skillsHtml = SKILLS.map(sk => `
        <div class="prism-skill">
            <button class="prism-skill-btn" data-skill="${sk.id}" ${s.points < sk.cost ? 'disabled' : ''}>
                ${sk.name} <span class="prism-skill-cost">${sk.cost}分</span>
            </button>
            <span class="prism-skill-desc">${sk.desc}</span>
        </div>`).join('');

    const logHtml = s.judgmentLog.length
        ? s.judgmentLog.map(j => `<div class="prism-log-entry"><span class="prism-log-time">${new Date(j.ts).toLocaleTimeString()}</span> ${j.text}</div>`).join('')
        : '<div class="prism-empty">暂无记录</div>';

    const completedHtml = s.completedTasks.length
        ? s.completedTasks.map(c => `<div class="prism-log-entry"><span class="prism-log-time">${new Date(c.ts).toLocaleTimeString()}</span> ${c.text} <span class="prism-task-pts">+${c.pts}</span></div>`).join('')
        : '';

    panel.innerHTML = `
        <div class="prism-panel-header">
            <span class="prism-panel-title">◈ PRISM</span>
            <span class="prism-panel-points">${s.points} 积分</span>
            <button id="prism-panel-close" class="prism-panel-close">✕</button>
        </div>

        <div class="prism-section">
            <div class="prism-section-title">当前系统</div>
            <div class="prism-systems">
                <label class="prism-system-tag prism-system-active">
                    <input type="checkbox" checked disabled /> 实话系统
                </label>
            </div>
        </div>

        <div class="prism-section">
            <div class="prism-section-title">任务</div>
            <div class="prism-task-list">${taskHtml}</div>
            <div class="prism-task-actions">
                ${refreshBtn}
                ${s.currentTasks.length === 0 ? '<button id="prism-draw-tasks" class="prism-btn">抽取任务</button>' : ''}
            </div>
        </div>

        <div class="prism-section">
            <div class="prism-section-title">系统能力</div>
            <div class="prism-skills">${skillsHtml}</div>
        </div>

        <div class="prism-section">
            <div class="prism-section-title">最近判定</div>
            <div class="prism-log">${logHtml}</div>
        </div>

        ${completedHtml ? `
        <div class="prism-section">
            <div class="prism-section-title">已完成任务</div>
            <div class="prism-log">${completedHtml}</div>
        </div>` : ''}
    `;

    // Bind panel events
    document.getElementById('prism-panel-close')?.addEventListener('click', togglePanel);
    document.getElementById('prism-refresh-tasks')?.addEventListener('click', () => { drawTasks(); renderPanel(); });
    document.getElementById('prism-draw-tasks')?.addEventListener('click', () => { drawTasks(); renderPanel(); });

    // Manual task complete buttons
    panel.querySelectorAll('.prism-task-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tid = parseInt(btn.dataset.tid, 10);
            const completed = completeTask(tid, '手动完成');
            if (completed) {
                const quip = COMPLETION_QUIPS[Math.floor(Math.random() * COMPLETION_QUIPS.length)];
                showTaskToast(completed, quip);
            }
            renderPanel();
        });
    });

    // Skill buttons
    panel.querySelectorAll('.prism-skill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const skillId = btn.dataset.skill;
            const result = useSkill(skillId);
            if (!result.ok) {
                showPrismNotice(result.reason);
                return;
            }
            // Inject skill activation into the next prompt
            injectSkillActivation(result.skill);
            showPrismNotice(`${result.skill.name} 已激活，将在下一条消息生效`);
            renderPanel();
        });
    });
}

// ============================================================
//  Skill activation injection
// ============================================================
let pendingSkill = null;

function injectSkillActivation(skill) {
    pendingSkill = skill;
}

// ============================================================
//  Notice (lightweight)
// ============================================================
function showPrismNotice(text) {
    const el = document.createElement('div');
    el.className = 'prism-notice';
    el.textContent = `◈ ${text}`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('prism-notice-show'));
    setTimeout(() => {
        el.classList.remove('prism-notice-show');
        setTimeout(() => el.remove(), 300);
    }, 2500);
}

// ============================================================
//  Event hooks
// ============================================================
function onChatChanged() {
    const s = getSettings();
    // If no tasks drawn yet, auto-draw
    if (s.enabled && s.currentTasks.length === 0) {
        drawTasks();
    }
    renderPanel();
    updateStatusLine();
}

function onMessageReceived(messageId) {
    const s = getSettings();
    if (!s.enabled) return;

    const ctx = getContext();
    const msg = ctx.chat?.[messageId];
    if (!msg || msg.is_user) return;

    // Process PRISM tags in AI output
    if (msg.mes && (msg.mes.includes('[PRISM') || msg.mes.includes('[PRISM_TASK'))) {
        msg.mes = processPrismOutput(msg.mes);
    }
}

function onPromptReady(eventData) {
    const s = getSettings();
    if (!s.enabled) return;

    // Inject system prompt
    const injection = buildPromptInjection();
    if (injection) {
        // Use ST's injection API if available, else prepend to system prompt
        if (typeof eventData === 'object' && eventData.prompt) {
            eventData.prompt = injection + '\n\n' + eventData.prompt;
        }
    }

    // Inject pending skill activation
    if (pendingSkill) {
        const skillTag = `[PRISM_SKILL: ${pendingSkill.id}]`;
        if (typeof eventData === 'object' && eventData.prompt) {
            eventData.prompt += `\n\n${skillTag}`;
        }
        pendingSkill = null;
    }
}

// ============================================================
//  Message rendering hook — intercept & beautify
// ============================================================
function onMessageRendered(messageId) {
    const s = getSettings();
    if (!s.enabled) return;

    const msgEl = document.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`);
    if (!msgEl) return;

    const html = msgEl.innerHTML;
    if (!html.includes('[PRISM') && !html.includes('[PRISM_TASK')) return;

    // Process and re-render
    msgEl.innerHTML = processPrismOutput(html);
}

// ============================================================
//  Prompt injection via ST's setExtensionPrompt
// ============================================================
function setupPromptInjection() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt === 'function') {
        // Register our prompt injection
        const updatePrompt = () => {
            const s = getSettings();
            if (!s.enabled) {
                ctx.setExtensionPrompt(EXT_NAME, '', 1, 0);
                return;
            }
            let prompt = buildPromptInjection();
            if (pendingSkill) {
                prompt += `\n\n[PRISM_SKILL: ${pendingSkill.id}]`;
                pendingSkill = null;
            }
            // injection position: 1 = after main prompt, depth 0 = top
            ctx.setExtensionPrompt(EXT_NAME, prompt, 1, 0);
        };

        // Update before each generation
        eventSource.on(event_types.GENERATION_STARTED, updatePrompt);
        // Also update on settings change
        eventSource.on(event_types.SETTINGS_UPDATED, updatePrompt);
    }
}

// ============================================================
//  Init
// ============================================================
jQuery(async () => {
    // Load settings
    getSettings();

    // Inject settings HTML into ST extensions panel
    const settingsHtml = buildSettingsHtml();
    $('#extensions_settings').append(settingsHtml);
    bindSettingsEvents();

    // Create desktop icon + panel
    createDesktopIcon();
    updateDesktopIcon();

    // Setup prompt injection
    setupPromptInjection();

    // Hook events
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_RENDERED, onMessageRendered);

    console.log(`[${EXT_DISPLAY}] Loaded v1.0.0`);
});

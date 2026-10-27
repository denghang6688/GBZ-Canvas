function tr(key){ return window.StudioI18n ? window.StudioI18n.t(key) : key; }
function tf(key, vars={}){
    return Object.entries(vars).reduce((text, [k,v]) => text.replaceAll(`{${k}}`, v), tr(key));
}
function refreshLanguageView(){
    document.title = tr('comfy.title');
    renderList();
    renderEditor();
    renderPreview();
    renderWorkspaceView();
    refreshIcons();
}
function applyLanguage(){
    if(window.StudioI18n) window.StudioI18n.apply();
    refreshLanguageView();
}
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }

const TYPES = [
    { v:'text', zh:'文本', en:'Text' },
    { v:'textarea', zh:'多行文本', en:'Textarea' },
    { v:'number', zh:'数字', en:'Number' },
    { v:'slider', zh:'滑块', en:'Slider' },
    { v:'dropdown', zh:'下拉框', en:'Dropdown' },
    { v:'image', zh:'图片', en:'Image' },
    { v:'video', zh:'视频', en:'Video' },
    { v:'audio', zh:'音频', en:'Audio' },
    { v:'boolean', zh:'开关', en:'Switch' },
];
const FALLBACK_WORKFLOWS = [
    {name:'F2K-图像融图.json', title:'F2K-图像融图', builtin:true, field_count:0},
    {name:'FLUX2扩图.json', title:'FLUX2扩图', builtin:true, field_count:0},
    {name:'Z-Image.json', title:'Z-Image', builtin:true, field_count:0},
    {name:'图像放大（seedvr）.json', title:'图像放大（seedvr）', builtin:true, field_count:0}
];
const BUILTIN_WORKFLOW_NAMES = new Set([
    'Flux2-Klein.json',
    'Z-Image.json',
    'Z-Image-Enhance.json',
    'upscale.json',
    'custom/H3_Ref2VA_15s.json'
]);
function normalizedWorkflowName(name){
    return String(name || '').replace(/\\/g, '/');
}
function isBuiltinWorkflowItem(item){
    return Boolean(item?.builtin) || BUILTIN_WORKFLOW_NAMES.has(normalizedWorkflowName(item?.name));
}
function normalizeWorkflowItem(item){
    return {...item, builtin:isBuiltinWorkflowItem(item)};
}
// ===== ComfyUI 工作流分类（2026-10-15）=====
// 与画布 composer 共用同一套后端分类（GET /api/workflows 返回 category / category_source）。
// 2026-10-27（用户反馈：设置页与画布分类不一致）：补上「图像编辑」，与画布 6 类完全对齐
// —— 之前缺 edit 键，'edit' 类工作流只能按名字兜底猜，导致设置页显示生视频、画布却归图像编辑。
const WF_CATEGORY_DEFS = [
    {key:'image',   label:'生图'},
    {key:'edit',    label:'图像编辑'},
    {key:'video',   label:'生视频'},
    {key:'audio',   label:'生音频'},
    {key:'upscale', label:'放大'},
    {key:'other',   label:'其他'}
];
// 后端没给分类时的兜底推断（老接口/离线场景）——只按文件名关键词猜，尽力而为。
function guessWorkflowCategory(w){
    const text = `${String(w?.name || '')} ${String(w?.title || '')}`.toLowerCase();
    if(/video|视频|vod|seedance|kling|runway|vidu|wan.*video|hailuo|h3|minimax|ref2va|t2va|fl2va/.test(text)) return 'video';
    if(/audio|音频|tts|music|sound|voice|suno/.test(text)) return 'audio';
    if(/upscale|放大|seedvr|supir|增强|enhance/.test(text)) return 'upscale';
    if(/image|图片|生图|文生图|edit|klein|扩图|融图|洗图/.test(text)) return 'image';
    return 'other';
}
function workflowCategoryKey(w){
    const raw = String(w?.category || '').trim().toLowerCase();
    if(WF_CATEGORY_DEFS.some(def => def.key === raw)) return raw;
    return guessWorkflowCategory(w);
}
function workflowCategoryLabel(key){
    return WF_CATEGORY_DEFS.find(def => def.key === key)?.label || '其他';
}
async function setWorkflowCategory(name, value){
    if(!name) return;
    try {
        setStatus('正在保存分类...');
        const res = await fetch(`/api/workflows/${encodeURIComponent(name)}/category`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(value === 'auto' ? {category:'', source:'auto'} : {category:value, source:'manual'})
        });
        if(!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || '分类失败');
        const data = await res.json();
        const item = workflows.find(w => w.name === name);
        if(item){ item.category = data.category; item.category_source = data.category_source; }
        renderList();
        setStatus(`已归类：${workflowCategoryLabel(data.category)}`);
        new BroadcastChannel('studio-api').postMessage({ type: 'workflows-changed' });
    } catch(e){
        setStatus('分类失败：' + (e.message || e));
    }
}
function visibleWorkflows(){
    return workflows;
}
function currentLang(){ return window.StudioI18n?.lang?.() === 'en' ? 'en' : 'zh'; }
function typeLabel(type){
    const item = TYPES.find(t => t.v === type);
    return item ? item[currentLang()] : type;
}

// ComfyUI 节点类型 → 中文 + 图标 + 颜色分类
const NODE_INFO = {
    'KSampler':              { label:'采样器',        icon:'⚙', cat:'sampler' },
    'KSamplerAdvanced':      { label:'采样器（高级）',icon:'⚙', cat:'sampler' },
    'SamplerCustom':         { label:'自定义采样',    icon:'⚙', cat:'sampler' },
    'CheckpointLoaderSimple':{ label:'主模型加载',    icon:'📦', cat:'loader' },
    'UNETLoader':            { label:'UNet 加载',     icon:'📦', cat:'loader' },
    'VAELoader':             { label:'VAE 加载',      icon:'📦', cat:'loader' },
    'CLIPLoader':            { label:'CLIP 加载',     icon:'📦', cat:'loader' },
    'DualCLIPLoader':        { label:'双 CLIP 加载',  icon:'📦', cat:'loader' },
    'LoraLoader':            { label:'LoRA 加载',     icon:'⚡', cat:'lora' },
    'LoraLoaderModelOnly':   { label:'LoRA 加载（仅模型）', icon:'⚡', cat:'lora' },
    'CLIPTextEncode':        { label:'提示词编码',    icon:'✎', cat:'prompt' },
    'CLIPTextEncodeFlux':    { label:'Flux 提示词',   icon:'✎', cat:'prompt' },
    'ConditioningCombine':   { label:'条件合并',      icon:'⊕', cat:'prompt' },
    'ConditioningConcat':    { label:'条件拼接',      icon:'⊕', cat:'prompt' },
    'VAEDecode':             { label:'VAE 解码',      icon:'◐', cat:'vae' },
    'VAEEncode':             { label:'VAE 编码',      icon:'◑', cat:'vae' },
    'LoadImage':             { label:'图片加载',      icon:'🖼', cat:'image' },
    'SaveImage':             { label:'图片保存',      icon:'💾', cat:'output' },
    'PreviewImage':          { label:'图片预览',      icon:'👁', cat:'output' },
    'ImageScale':            { label:'图片缩放',      icon:'⇆', cat:'image' },
    'EmptyLatentImage':      { label:'空白潜空间',    icon:'▦', cat:'latent' },
    'LatentUpscaleBy':       { label:'潜空间放大',    icon:'↗', cat:'latent' },
    'ControlNetApply':       { label:'ControlNet',    icon:'⇨', cat:'controlnet' },
    'ControlNetLoader':      { label:'ControlNet 加载',icon:'📦', cat:'loader' },
    'PrimitiveNode':         { label:'常量',          icon:'•', cat:'misc' },
    'Note':                  { label:'备注',          icon:'≡', cat:'misc' },
};

// 常见输入字段 → 中文友好名
const INPUT_LABELS = {
    'text': '提示词文本',
    'prompt': '提示词',
    'positive': '正向条件',
    'negative': '负向条件',
    'seed': '随机种子',
    'noise_seed': '噪声种子',
    'steps': '采样步数',
    'cfg': 'CFG 引导系数',
    'sampler_name': '采样方法',
    'scheduler': '调度器',
    'denoise': '重绘强度',
    'width': '宽度',
    'height': '高度',
    'batch_size': '批量大小',
    'megapixels': '百万像素',
    'strength_model': '模型强度',
    'strength_clip': 'CLIP 强度',
    'lora_name': 'LoRA 模型',
    'ckpt_name': '主模型',
    'vae_name': 'VAE 模型',
    'clip_name': 'CLIP 模型',
    'clip_name1': 'CLIP 模型 1',
    'clip_name2': 'CLIP 模型 2',
    'unet_name': 'UNet 模型',
    'control_net_name': 'ControlNet 模型',
    'image': '图片',
    'images': '图片',
    'mask': '蒙版',
    'latent': '潜空间',
    'value': '数值',
    'string': '字符串',
    'strength': '强度',
    'guidance': '引导系数',
    'resolution': '分辨率',
    'filename_prefix': '文件名前缀',
    'upscale_method': '放大方式',
    'crop': '裁剪方式',
};

function nodeLabel(node){
    if(node._meta?.title) return node._meta.title;
    return NODE_INFO[node.class_type]?.label || node.class_type || '未命名';
}
function nodeSub(node){
    const info = NODE_INFO[node.class_type];
    if(info && node._meta?.title) return info.label + ' · ' + node.class_type;
    return node.class_type || '';
}
function nodeIcon(node){
    return NODE_INFO[node.class_type]?.icon || '◆';
}
function inputLabel(name){
    return INPUT_LABELS[name] || name;
}

let workflows = [];
let selectedName = '';
let currentWorkflow = null;     // 原始 JSON
let currentConfig = null;       // { title, fields:[...] }
let isBuiltin = false;
let previewValues = {};         // field_id -> 发给后端的值（图片：comfy 文件名）
let previewRandomActive = {};   // field_id -> 筛子运行时是否激活；未设置时默认激活
let previewImageUrls = {};      // field_id -> 浏览器可显示的本地 URL（仅图片字段）
let runResult = null;           // {kind, url, name} 或 null
let workspaceMode = 'graph';
let comfyNativeLoadSeq = 0;     // 防止快速连续点击工作流时旧请求覆盖新选择
let miniView = { k: 1, x: 0, y: 0 };
let miniCards = {};
let miniTestNodes = [];
let miniDrag = null;

const statusEl = document.getElementById('status');
const listEl = document.getElementById('workflowList');
const workflowTitleInput = document.getElementById('workflowTitleInput');
const subEl = document.getElementById('editorSub');
const deleteBtn = document.getElementById('deleteBtn');
const saveBtn = document.getElementById('saveBtn');
const nodeListEl = document.getElementById('nodeList');
const previewCard = document.getElementById('previewContent');
const miniCanvasHost = document.getElementById('miniCanvasHost');

function setStatus(text){ statusEl.textContent = text || ''; }
function workflowEmptyStateEl(){
    let el = document.getElementById('workflowEmptyState');
    if(el) return el;
    const graphCard = document.getElementById('graphCard');
    if(!graphCard) return null;
    el = document.createElement('div');
    el.id = 'workflowEmptyState';
    el.className = 'workflow-editor-empty empty-state';
    el.innerHTML = `
        <div class="empty-icon"><i data-lucide="workflow"></i></div>
        <div class="empty-title">选择或上传一个工作流</div>
        <div class="empty-desc">左侧工作流加载后会在这里显示图2那样的节点图谱和配置面板。</div>
    `;
    const graphWrap = graphCard.querySelector('.graph-svg-wrap');
    graphCard.insertBefore(el, graphWrap || null);
    return el;
}
function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function fieldKind(f){
    if(['image','video','audio'].includes(f.type)) return f.type;
    const key = `${f.input || ''} ${f.name || ''}`.toLowerCase();
    if(f.type === 'textarea' || /prompt|text|提示词|正向|负向/.test(key)) return 'prompt';
    return 'setting';
}
function isMediaField(f){ return ['image','video','audio'].includes(fieldKind(f)); }
function mediaFieldLabel(kind, count){
    const labels = currentLang() === 'en'
        ? {image:'Images', video:'Videos', audio:'Audio'}
        : {image:'图片', video:'视频', audio:'音频'};
    return `${labels[kind] || kind} ${count}`;
}
function mediaAccept(kind){
    if(kind === 'video') return 'video/*';
    if(kind === 'audio') return 'audio/*';
    return 'image/*';
}
function mediaUploadText(kind){
    if(kind === 'video') return tr('comfy.clickUploadVideo');
    if(kind === 'audio') return tr('comfy.clickUploadAudio');
    return tr('comfy.clickUploadImage');
}
function mediaUploadFailedText(kind){
    if(kind === 'video') return tr('comfy.videoUploadFailed');
    if(kind === 'audio') return tr('comfy.audioUploadFailed');
    return tr('comfy.imageUploadFailed');
}
function mediaPreviewHtml(kind, url, name='', compact=false){
    const safeUrl = escapeAttr(url || '');
    const safeName = escapeHtml(name || typeLabel(kind));
    if(!url) return mediaUploadText(kind);
    if(kind === 'video') return `<video src="${safeUrl}" muted preload="metadata" playsinline controls></video>`;
    if(kind === 'audio') return `<div class="media-file-chip"><i data-lucide="file-audio" class="${compact ? 'w-5 h-5' : 'w-6 h-6'}"></i><span class="media-file-name">${safeName}</span><audio src="${safeUrl}" controls preload="metadata"></audio></div>`;
    return `<img src="${safeUrl}">`;
}
function defaultMiniCards(){
    return {
        prompt:{ x:24, y:30 },
        image:{ x:24, y:210 },
        custom:{ x:280, y:78 },
        output:{ x:540, y:120 }
    };
}
function defaultMiniTestNodes(){
    return [
        { id:'prompt_1', type:'prompt', x:36, y:96, text:'' },
        { id:'image_1', type:'image', x:36, y:286, url:'', value:'' },
        { id:'comfy_1', type:'comfy', x:330, y:150 },
        { id:'output_1', type:'output', x:670, y:190 }
    ];
}

// —— ComfyUI 后端地址管理 ——
let comfyInstances = [];
async function loadComfyInstances(){
    try {
        const data = await fetch('/api/comfyui/instances').then(r => r.json());
        comfyInstances = Array.isArray(data.instances) ? data.instances : [];
        renderComfyInstances();
    } catch(e){ console.error(e); }
}
function renderComfyInstances(){
    const el = document.getElementById('comfyInstancesList');
    if(!el) return;
    el.innerHTML = comfyInstances.map((addr, i) => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px;border:1px solid var(--line);border-radius:9px;background:var(--soft)">
            <span style="width:18px;text-align:center;font-size:10.5px;color:var(--faint);font-weight:800">${i + 1}</span>
            <input class="small-input" type="text" value="${escapeAttr(addr)}" placeholder="host:port" oninput="updateComfyInstance(${i}, this.value)" style="flex:1;height:28px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text);font-size:12px;font-family:ui-monospace,Menlo,monospace">
            <button class="opt-del" type="button" onclick="removeComfyInstance(${i})" title="删除"><i data-lucide="x" class="w-3 h-3"></i></button>
        </div>
    `).join('');
    renderConnSummary();
    refreshIcons();
}
function addComfyInstance(){
    comfyInstances = [...comfyInstances, ''];
    renderComfyInstances();
}
function updateComfyInstance(index, value){
    comfyInstances[index] = value;
}
function removeComfyInstance(index){
    comfyInstances = comfyInstances.filter((_, i) => i !== index);
    renderComfyInstances();
}
async function saveComfyInstances(){
    const cleaned = comfyInstances.map(s => String(s||'').trim()).filter(Boolean);
    if(!cleaned.length){ alert('请至少填一个 ComfyUI 后端地址'); return; }
    setStatus('保存中...');
    try {
        const res = await fetch('/api/comfyui/instances', {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ instances: cleaned })
        });
        if(!res.ok) throw new Error((await res.json()).detail || '保存失败');
        const data = await res.json();
        comfyInstances = data.instances || cleaned;
        renderComfyInstances();
        try { new BroadcastChannel('studio-api').postMessage({ type: 'comfy-instances-changed' }); } catch(e) {}
        try { window.parent?.postMessage({ type: 'comfy-instances-changed' }, '*'); } catch(e) {}
        setStatus('ComfyUI 后端地址已保存');
    } catch(e){
        alert(e.message || '保存失败');
        setStatus('保存失败');
    }
}

// —— ComfyUI 安装目录配置 ——
async function loadComfyDir(){
    try {
        const data = await fetch('/api/comfyui/dir').then(r => r.json());
        lastDetectedDir = data.detected || '';
        const input = document.getElementById('comfyDirInput');
        const detected = document.getElementById('comfyDirDetected');
        if(input) input.value = data.dir || '';
        if(detected) {
            if(data.detected) {
                detected.innerHTML = '自动检测到：<span style="color:var(--accent);font-family:ui-monospace,Menlo,monospace">' + escapeHtml(data.detected) + '</span>';
            } else if(data.dir) {
                detected.innerHTML = '<span style="color:var(--warning)">配置的目录不存在，请检查路径</span>';
            } else {
                detected.textContent = '未检测到 ComfyUI 安装目录';
            }
        }
        renderConnSummary();
    } catch(e){ console.error(e); }
}
async function saveComfyDir(){
    const input = document.getElementById('comfyDirInput');
    const value = input ? input.value.trim() : '';
    setStatus('保存中...');
    try {
        const res = await fetch('/api/comfyui/dir', {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ dir: value })
        });
        if(!res.ok) throw new Error((await res.json()).detail || '保存失败');
        await loadComfyDir();
        try { new BroadcastChannel('studio-api').postMessage({ type: 'comfy-dir-changed' }); } catch(e) {}
        setStatus('ComfyUI 安装目录已保存');
    } catch(e){
        alert(e.message || '保存失败');
        setStatus('保存失败');
    }
}

async function loadList(){
    try {
        const data = await fetch('/api/workflows').then(r=>r.json());
        workflows = ((data.workflows && data.workflows.length) ? data.workflows : FALLBACK_WORKFLOWS).map(normalizeWorkflowItem);
        renderList();
        // 自动加载：当前没选中 或 之前选中的已不存在 → 选第一个
        const visible = visibleWorkflows();
        const stillExists = selectedName && visible.some(w => w.name === selectedName);
        if(!stillExists && visible.length){
            await selectWorkflow(visible[0].name);
        }
    } catch(e){ setStatus(tr('comfy.loadFailed')); console.error(e); }
}
// iframe 在 index.html 里通过 switchUI 显示，首次显示时可能 DOMContentLoaded 已经过去；
// 添加一个 pageshow 监听确保进入页面时一定刷新
window.addEventListener('pageshow', () => {
    if(!currentWorkflow && workflows.length === 0) loadList();
});

let workflowSearch = '';
let lastDetectedDir = '';

function onWorkflowSearch(value){
    workflowSearch = String(value || '').trim();
    const clearBtn = document.getElementById('workflowSearchClear');
    if(clearBtn) clearBtn.style.display = workflowSearch ? '' : 'none';
    renderList();
}

function updateWorkflowCount(shown, total){
    const el = document.getElementById('workflowCount');
    if(!el) return;
    el.textContent = (shown === total) ? (total + ' 个') : (shown + '/' + total + ' 个');
}

// —— 顶部连接折叠条 ——
function toggleConnBar(){
    const body = document.getElementById('connBody');
    const bar = document.getElementById('connBar');
    if(!body || !bar) return;
    const willOpen = body.style.display === 'none';
    body.style.display = willOpen ? '' : 'none';
    bar.classList.toggle('open', willOpen);
    refreshIcons();
}

function renderConnSummary(){
    const backendChip = document.getElementById('connBackendChip');
    if(backendChip){
        const list = comfyInstances.map(s => String(s || '').trim()).filter(Boolean);
        backendChip.textContent = list.length
            ? (list.length > 1 ? list[0] + ' +' + (list.length - 1) : list[0])
            : tr('comfy.noBackend');
        backendChip.classList.toggle('is-warn', !list.length);
    }
    const dirChip = document.getElementById('connDirChip');
    if(dirChip){
        const dir = (document.getElementById('comfyDirInput')?.value || '').trim();
        let text = '', warn = false;
        if(dir){
            text = dir;
            if(!lastDetectedDir){ warn = true; text += '（' + tr('comfy.notDetected') + '）'; }
        } else {
            text = lastDetectedDir ? (tr('comfy.autoDetected') + '：' + lastDetectedDir) : tr('comfy.noDir');
        }
        dirChip.textContent = text;
        dirChip.classList.toggle('is-warn', warn);
    }
}

async function loadConnRunning(){
    try {
        const data = await fetch('/api/comfyui/autostart').then(r => r.json());
        const chip = document.getElementById('connBackendChip');
        if(chip) chip.classList.toggle('is-ok', !!data.running);
    } catch(e) {}
}

function renderList(){
    const listWorkflows = visibleWorkflows();
    if(!listWorkflows.length){
        listEl.innerHTML = `<div class="preview-empty" style="padding:18px 10px">没有找到工作流，请上传 ComfyUI API 工作流。</div>`;
        updateWorkflowCount(0, 0);
        refreshIcons();
        return;
    }
    const keyword = workflowSearch.toLowerCase();
    // 重名检测：同名文件出现在多个位置（根目录 / custom）时加标记，方便区分
    const baseCount = {};
    listWorkflows.forEach(w => {
        const base = String(w.name || '').split('/').pop();
        baseCount[base] = (baseCount[base] || 0) + 1;
    });
    const filtered = listWorkflows.filter(w => {
        if(!keyword) return true;
        const hay = ((w.title || '') + ' ' + (w.name || '')).toLowerCase();
        return hay.includes(keyword);
    });
    updateWorkflowCount(filtered.length, listWorkflows.length);
    if(!filtered.length){
        listEl.innerHTML = `<div class="preview-empty" style="padding:18px 10px">${escapeHtml(tf('comfy.noSearchHit', {keyword: workflowSearch}))}</div>`;
        refreshIcons();
        return;
    }
    // 2026-10-15：分类改为以后端为准（工作流 .config.json 里手写的 category，或后端按输出节点推断），
    // 统一成 5 类：生图 / 生视频 / 生音频 / 放大 / 其他；每张卡片可直接改分类（右键同理见画布 composer）。
    const groups = WF_CATEGORY_DEFS.map(def => ({
        label: def.label,
        items: filtered.filter(w => workflowCategoryKey(w) === def.key)
    })).filter(g => g.items.length);
    listEl.innerHTML = groups.map(g => `
        <div class="workflow-group-head"><span>${escapeHtml(g.label)}</span><span class="workflow-group-count">${g.items.length}</span></div>
        ${g.items.map(w => {
            const base = String(w.name || '').split('/').pop();
            const isDup = baseCount[base] > 1;
            const inCustom = String(w.name || '').startsWith('custom/');
            const metaBits = [tf('comfy.fieldCount', {count: w.field_count})];
            if(isDup) metaBits.push(inCustom ? 'custom/' : tr('comfy.rootDir'));
            // 2026-10-15：手动分类下拉（改完即写 .config.json，跟着工作流导出/导入走）
            const catKey = workflowCategoryKey(w);
            const catSelect = `<select class="wf-cat-select" title="工作流分类" onclick="event.stopPropagation()" onchange="event.stopPropagation();setWorkflowCategory('${escapeHtml(w.name)}', this.value)">
                    ${WF_CATEGORY_DEFS.map(def => `<option value="${def.key}" ${def.key === catKey ? 'selected' : ''}>${def.label}</option>`).join('')}
                    <option value="auto">自动</option>
                </select>`;
            return `
        <div class="workflow-card ${w.name===selectedName?'active':''}" onclick="selectWorkflow('${escapeHtml(w.name)}')" title="${escapeHtml(w.name)}" style="cursor:pointer">
            <span class="workflow-icon"><i data-lucide="${w.builtin?'package':'file-json-2'}" class="w-3.5 h-3.5"></i></span>
            <span class="min-w-0" style="flex:1">
                <div class="workflow-name">${escapeHtml(w.title)}${isDup?` <i data-lucide="alert-triangle" class="w-3 h-3 wf-dup-icon" title="${escapeHtml(tr('comfy.dupWarning'))}"></i>`:''}</div>
                <div class="workflow-meta">${metaBits.map(escapeHtml).join(' · ')}</div>
            </span>
            ${catSelect}
            ${w.builtin?'':`<span class="wf-del-btn" onclick="event.stopPropagation();deleteWorkflow('${escapeHtml(w.name)}')" title="删除工作流" style="cursor:pointer;color:#666;padding:2px;border-radius:4px;flex-shrink:0"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></span>`}
        </div>`;
        }).join('')}
    `).join('');
    refreshIcons();
}

async function deleteWorkflow(name){
    if(!confirm('确定删除工作流 "' + name + '" 吗？此操作不可撤销。')) return;
    try {
        setStatus('删除中...');
        await fetch(`/api/workflows/${encodeURIComponent(name)}`, {method: 'DELETE'});
        workflows = workflows.filter(w => w.name !== name);
        if(selectedName === name){ selectedName = ''; currentWorkflow = null; currentConfig = {title:'', fields:[]}; }
        renderList();
        renderEditor();
        renderPreview();
        setStatus('已删除');
    } catch(e){ setStatus('删除失败：' + e.message); }
}
async function selectWorkflow(name){
    const loadSeq = ++comfyNativeLoadSeq;
    const stayInNative = workspaceMode === 'native';
    selectedName = name;
    setNodeListOpen(false);
    renderList();
    try {
        setStatus(tr('comfy.loading'));
        const data = await fetch(`/api/workflows/${encodeURIComponent(name)}`).then(r=>r.json());
        // 快速连续点击时，旧工作流请求可能晚于新请求返回；旧结果不得覆盖最后一次选择。
        if(loadSeq !== comfyNativeLoadSeq) return;
        currentWorkflow = data.workflow;
        currentConfig = data.config || { title:name.replace('.json',''), fields:[] };
        if(!currentConfig.fields) currentConfig.fields = [];
        if(!currentConfig.mini_cards) currentConfig.mini_cards = {};
        isBuiltin = Boolean(data.builtin) || isBuiltinWorkflowItem({name});
        miniCards = {...defaultMiniCards(), ...currentConfig.mini_cards};
        currentConfig.mini_cards = miniCards;
        // 释放上一次的图片 blob URL
        Object.values(previewImageUrls).forEach(u => { try { URL.revokeObjectURL(u); } catch(e){} });
        previewImageUrls = {};
        previewValues = {};
        currentConfig.fields.forEach(f => {
            if(f.default !== undefined && f.default !== null) previewValues[f.id] = f.default;
        });
        previewRandomActive = {};
        runResult = null;
        graphView = { k: 1, x: 0, y: 0 };
        miniView = { k: 1, x: 0, y: 0 };
        miniTestNodes = defaultMiniTestNodes();
        renderEditor();
        renderPreview();
        // 新工作流加载后自动适配窗口
        setTimeout(() => graphFit(), 50);
        // 切换工作流时保持当前面板，不再强制跳到 ComfyUI 原生页面。
        // 如果用户本来就在原生页面，则只更新其中的工作流内容。
        if(stayInNative){
            setStatus('正在 ComfyUI 中切换工作流...');
            const loaded = await comfyNativeLoadWorkflow(currentWorkflow, true, loadSeq);
            if(loadSeq !== comfyNativeLoadSeq) return;
            setStatus(loaded
                ? `已在 ComfyUI 中打开：${currentConfig.title || selectedName}`
                : 'ComfyUI 工作流载入失败，请检查节点类型或后端连接');
        }else{
            setStatus(`已加载工作流：${currentConfig.title || selectedName}`);
        }
    } catch(e){ setStatus(tr('comfy.openFailed')); console.error(e); }
}

function fieldFor(node, input){
    return currentConfig.fields.find(f => f.node === node && f.input === input);
}
// 2026-09-27 参数暴露开关：enabled === false 表示自动生成但用户未启用的参数，
// 不算"已暴露"，画布与预览面板都不显示。
function fieldExposed(f){
    return !!f && f.enabled !== false;
}
function makeFieldId(){ return 'f_' + Math.random().toString(36).slice(2,9); }

function toggleField(node, input){
    const existing = fieldFor(node, input);
    if(existing && existing.enabled === false){
        // 自动生成但未启用的字段：第一次点击 = 启用它（保留类型/默认值等自动探测结果）
        existing.enabled = true;
        if(existing.default !== undefined && existing.default !== null) previewValues[existing.id] = existing.default;
    } else if(existing){
        currentConfig.fields = currentConfig.fields.filter(f => f !== existing);
        delete previewValues[existing.id];
        delete previewRandomActive[existing.id];
    } else {
        const nodeData = currentWorkflow[node];
        const rawValue = nodeData?.inputs?.[input];
        const type = guessType(rawValue, input);
        const f = {
            id: makeFieldId(),
            node, input,
            name: inputLabel(input),
            type,
            default: typeof rawValue === 'object' ? null : rawValue,
            options: [],
        };
        if(type === 'slider' || type === 'number') {
            if(typeof rawValue === 'number'){
                f.min = 0;
                f.max = Math.max(rawValue * 2, 10);
                f.step = rawValue > 0 && rawValue < 5 ? 0.1 : 1;
            }
            if(type === 'number') f.random_enabled = false;
        }
        currentConfig.fields.push(f);
        if(f.default !== undefined && f.default !== null) previewValues[f.id] = f.default;
    }
    renderEditor();
    renderPreview();
    // 浮窗打开时同步刷新浮窗内容
    if(popupNodeId === node) refreshPopupBody();
}

function refreshPopupBody(){
    if(!popupNodeId) return;
    const node = currentWorkflow[popupNodeId];
    if(!node) return;
    const popup = document.getElementById('nodePopup');
    const body = popup.querySelector('.popup-body');
    if(!body) return;
    const inputs = Object.entries(node.inputs || {}).filter(([k,v]) => {
        return !(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number');
    });
    body.innerHTML = inputs.length === 0
        ? `<div class="popup-empty">${tr('comfy.noConfigFields')}</div>`
        : inputs.map(([key, value]) => renderInputRow(popupNodeId, key, value)).join('');
    refreshIcons();
}

function guessType(value, inputName){
    const lc = (inputName||'').toLowerCase();
    if(typeof value === 'boolean') return 'boolean';
    if(typeof value === 'number'){
        if(/strength|cfg|denoise/.test(lc)) return 'slider';
        return 'number';
    }
    if(typeof value === 'string'){
        if(/prompt|text|description/.test(lc) || (value && value.length > 60)) return 'textarea';
        if(/video|movie|mp4|webm|mov|m4v|vhs/.test(lc) || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/i.test(value)) return 'video';
        if(/audio|sound|music|voice|wav|mp3/.test(lc) || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(value)) return 'audio';
        if(/image|img|mask|filename|file/.test(lc) || /\.(png|jpe?g|webp|gif|bmp|tiff?)(\?|$)/i.test(value)) return 'image';
        return 'text';
    }
    return 'text';
}

function updateField(fieldId, key, value){
    const f = currentConfig.fields.find(x => x.id === fieldId);
    if(!f) return;
    f[key] = value;
    if(key === 'type'){
        previewValues[fieldId] = (value === 'boolean') ? false : (value === 'number' || value === 'slider' ? 0 : '');
        f.random_enabled = value === 'number' ? !!f.random_enabled : false;
        delete previewRandomActive[fieldId];
    }
    if(key === 'random_enabled'){
        delete previewRandomActive[fieldId];
    }
    // 文本/数字输入过程中不能重建浮窗，否则输入框会失焦，表现成每次只能输入 1 个字。
    // 这些字段只影响预览或运行参数，直接同步数据即可；切换 type 才需要重建表单结构。
    if(key === 'name' || key === 'min' || key === 'max' || key === 'step' || key === 'default' || key === 'options' || key === 'random_enabled'){
        renderPreview();
        if(workspaceMode === 'canvas') renderMiniCanvasPreview(miniCanvasHost, true);
        return;
    }
    renderEditor();
    renderPreview();
    if(popupNodeId === f.node) refreshPopupBody();
}

function updateWorkflowTitle(value){
    if(!currentConfig) return;
    currentConfig.title = value;
    const item = workflows.find(w => w.name === selectedName);
    if(item) item.title = value || selectedName.replace('.json','');
    renderList();
}

function refreshSaveButtonLabel(){
    if(!saveBtn) return;
    const span = saveBtn.querySelector('span');
    if(!span) return;
    span.textContent = workspaceMode === 'native' ? '保存到工作流' : tr('comfy.saveConfig');
    saveBtn.title = workspaceMode === 'native'
        ? '保存当前 ComfyUI 画布，并写回左侧选中的工作流'
        : '';
}

function setWorkspaceMode(mode){
    const previousMode = workspaceMode;
    workspaceMode = mode === 'canvas' ? 'canvas' : mode === 'native' ? 'native' : 'graph';
    document.getElementById('workspaceGraphTab')?.classList.toggle('active', workspaceMode === 'graph');
    document.getElementById('workspaceCanvasTab')?.classList.toggle('active', workspaceMode === 'canvas');
    document.getElementById('workspaceNativeTab')?.classList.toggle('active', workspaceMode === 'native');
    renderWorkspaceView();
    // 只有用户主动进入 ComfyUI 原生页面时才加载当前工作流。
    if(workspaceMode === 'native' && previousMode !== 'native' && currentWorkflow){
        const loadSeq = ++comfyNativeLoadSeq;
        setStatus('正在 ComfyUI 中打开工作流...');
        comfyNativeLoadWorkflow(currentWorkflow, true, loadSeq).then(loaded => {
            if(loadSeq !== comfyNativeLoadSeq) return;
            setStatus(loaded
                ? `已在 ComfyUI 中打开：${currentConfig.title || selectedName}`
                : 'ComfyUI 工作流载入失败，请检查节点类型或后端连接');
        }).catch(e => {
            if(loadSeq !== comfyNativeLoadSeq) return;
            setStatus('ComfyUI 工作流载入失败：' + (e?.message || e));
        });
    }
}

// —— ComfyUI 原生页面实时视图（iframe 走后端同源代理 /comfyui-live/，直显 ComfyUI 端口实况）——
function renderComfyNative(){
    const host = document.getElementById('comfyNativeHost');
    if(!host) return;
    host.style.display = 'flex';
    const frame = document.getElementById('comfyNativeFrame');
    const hint = document.getElementById('comfyNativeHint');
    if(!comfyInstances.some(s => String(s||'').trim())){
        if(frame) frame.style.display = 'none';
        if(hint) hint.style.display = 'flex';
        return;
    }
    if(hint) hint.style.display = 'none';
    if(frame){
        frame.style.display = 'block';
        const target = '/comfyui-live/';
        // 已加载过就保留当前会话（实时画面不重载），仅首次挂载时设置 src
        if(frame.dataset.loadedBase !== target){
            frame.dataset.loadedBase = target;
            frame.src = target;
        }
        // 界面整体等比缩放（等效浏览器缩小）：不动 ComfyUI 画布自身缩放，避免文字乱
        comfyNativeApplyZoom();
        (function zLoop(n){
            comfyNativeApplyZoom();
            if(n < 30) setTimeout(() => zLoop(n + 1), 400);
        })(0);
        // 2026-09-28（用户要求）：切到原生页面后，把整个工作流按包围盒等比缩放居中到框里
        // （等效 ComfyUI 的 Fit view，参考工作流图视图的适配效果）。
        // 就绪即适配一次；提示词溢出修复会增大节点尺寸，3 秒后再收尾适配一次。
        comfyNativeWhenReady(win => {
            comfyNativeFitView(win);
            setTimeout(() => {
                try{
                    const frame = document.getElementById('comfyNativeFrame');
                    const w2 = frame && frame.style.display !== 'none' ? frame.contentWindow : null;
                    if(w2 && w2.app && w2.app.canvas && w2.app.graph && (w2.app.graph._nodes || []).length){
                        comfyNativeFitView(w2);
                    }
                }catch(e){}
            }, 3000);
        });
        // 就绪后只刷新画布，不再周期性重复测量并增高节点。
        // 旧逻辑会把已经增高后的 DOM 控件再次当成内容高度，导致节点每隔几秒继续拉长。
        if(!window.__comfyNativeFixTimer){
            window.__comfyNativeFixTimer = setInterval(() => {
                try{
                    if(workspaceMode !== 'native') return;
                    const frame = document.getElementById('comfyNativeFrame');
                    if(!frame) return;
                    const win = frame.contentWindow;
                    if(win && win.app && win.app.canvas){
                        // 无条件强制重绘：ComfyUI 新前端的 DOM widget 盒子由画布每帧回调同步，
                        // 画布静止后位置可能残留陈旧值（提示词飘到节点外），重绘即归位；
                        // 同时清理 bgcanvas，避免手动缩放到 100% 后旧背景层留下白/灰色块。
                        comfyNativeRefreshCanvas(win);
                    }
                }catch(e){}
            }, 2000);
        }
    }
}

// 界面整体等比缩放：以 1080 宽的 ComfyUI 窗口为参考布局，把整个界面按容器宽度等比缩入。
// 做法：给 iframe 内 body 设 CSS zoom（等效浏览器缩小，布局视口随之变宽、更多内容可见），
// ComfyUI 画布的 ds.scale 保持原样（如 92%），文字按原比例渲染不产生乱码；缩放后派发 resize
// 让 ComfyUI 把画布重排到新视口。
function comfyNativeApplyZoom(){
    const host = document.getElementById('comfyNativeHost');
    const frame = document.getElementById('comfyNativeFrame');
    if(!host || !frame || frame.style.display === 'none') return;
    try{
        const doc = frame.contentDocument, win = frame.contentWindow;
        if(doc && doc.body && win && /comfyui-live/.test(String(win.location.href))){
            // 不再对 iframe 使用 CSS zoom。ComfyUI 的多行文本、菜单等 DOM widget
            // 依赖画布坐标定位，html/body zoom 会导致控件与节点错位，表现为文字飘出节点和黑块残影。
            const root = doc.documentElement;
            const beforeRootZoom = root ? win.getComputedStyle(root).zoom : '';
            const beforeBodyZoom = win.getComputedStyle(doc.body).zoom;
            if(root){
                root.style.setProperty('zoom', '1', 'important');
                delete root.dataset.zoomApplied;
            }
            doc.body.style.setProperty('zoom', '1', 'important');
            delete doc.body.dataset.zoomApplied;
            if(beforeRootZoom !== '1' || beforeBodyZoom !== '1'){
                try{ win.dispatchEvent(new Event('resize')); }catch(e){}
            }
        }
    }catch(e){}
}
if(!window.__comfyNativeZoomResize){
    window.__comfyNativeZoomResize = true;
    let __nativeFitTimer = 0;
    window.addEventListener('resize', () => {
        comfyNativeApplyZoom();
        // 窗口尺寸变化后把工作流重新等比缩放居中到框里（防抖 400ms，只在原生页面模式执行）
        clearTimeout(__nativeFitTimer);
        __nativeFitTimer = setTimeout(() => {
            try{
                if(workspaceMode !== 'native') return;
                const frame = document.getElementById('comfyNativeFrame');
                const win = frame && frame.style.display !== 'none' ? frame.contentWindow : null;
                if(win && win.app && win.app.canvas && win.app.graph && (win.app.graph._nodes || []).length){
                    comfyNativeFitView(win);
                }
            }catch(e){}
        }, 400);
    });
}

// 等待原生画面里的 ComfyUI app 就绪（同源 iframe，可直接访问 contentWindow.app）
function comfyNativeWhenReady(cb, timeoutMs = 20000){
    const frame = document.getElementById('comfyNativeFrame');
    if(!frame) return;
    const t0 = Date.now();
    const timer = setInterval(() => {
        let win = null;
        try{
            win = frame.contentWindow;
            if(!(win && win.app && win.app.canvas && win.app.graph && win.app.graph._nodes && win.app.graph._nodes.length)) win = null;
        }catch(e){ win = null; }
        if(win){ clearInterval(timer); cb(win); }
        else if(Date.now() - t0 > timeoutMs){ clearInterval(timer); }
    }, 400);
}

// 首次打开 ComfyUI 时画布可能还是空的，不能复用 comfyNativeWhenReady：
// 它为了自动适配视图会等待至少一个节点，而加载工作流前本来就没有节点。
function comfyNativeWaitAppReady(timeoutMs = 20000){
    return new Promise(resolve => {
        const start = Date.now();
        const tick = () => {
            const frame = document.getElementById('comfyNativeFrame');
            let win = null;
            try { win = frame && frame.style.display !== 'none' ? frame.contentWindow : null; } catch(e){}
            if(win && win.app && win.app.canvas && win.app.graph && typeof win.app.loadGraphData === 'function'){
                resolve({app:win.app, win});
                return;
            }
            if(Date.now() - start > timeoutMs){
                resolve(null);
                return;
            }
            setTimeout(tick, 400);
        };
        tick();
    });
}

// 修复提示词文字跑到节点外面：ComfyUI 新前端的多行文本是 DOM widget（不受画布裁剪），
// 节点高度被历史会话存小后文本域会溢出节点。
// 高度全部按图坐标系计算，两种信号取最大：
//   ① 布局引擎已算好的 widget 图坐标高度（w.computedHeight / w.computeSize），天然免疫缩放；
//   ② DOM 文本域实测像素高度。注意 getBoundingClientRect = 图高度 × ds.scale。
// 只增不减，不动画布缩放。
function comfyNativeFixTextOverflow(win){
    try{
        const app = win.app, g = app.graph;
        if(!g || !g._nodes || !g._nodes.length) return 0;
        const scale = (app.canvas.ds && app.canvas.ds.scale) || 1;
        let fixed = 0;
        g._nodes.forEach(n => {
            try{
                if(n.flags && n.flags.collapsed) return;
                // ① 通用：按图坐标把节点长回到文本域内。
                // 关键：每个节点只建立一次高度基准。
                // computedHeight / DOM 高度会随着节点自身变高而同步变大，
                // 每次轮询重新读取会形成“越修越高”的正反馈。
                let needH = Number(n.__dhTextFixTargetHeight);
                if(!Number.isFinite(needH) || needH <= 0){
                    needH = 0;
                    (n.widgets || []).forEach(w => {
                        const y = (typeof w.y === 'number' && w.y > 0 ? w.y : (w.last_y || 0));
                        let hG = 0;
                        if(typeof w.computedHeight === 'number' && w.computedHeight > 0){
                            hG = w.computedHeight;
                        }else if(typeof w.computeSize === 'function'){
                            try{ const s = w.computeSize(n.size ? n.size[0] : 0); if(s && s[1] > 0) hG = s[1] + 4; }catch(e){}
                        }
                        const el = w.inputEl || w.element;
                        if(el && el.getBoundingClientRect){
                            try{
                                const r = el.getBoundingClientRect();
                                if(r.height > 1) hG = Math.max(hG, r.height / scale);
                            }catch(e){}
                        }
                        if(hG > 0) needH = Math.max(needH, y + hG);
                    });
                    needH += 6; // 底部留白
                    // 只在首次测量时写入，后续刷新固定使用这个值。
                    n.__dhTextFixTargetHeight = Math.ceil(Math.max(n.size?.[1] || 0, needH));
                    needH = n.__dhTextFixTargetHeight;
                }
                if(needH > 0 && n.size && n.size[1] < needH - 2){
                    const nh = Math.ceil(needH);
                    if(typeof n.setSize === 'function') n.setSize([n.size[0], nh]);
                    else n.size[1] = nh;
                    fixed++;
                }
                // ② 注释/便签类节点：按文本内容估算高度
                const t = String(n.type || '').toLowerCase();
                if(t.includes('note')){
                    let text = '';
                    (n.widgets_values || []).forEach(v => { if(typeof v === 'string' && v.length > text.length) text = v; });
                    if(text){
                        const w0 = Math.max((n.size && n.size[0]) || 0, 320);
                        const perLine = Math.max(12, Math.floor((w0 - 26) / 6.8));
                        let lines = 0;
                        text.split('\n').forEach(l => { lines += Math.max(1, Math.ceil(l.length / perLine)); });
                        const needN = lines * 17 + 64;
                        if(((n.size && n.size[1]) || 0) < needN){
                            const nh = Math.ceil(needN);
                            if(typeof n.setSize === 'function') n.setSize([w0, nh]);
                            else { n.size[0] = w0; n.size[1] = nh; }
                            fixed++;
                        }
                    }
                }
            }catch(e){}
        });
        if(fixed){
            try{ app.canvas.setDirty(true, true); }catch(e){}
        } else {
            try{ app.canvas.setDirty(true, true); }catch(e){}
        }
        return fixed;
    }catch(e){ return 0; }
}

// 整图适配视口：按全部节点包围盒等比缩放并居中（等效 ComfyUI 打开工作流的 Fit view），
// 解决原生画面边缘节点被 iframe 裁掉的问题
function comfyNativeFitView(win){
    try{
        const cv = win.app.canvas, g = win.app.graph;
        const nodes = (g && g._nodes) || [];
        if(!nodes.length) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            const x = n.pos ? n.pos[0] : 0, y = n.pos ? n.pos[1] : 0;
            const w = Math.max(n.size ? n.size[0] : 220, 40);
            const h = Math.max(n.size ? n.size[1] : 100, 40);
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        });
        if(!isFinite(minX) || !isFinite(minY)) return;
        const el = cv.canvas;
        const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        // 用 CSS 可视尺寸，不用 canvas.width/height 的后备像素尺寸。
        // 高 DPI 下后备像素会比实际界面大，导致 Fit view 误判空间足够，右侧节点被裁掉。
        const cw = el ? ((rect && rect.width) || el.clientWidth || el.width) : 0;
        const ch = el ? ((rect && rect.height) || el.clientHeight || el.height) : 0;
        if(!cw || !ch) return;
        const bw = maxX - minX, bh = maxY - minY;
        const fit = Math.min((cw - 90) / bw, (ch - 100) / bh);
        const scale = Math.max(0.68, Math.min(fit, 0.82));
        cv.ds.scale = scale;
        cv.ds.offset = [
            (cw - bw * scale) / 2 - minX * scale,
            (ch - bh * scale) / 2 - minY * scale
        ];
        cv.setDirty(true, true);
    }catch(e){}
}

function comfyNativeRefreshCanvas(win){
    try{
        win.dispatchEvent(new Event('resize'));
        const cv = win.app?.canvas;
        if(cv){
            comfyNativeInstallCleanBackground(win);
            try{
                cv.clear_background = true;
                cv.clear_background_color = '#141414';
                cv.dirty_bgcanvas = true;
                cv.dirty_canvas = true;
                const clearCtx = (ctx, canvas) => {
                    if(!ctx || !canvas) return;
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
                    ctx.fillStyle = '#141414';
                    ctx.fillRect(0, 0, canvas.width || 0, canvas.height || 0);
                    ctx.restore();
                };
                if(cv.bgctx && cv.bgcanvas){
                    clearCtx(cv.bgctx, cv.bgcanvas);
                }
                const ctx = cv.ctx || (cv.canvas && cv.canvas.getContext ? cv.canvas.getContext('2d') : null);
                if(ctx && cv.canvas){
                    clearCtx(ctx, cv.canvas);
                }
            }catch(e2){}
        }
        if(cv?.setDirty) cv.setDirty(true, true);
        if(typeof cv?.draw === 'function') requestAnimationFrame(() => {
            try{ cv.draw(true, true); }catch(e){}
        });
    }catch(e){}
}

function comfyNativeInstallCleanBackground(win){
    try{
        const cv = win?.app?.canvas;
        if(!cv || cv.__dhNativeCleanBackgroundInstalled) return;
        cv.__dhNativeCleanBackgroundInstalled = true;
        cv.__dhNativeOriginalOnRenderBackground = cv.onRenderBackground;
        cv.__dhNativeOriginalOnDrawBackground = cv.onDrawBackground;
        cv.background_image = '';
        cv._bg_img = null;
        cv.onDrawBackground = function(){};
        cv.onRenderBackground = function(cvs, ctx){
            try{
                const canvas = this.canvas || cvs;
                const width = canvas?.width || 0;
                const height = canvas?.height || 0;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = '#141414';
                ctx.fillRect(0, 0, width, height);
                ctx.strokeStyle = 'rgba(255,255,255,0.035)';
                ctx.lineWidth = 1;
                const step = 24;
                for(let x = 0; x < width; x += step){
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }
                for(let y = 0; y < height; y += step){
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }
                ctx.restore();
                return true;
            }catch(e){
                return false;
            }
        };
    }catch(e){}
}

function comfyNativeCleanWorkflowTabs(win){
    try{
        const doc = win?.document;
        if(!doc || !doc.head) return;
        if(!doc.getElementById('dh-comfy-native-clean-style')){
            const style = doc.createElement('style');
            style.id = 'dh-comfy-native-clean-style';
            style.textContent = `
                .workflow-tabs-container,
                .workflow-tabs-container * {
                    white-space: nowrap !important;
                }
                .workflow-tabs-container {
                    max-height: 34px !important;
                    overflow: hidden !important;
                    contain: paint !important;
                }
                .workflow-tabs-container [role="tab"],
                .workflow-tabs-container .workflow-tab,
                .workflow-tabs-container .tab,
                .workflow-tabs-container button {
                    max-width: 158px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                }
            `;
            doc.head.appendChild(style);
        }
        const container = doc.querySelector('.workflow-tabs-container');
        if(!container) return;
        const candidates = [...container.querySelectorAll('[role="tab"], .workflow-tab, .tab, button')]
            .filter(el => {
                const txt = String(el.textContent || '').trim();
                const rect = el.getBoundingClientRect();
                return txt && rect.width > 12 && rect.height > 10;
            });
        if(candidates.length <= 1) return;
        const active = candidates.find(el => /\b(active|selected|current)\b/i.test(el.className || '') || el.getAttribute('aria-selected') === 'true') || candidates[candidates.length - 1];
        candidates.forEach(el => {
            if(el === active){
                el.style.display = '';
                el.style.maxWidth = '168px';
                el.style.overflow = 'hidden';
                el.style.textOverflow = 'ellipsis';
            }else{
                el.style.display = 'none';
            }
        });
    }catch(e){}
}

function comfyNativeToneDownGroups(win){
    try{
        const g = win?.app?.graph;
        const groups = (g && (g._groups || g.groups)) || [];
        if(!groups || !groups.length) return;
        groups.forEach(gr => {
            try{
                gr.color = '#4b5563';
                gr.bgcolor = 'rgba(24, 26, 30, 0.34)';
                gr.font_color = '#9ca3af';
            }catch(e){}
        });
    }catch(e){}
}

function comfyNativeStableLayoutPass(win){
    try{
        if(!win?.app?.graph?._nodes?.length) return;
        comfyNativeCleanWorkflowTabs(win);
        comfyNativeToneDownGroups(win);
        const g = win.app.graph;
        // 文本 DOM 控件会在绘制后才得到真实高度：先修高、排版，再修一次并重排，
        // 否则长文本节点会在同一列里压住下面的节点。
        comfyNativeFixTextOverflow(win);
        comfyDebugArrangeNodes(g);
        comfyNativeFixTextOverflow(win);
        comfyDebugArrangeNodes(g);
        comfyNativeFitView(win);
        comfyNativeRefreshCanvas(win);
    }catch(e){}
}

function comfyNativeCleanAndArrange(win){
    if(!win?.app?.graph?._nodes?.length) return;
    try{ comfyNativeCleanWorkflowTabs(win); }catch(e){}
    try{ comfyNativeToneDownGroups(win); }catch(e){}
    try{ comfyDebugArrangeAndFit(win); }catch(e){ comfyNativeFitView(win); }
    [80, 220, 520, 950, 1600, 2600].forEach(delay => {
        setTimeout(() => {
            comfyNativeStableLayoutPass(win);
        }, delay);
    });
}

// 把当前选中的 API 工作流直接载入 ComfyUI 原生画布。
// ComfyUI 的 loadGraphData 需要 LiteGraph 格式，因此先在 iframe 内完成转换。
async function comfyNativeLoadWorkflow(workflowJson, silent=false, loadSeq=null){
    if(!workflowJson || !Object.keys(workflowJson).length) return false;
    const ready = await comfyNativeWaitAppReady();
    if(!ready) {
        if(!silent) setStatus('ComfyUI 界面未就绪，无法加载工作流');
        return false;
    }
    if(loadSeq !== null && loadSeq !== comfyNativeLoadSeq) return false;
    const {app, win} = ready;
    try {
        const graphData = comfyApiToGraphInFrame(win, workflowJson);
        if(!graphData || !Array.isArray(graphData.nodes) || !graphData.nodes.length){
            throw new Error('工作流转换后没有节点');
        }
        const expectedCount = graphData.nodes.length;
        // 只加载一次：反复 loadGraphData 会让 ComfyUI 顶部堆出多个 Unsaved Workflow 标签，
        // 也更容易留下上一帧残影。加载后只等待节点就绪并整理视图。
        await app.loadGraphData(JSON.parse(JSON.stringify(graphData)));
        for(let attempt = 0; attempt < 20; attempt++){
            if(loadSeq !== null && loadSeq !== comfyNativeLoadSeq) return false;
            await new Promise(resolve => setTimeout(resolve, 250));
            const loadedCount = win.app?.graph?._nodes?.length || 0;
            if(!loadedCount) continue;
            try {
                const frame = document.getElementById('comfyNativeFrame');
                if(frame) frame.dataset.workflowName = selectedName || '';
            } catch(e){}
            comfyNativeCleanAndArrange(win);
            if(!silent){
                setStatus(`已在 ComfyUI 中打开：${selectedName}（${loadedCount}/${expectedCount} 个节点）`);
            }
            return true;
        }
        if(!silent) setStatus('工作流已发送，但 ComfyUI 画布为空');
        return false;
    }catch(e){
        console.error('ComfyUI 工作流加载失败', e);
        if(!silent) setStatus('加载到 ComfyUI 画布失败：' + (e?.message || e));
        return false;
    }
}

// —— ComfyUI 原生界面调试（走后端同源代理 /comfyui-live/，绕过 ComfyUI 的 Origin 403 限制）——
function comfyDebugBaseUrl(){
    return '/comfyui-live/';
}
function comfyDebugTargetAddr(){
    return String(comfyInstances.find(s => String(s||'').trim()) || '').trim() || '未配置';
}
function renderComfyDebug(){
    const host = document.getElementById('comfyDebugHost');
    if(!host) return;
    host.style.display = 'flex';
    const frame = document.getElementById('comfyDebugFrame');
    const hint = document.getElementById('comfyDebugHint');
    if(!comfyInstances.some(s => String(s||'').trim())){
        if(frame) frame.style.display = 'none';
        if(hint) hint.style.display = 'flex';
        updateComfyDebugStatus();
        return;
    }
    if(hint) hint.style.display = 'none';
    if(frame){
        frame.style.display = 'block';
        const target = comfyDebugBaseUrl();
        if(frame.dataset.loadedBase !== target){
            frame.dataset.loadedBase = target;
            frame.src = target;
        }
    }
    updateComfyDebugStatus();
}
async function updateComfyDebugStatus(){
    const dot = document.getElementById('comfyDebugDot');
    const addrEl = document.getElementById('comfyDebugAddr');
    if(addrEl) addrEl.textContent = comfyDebugTargetAddr();
    if(!dot) return;
    dot.className = 'comfy-debug-dot';
    if(!comfyInstances.some(s => String(s||'').trim())) return;
    try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(comfyDebugBaseUrl() + 'system_stats', { signal: ctl.signal });
        clearTimeout(timer);
        dot.className = 'comfy-debug-dot ' + (r.ok ? 'ok' : 'bad');
    } catch(e){ dot.className = 'comfy-debug-dot bad'; }
}
function comfyDebugReload(){
    const frame = document.getElementById('comfyDebugFrame');
    if(frame && frame.style.display !== 'none'){
        try { frame.contentWindow.location.reload(); }
        catch(e){ frame.src = comfyDebugBaseUrl(); }
    }
    updateComfyDebugStatus();
}
function comfyDebugOpenNew(){
    window.open(comfyDebugBaseUrl(), '_blank');
}
function comfyDebugBack(){
    // 如果是从 ComfyUI 全屏新窗口返回，关闭当前标签页
    // 如果是内嵌调试视图，切回工作流图视图
    if (window.history.length > 1) {
        window.history.back();
    } else {
        setWorkspaceMode('graph');
    }
}
// 一键整理 ComfyUI 视图：修正节点尺寸 + 原比例居中（修复历史错位会话）
function comfyDebugTidy(){
    const frame = document.getElementById('comfyDebugFrame');
    let win = null;
    try { win = frame && frame.style.display !== 'none' ? frame.contentWindow : null; } catch(e){ win = null; }
    if(!win || !win.app || !win.app.graph || !(win.app.graph._nodes || []).length){
        setStatus('ComfyUI 界面未就绪，请先打开 ComfyUI 调试并等待加载完成');
        return;
    }
    comfyDebugArrangeAndFit(win);
    setStatus('已整理 ComfyUI 视图：节点尺寸已修正，原比例居中显示');
}

// ComfyUI 调试面板全屏/还原
function comfyDebugFullscreen(){
    const host = document.getElementById('comfyDebugHost');
    if(!host) return;
    const on = !document.body.classList.contains('comfy-debug-fs');
    document.body.classList.toggle('comfy-debug-fs', on);
    host.classList.toggle('is-fullscreen', on);
    try { if(window.lucide) lucide.createIcons(); } catch(e){}
}

// ComfyUI 原生页面全屏：优先使用浏览器真实全屏，失败时使用页面内兜底全屏。
async function comfyNativeFullscreen(){
    const host = document.getElementById('comfyNativeHost');
    if(!host) return;
    const entering = document.fullscreenElement !== host && !host.classList.contains('is-fullscreen');
    try{
        if(entering){
            if(typeof host.requestFullscreen === 'function'){
                await host.requestFullscreen({ navigationUI:'hide' });
            }
        }else if(document.fullscreenElement && typeof document.exitFullscreen === 'function'){
            await document.exitFullscreen();
        }
    }catch(e){
        // 浏览器拒绝全屏时仍保留当前页面内铺满窗口的兜底行为。
    }
    const on = entering;
    document.body.classList.toggle('comfy-native-fs', on);
    host.classList.toggle('is-fullscreen', on);
    try{
        const label = host.querySelector('.comfy-native-fs-btn span');
        if(label) label.textContent = on ? '退出全屏' : '全屏';
        const frame = document.getElementById('comfyNativeFrame');
        frame?.contentWindow?.dispatchEvent(new Event('resize'));
        if(window.lucide) lucide.createIcons();
    }catch(e){}
}

document.addEventListener('fullscreenchange', () => {
    const host = document.getElementById('comfyNativeHost');
    if(!host) return;
    const on = document.fullscreenElement === host;
    document.body.classList.toggle('comfy-native-fs', on);
    host.classList.toggle('is-fullscreen', on);
    try{
        host.querySelector('.comfy-native-fs-btn span').textContent = on ? '退出全屏' : '全屏';
        if(window.lucide) lucide.createIcons();
    }catch(e){}
});
document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && document.body.classList.contains('comfy-debug-fs')) comfyDebugFullscreen();
    if(e.key === 'Escape' && document.body.classList.contains('comfy-native-fs')){
        if(document.fullscreenElement && document.exitFullscreen){
            document.exitFullscreen().catch(() => {});
        }else{
            const host = document.getElementById('comfyNativeHost');
            document.body.classList.remove('comfy-native-fs');
            host?.classList.remove('is-fullscreen');
            const label = host?.querySelector('.comfy-native-fs-btn span');
            if(label) label.textContent = '全屏';
        }
    }
});

// —— 把选中的工作流加载进内嵌 ComfyUI 画布 ——
function comfyDebugWaitAppReady(timeoutMs = 20000){
    return new Promise(resolve => {
        const start = Date.now();
        const tick = () => {
            const frame = document.getElementById('comfyDebugFrame');
            let win = null;
            try { win = frame && frame.style.display !== 'none' ? frame.contentWindow : null; } catch(e){}
            if(win && win.app && typeof win.app.loadGraphData === 'function'){
                let graphReady = false;
                try { graphReady = !!win.app.graph; } catch(e){ graphReady = false; } // graph 初始化前访问会抛错
                if(graphReady){ resolve(win.app); return; }
            }
            if(Date.now() - start > timeoutMs){ resolve(null); return; }
            setTimeout(tick, 500);
        };
        tick();
    });
}

// 在 ComfyUI iframe 内把应用的 API 格式工作流转换为 litegraph 前端格式
// （HANS 魔改前端的 loadApiJson 静默失败，故自行转换；需要用到 iframe 里的 LiteGraph 与节点定义）
function comfyApiToGraphInFrame(win, apiWf){
    const L = win.LiteGraph;
    if(!L) return null;
    const graph = { last_node_id: 0, last_link_id: 0, nodes: [], links: [], groups: [], config: {}, extra: {}, version: 0.4 };
    const created = {};
    const ids = Object.keys(apiWf).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    const isLinkVal = v => Array.isArray(v) && v.length === 2 && typeof v[0] !== 'object';
    const feihouH3LoraStackValues = inputs => {
        return Object.entries(inputs || {})
            .filter(([key, value]) => /^lora_\d+$/.test(key) && value && typeof value === 'object' && !Array.isArray(value))
            .sort(([a], [b]) => (parseInt(a.slice(5), 10) || 0) - (parseInt(b.slice(5), 10) || 0))
            .map(([, value]) => ({
                on: value.on !== false,
                lora: value.lora && value.lora !== 'None' ? String(value.lora) : null,
                strength: Number.isFinite(Number(value.strength)) ? Number(value.strength) : 1
            }))
            .filter(value => value.lora);
    };
    let col = 0, row = 0;
    for(const id of ids){
        const n = apiWf[id];
        const nid = parseInt(id, 10) || (graph.last_node_id + 1);
        graph.last_node_id = Math.max(graph.last_node_id, nid);
        let inst = null;
        try { inst = L.createNode(n.class_type); } catch(e){ inst = null; }
        let node;
        if(inst){
            node = {
                id: nid, type: n.class_type,
                pos: [col * 320, row * 220],
                size: inst.size ? [inst.size[0], inst.size[1]] : [210, 100],
                flags: {}, order: 0, mode: 0,
                inputs: (inst.inputs || []).map(i => ({ name: i.name, type: i.type, link: null })),
                outputs: (inst.outputs || []).map(o => ({ name: o.name, type: o.type, links: [], slot_index: o.slot_index ?? 0 })),
                properties: { "Node name for S&R": n.class_type },
                widgets_values: []
            };
            // widgets_values 必须与 inst.widgets 一一对应（loadGraphData 按位置应用）。
            // 以节点默认值为基底，再把 API 里的值按「名字」覆盖到对应位置——
            // 绝不能跳过没有 API 值的 widget（如 control_after_generate、按钮），
            // 否则数组错位一格，后面所有参数全部串位（历史上导致 KSampler cfg/sampler 全错、运行报 3 个校验错误）。
            const wlist = inst.widgets || [];
            let vals = wlist.map(w => {
                try { return (w.value !== undefined && w.value !== null) ? JSON.parse(JSON.stringify(w.value)) : null; }
                catch(e){ return null; }
            });
            for(const [k, v] of Object.entries(n.inputs || {})){
                if(isLinkVal(v)) continue;
                const wi = wlist.findIndex(w => w.name === k);
                if(wi !== -1) vals[wi] = v;
            }
            if(n.class_type === 'FeiHouEasyH3LoraStack'){
                const loraVals = feihouH3LoraStackValues(n.inputs);
                if(loraVals.length) vals = loraVals;
            }
            node.widgets_values = vals;
        } else {
            // 缺失节点类型 → 占位节点（与 ComfyUI 拖入缺失节点工作流的行为一致）
            node = {
                id: nid, type: n.class_type,
                pos: [col * 320, row * 220], size: [220, 120],
                flags: {}, order: 0, mode: 0,
                inputs: [], outputs: [],
                properties: { "Node name for S&R": n.class_type },
                widgets_values: []
            };
            const vals = [];
            for(const v of Object.values(n.inputs || {})){
                if(!(Array.isArray(v) && v.length === 2 && typeof v[0] !== 'object')) vals.push(v);
            }
            node.widgets_values = vals;
        }
        created[id] = node;
        graph.nodes.push(node);
        row++; if(row > 8){ row = 0; col++; }
    }
    // 连线：API 里 [节点id, 输出槽] → litegraph link
    for(const id of ids){
        const node = created[id];
        for(const [iname, val] of Object.entries(apiWf[id].inputs || {})){
            if(Array.isArray(val) && val.length === 2 && typeof val[0] !== 'object'){
                const srcId = String(val[0]), srcSlot = val[1];
                const src = created[srcId];
                if(!src) continue;
                let tIdx = (node.inputs || []).findIndex(i => i.name === iname);
                if(tIdx === -1){ node.inputs.push({ name: iname, type: '*', link: null }); tIdx = node.inputs.length - 1; }
                graph.last_link_id++;
                const lid = graph.last_link_id;
                graph.links.push([lid, parseInt(srcId, 10), srcSlot, node.id, tIdx, (src.outputs[srcSlot] ? src.outputs[srcSlot].type : '*')]);
                node.inputs[tIdx].link = lid;
                if(src.outputs[srcSlot]){
                    if(!src.outputs[srcSlot].links) src.outputs[srcSlot].links = [];
                    src.outputs[srcSlot].links.push(lid);
                }
            }
        }
    }
    graph.nodes.forEach((n, i) => n.order = i);
    return graph;
}

// 按连线方向分层排列：源节点在左、目标在右，列内按上游位置排序减少连线交叉
// （LiteGraph 自带 g.arrange() 排列质量差、连线乱飞，弃用）
function comfyDebugArrangeNodes(g){
    try{
        const nodes = g._nodes || [];
        if(!nodes.length) return;
        // 先快照组成员（按旧位置归属），布局后再把组框挪到成员新包围盒，避免组标题悬空
        const groupMembers = [];
        try{
            (g._groups || g.groups || []).forEach(gr => {
                if(typeof gr.recomputeInsideNodes === 'function'){ try{ gr.recomputeInsideNodes(); }catch(e){} }
                groupMembers.push([gr, (gr._nodes || []).slice()]);
            });
        }catch(e6){}
        const byId = new Map(nodes.map(n => [n.id, n]));
        const outs = new Map(), ins = new Map();
        nodes.forEach(n => { outs.set(n.id, []); ins.set(n.id, []); });
        // 用 litegraph 自带的 getInputNode 解析连线（新版 ComfyUI 的 graph.links 可能是 Map，
        // Object.keys 拿不到 → 全部节点被判成无上游、堆成一竖条）
        nodes.forEach(n => {
            const inputs = n.inputs || [];
            for(let i = 0; i < inputs.length; i++){
                let s = null;
                try { s = typeof n.getInputNode === 'function' ? n.getInputNode(i) : null; } catch(e){ s = null; }
                if(s && s !== n && byId.has(s.id)){
                    outs.get(s.id).push(n);
                    ins.get(n.id).push(s);
                }
            }
        });
        // 无任何连线的散节点（便签/注释等）单独放最右列，不与主体节点混排
        const linked = nodes.filter(n => ins.get(n.id).length || outs.get(n.id).length);
        const loose = nodes.filter(n => !ins.get(n.id).length && !outs.get(n.id).length);
        // 层级 = 最长上游路径（迭代松弛，遇环自动收敛）
        const depth = new Map(linked.map(n => [n.id, 0]));
        for(let iter = 0; iter < linked.length + 1; iter++){
            let changed = false;
            for(const n of linked){
                let d = -1;
                for(const s of ins.get(n.id)){
                    const sd = depth.get(s.id);
                    if(sd > d) d = sd;
                }
                if(d >= 0 && d + 1 > depth.get(n.id) && d + 1 < linked.length){
                    depth.set(n.id, d + 1);
                    changed = true;
                }
            }
            if(!changed) break;
        }
        // 分列
        const cols = new Map();
        linked.forEach(n => {
            const d = Math.max(0, depth.get(n.id) || 0);
            if(!cols.has(d)) cols.set(d, []);
            cols.get(d).push(n);
        });
        // 原生 ComfyUI 调试视图优先看清楚：列距和行距拉开，避免节点和连线挤成一团。
        const GAP_X = 190, GAP_Y = 100;
        const sortedCols = [...cols.keys()].sort((a,b) => a - b);
        // 每列高度 → 整体垂直居中基准
        const colInfo = sortedCols.map(d => {
            const list = cols.get(d);
            const h = list.reduce((s,n) => s + Math.max(n.size ? n.size[1] : 100, 40) + GAP_Y, -GAP_Y);
            return { d, list, h };
        });
        const maxH = Math.max(...colInfo.map(c => c.h), 0);
        const bary = n => {
            const s = ins.get(n.id);
            if(!s || !s.length) return Infinity; // 无上游的保持稳定排前面
            return s.reduce((t,x) => t + (x.pos ? x.pos[1] : 0), 0) / s.length;
        };
        let x = 0;
        for(const c of colInfo){
            // 列内按上游平均 y 排序（重排法减少交叉），无上游节点按原顺序
            c.list.sort((a,b) => {
                const ba = bary(a), bb = bary(b);
                if(ba === Infinity && bb === Infinity) return (a.pos?.[1]||0) - (b.pos?.[1]||0);
                if(ba === Infinity) return -1;
                if(bb === Infinity) return 1;
                return ba - bb;
            });
            let y = (maxH - c.h) / 2;
            for(const n of c.list){
                const h = Math.max(n.size ? n.size[1] : 100, 40);
                n.pos[0] = x;
                n.pos[1] = y;
                y += h + GAP_Y;
            }
            const colW = Math.max(...c.list.map(n => Math.max(n.size ? n.size[0] : 220, 40)));
            x += colW + GAP_X;
        }
        // 散节点排最右一列（从顶部往下）
        if(loose.length){
            let ly = 0;
            loose.sort((a,b) => (a.pos?.[1]||0) - (b.pos?.[1]||0));
            for(const n of loose){
                const h = Math.max(n.size ? n.size[1] : 80, 40);
                n.pos[0] = x;
                n.pos[1] = ly;
                ly += h + GAP_Y;
            }
        }
        // 组框跟随成员节点的新位置
        for(const [gr, gn] of groupMembers){
            try{
                if(!gn || !gn.length) continue;
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for(const n of gn){
                    const w = Math.max(n.size ? n.size[0] : 220, 40), h = Math.max(n.size ? n.size[1] : 100, 40);
                    minX = Math.min(minX, n.pos[0]); minY = Math.min(minY, n.pos[1]);
                    maxX = Math.max(maxX, n.pos[0] + w); maxY = Math.max(maxY, n.pos[1] + h);
                }
                if(!isFinite(minX)) continue;
                gr.pos = [minX - 12, minY - 36];
                gr.size = [maxX - minX + 24, maxY - minY + 50];
            }catch(e7){}
        }
    }catch(e){}
}

// 加载后自动整理布局并适配视图（API 格式无坐标，转换后需要重排）
// 2026-09-27 改版：分层排列（连线整洁）+ 尺寸修正 + 固定 1:1 正常比例居中；
// 排列后在 0/400/1000ms 三次校正视图，等节点尺寸与控件渲染稳定。
function comfyDebugArrangeAndFit(win){
    try {
        const cv = win.app.canvas;
        const g = win.app.graph;
        if(!g || !g._nodes || !g._nodes.length){ if(cv && cv.setDirty) cv.setDirty(true, true); return; }
        comfyNativeToneDownGroups(win);
        // 画布字号调大（默认 14，80% 缩放下偏小），先改字号再算尺寸才会生效
        try{ const L = win.LiteGraph; if(L && typeof L.NODE_TEXT_SIZE === 'number' && L.NODE_TEXT_SIZE < 16) L.NODE_TEXT_SIZE = 16; }catch(e8){}
        // 尺寸修正：历史版本（坐标×1.5、错误序列化）会把节点存成巨型空框，
        // 这里把明显高于内容实际高度的节点收回 computeSize 高度，宽度不足时补足——修复错位
        // 必须走 setSize/onResize，直接改 n.size 不会触发控件重排（文字会飘到节点外）
        g._nodes.forEach(function(n){
            try{
                if(n.flags && n.flags.collapsed) return;
                if(typeof n.computeSize === 'function'){
                    const cs = n.computeSize();
                    if(cs && cs[0] > 0 && cs[1] > 0){
                        const w = Math.max(n.size ? n.size[0] : cs[0], cs[0]);
                        const h = (n.size && n.size[1] > cs[1] + 20) ? cs[1] : (n.size ? n.size[1] : cs[1]);
                        if(typeof n.setSize === 'function') n.setSize([w, h]);
                        else {
                            n.size = [w, h];
                            if(typeof n.onResize === 'function'){ try{ n.onResize([w, h]); }catch(e5){} }
                        }
                    }
                }
            }catch(e4){}
        });
        // 分层排列：连线方向从左到右，整洁不乱飞
        comfyDebugArrangeNodes(g);
        const centerAndFit = function(){
            try {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for(const n of g._nodes){
                    const x = n.pos ? n.pos[0] : 0, y = n.pos ? n.pos[1] : 0;
                    const w = Math.max(n.size ? n.size[0] : 220, 40);
                    const h = Math.max(n.size ? n.size[1] : 100, 40);
                    minX = Math.min(minX, x); minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
                }
                if(!isFinite(minX) || !isFinite(minY)) return;
                const bw = maxX - minX, bh = maxY - minY;
                const canvasEl = cv.canvas;
                const rect = canvasEl && canvasEl.getBoundingClientRect ? canvasEl.getBoundingClientRect() : null;
                const cw = canvasEl ? ((rect && rect.width) || canvasEl.clientWidth || canvasEl.width) : 1200;
                const ch = canvasEl ? ((rect && rect.height) || canvasEl.clientHeight || canvasEl.height) : 800;
                if(!cw || !ch) return;
                // 比例对齐用户独立 ComfyUI 的显示习惯：整图自适应但上限略低，
                // 给周围留出呼吸空间，避免节点贴边、看起来拥挤。
                const fit = Math.min((cw - 90) / bw, (ch - 100) / bh);
                const scale = Math.max(0.68, Math.min(fit, 0.72));
                cv.ds.scale = scale;
                cv.ds.offset = [
                    (cw - bw*scale)/2 - minX*scale,
                    (ch - bh*scale)/2 - minY*scale
                ];
                // 不调用 cv.resize()：它会重置画布导致花屏/残影，只做整帧重绘
                cv.setDirty(true, true);
            } catch(e2){}
        };
        comfyNativeFixTextOverflow(win);
        comfyDebugArrangeNodes(g);
        centerAndFit();
        // 两次校正（400/1200ms）：等节点尺寸稳定后重新排版再定位，避免长文本撑高后压住下方节点
        setTimeout(() => {
            try{
                comfyNativeFixTextOverflow(win);
                comfyDebugArrangeNodes(g);
                centerAndFit();
                comfyNativeRefreshCanvas(win);
            }catch(e2){}
        }, 400);
        setTimeout(() => {
            try{
                comfyNativeFixTextOverflow(win);
                comfyDebugArrangeNodes(g);
                centerAndFit();
                comfyNativeRefreshCanvas(win);
            }catch(e3){}
        }, 1200);
        return;
    } catch(e){}
}

// workflowJson 为应用的 API 格式（class_type）；自行转换为前端格式后交给 ComfyUI loadGraphData
async function comfyDebugLoadWorkflow(workflowJson, silent){
    if(!workflowJson || !Object.keys(workflowJson).length) return false;
    const app = await comfyDebugWaitAppReady();
    if(!app){
        if(!silent) setStatus('ComfyUI 界面未就绪，无法加载工作流');
        return false;
    }
    try {
        const frame = document.getElementById('comfyDebugFrame');
        const win = frame ? frame.contentWindow : null;
        let graphData = null;
        try { graphData = win ? comfyApiToGraphInFrame(win, workflowJson) : null; } catch(e){ console.error('工作流转换失败', e); graphData = null; }
        // 加载后校验节点数，为 0 时短暂等待重试（iframe 刚就绪时可能还没画完）
        for(let attempt = 0; attempt < 3; attempt++){
            await app.loadGraphData(graphData ? JSON.parse(JSON.stringify(graphData)) : JSON.parse(JSON.stringify(workflowJson)));
            await new Promise(r => setTimeout(r, 800));
            const loaded = win && win.app && win.app.graph && win.app.graph._nodes ? win.app.graph._nodes.length : 0;
            if(loaded){
                comfyDebugArrangeAndFit(win);
                if(!silent) setStatus(`已在 ComfyUI 画布中打开：${selectedName}（${loaded} 个节点）`);
                return true;
            }
        }
        if(!silent) setStatus('工作流已发送，但 ComfyUI 画布为空（节点类型可能缺失）');
        return false;
    } catch(e){
        console.error(e);
        if(!silent) setStatus('加载到 ComfyUI 画布失败：' + (e && e.message ? e.message : e));
        return false;
    }
}

// —— 把 ComfyUI 调试界面里当前编辑的工作流保存/替换到工作流库 ——
function comfyNativeFrameWindow(){
    const frame = document.getElementById('comfyNativeFrame');
    if(!frame || frame.src === 'about:blank') return null;
    try { return frame.contentWindow || null; }
    catch(e){ return null; }
}

function validComfyApiWorkflow(workflow){
    if(!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return false;
    const sample = Object.values(workflow)[0];
    return !!(sample && typeof sample === 'object' && sample.class_type);
}

async function comfyNativeGrabWorkflow(){
    const win = comfyNativeFrameWindow();
    if(!win) throw new Error('ComfyUI 原生页面尚未打开或还没加载完成');
    if(!win.app || typeof win.app.graphToPrompt !== 'function'){
        throw new Error('ComfyUI 页面未就绪，无法读取当前工作流');
    }
    const nodeCount = (() => {
        try { return win.app?.graph?._nodes?.length || 0; }
        catch(e){ return 0; }
    })();
    if(!nodeCount) throw new Error('ComfyUI 当前画布为空，不能保存到左侧工作流');
    let res = null;
    try { res = await win.app.graphToPrompt(); }
    catch(e){ throw new Error('读取 ComfyUI 当前工作流失败：' + (e?.message || e)); }
    const output = res && res.output;
    if(validComfyApiWorkflow(output)) return output;
    const wf = res && res.workflow;
    if(validComfyApiWorkflow(wf)) return wf;
    throw new Error('当前 ComfyUI 画布无法转换为 API 工作流，请检查是否有未连接或报错节点');
}

async function saveNativeWorkflowContentToCurrent(){
    if(!selectedName) return null;
    if(workspaceMode !== 'native') return null;
    const frame = document.getElementById('comfyNativeFrame');
    if(frame?.dataset?.workflowName && frame.dataset.workflowName !== selectedName){
        throw new Error('ComfyUI 当前画布与左侧选中的工作流不一致，请重新点击左侧工作流后再保存');
    }
    const win = comfyNativeFrameWindow();
    let nodeCount = 0;
    try { nodeCount = win?.app?.graph?._nodes?.length || 0; } catch(e){ nodeCount = 0; }
    if(!win || !nodeCount) return null;
    const workflow = await comfyNativeGrabWorkflow();
    const res = await fetch(`/api/workflows/${encodeURIComponent(selectedName)}/content`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ workflow })
    });
    const result = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(result.detail || '保存 ComfyUI 当前工作流失败');
    currentWorkflow = workflow;
    return { workflow, backup: result.backup || '' };
}

async function comfyDebugGrabWorkflow(){
    const frame = document.getElementById('comfyDebugFrame');
    if(!frame || frame.style.display === 'none'){ throw new Error('请先在下方打开 ComfyUI 调试界面并载入工作流'); }
    let win = null;
    try { win = frame.contentWindow; } catch(e){ throw new Error('无法访问 ComfyUI 界面（跨域受限）'); }
    if(!win) throw new Error('ComfyUI 界面尚未加载完成，请稍候重试');
    if(!win.app || typeof win.app.graphToPrompt !== 'function'){
        throw new Error('无法从 ComfyUI 读取当前工作流（页面未就绪）。可改用 ComfyUI 自带的「导出（API）」保存 JSON，再在上传工作流处导入');
    }
    let res = null;
    try { res = await win.app.graphToPrompt(); }
    catch(e){ throw new Error('读取工作流失败：' + (e && e.message ? e.message : e)); }
    const apiFormat = res && res.output && typeof res.output === 'object' && Object.keys(res.output).length ? res.output : null;
    if(apiFormat) return apiFormat;
    // 兜底：graphToPrompt 没给出 output 时，检查 workflow 是否本身是 API 格式
    const wf = res && res.workflow;
    if(wf && typeof wf === 'object'){
        const sample = Object.values(wf)[0];
        if(sample && typeof sample === 'object' && 'class_type' in sample) return wf;
    }
    throw new Error('当前画布为空或无法转换为 API 格式，请先在 ComfyUI 里载入/编辑工作流');
}

function comfyDebugPickTarget(){
    return new Promise(resolve => {
        const mask = document.createElement('div');
        mask.className = 'comfy-save-mask';
        const options = visibleWorkflows().map(w => `<option value="${escapeAttr(w.name)}">${escapeHtml(w.title || w.name)}</option>`).join('');
        mask.innerHTML = `
            <div class="comfy-save-modal">
                <div class="comfy-save-title">保存当前 ComfyUI 工作流</div>
                <label class="comfy-save-label">选择要替换的工作流（原文件会自动备份）</label>
                <select id="comfySaveTarget" class="comfy-save-select">
                    ${options}
                    <option value="__new__">➕ 另存为新工作流…</option>
                </select>
                <div id="comfySaveNewRow" class="comfy-save-new-row" style="display:none">
                    <label class="comfy-save-label">新工作流名称</label>
                    <input id="comfySaveNewName" type="text" class="comfy-save-input" placeholder="例如：我的融图工作流" />
                </div>
                <div class="comfy-save-actions">
                    <button id="comfySaveCancel" type="button" class="comfy-save-btn comfy-save-btn-ghost">取消</button>
                    <button id="comfySaveOk" type="button" class="comfy-save-btn comfy-save-btn-primary">保存</button>
                </div>
            </div>`;
        document.body.appendChild(mask);
        const sel = mask.querySelector('#comfySaveTarget');
        const newRow = mask.querySelector('#comfySaveNewRow');
        const nameInput = mask.querySelector('#comfySaveNewName');
        if(selectedName && workflows.some(w => w.name === selectedName)) sel.value = selectedName;
        sel.addEventListener('change', () => { newRow.style.display = sel.value === '__new__' ? 'block' : 'none'; });
        const close = val => { mask.remove(); resolve(val); };
        mask.addEventListener('click', e => { if(e.target === mask) close(null); });
        mask.querySelector('#comfySaveCancel').addEventListener('click', () => close(null));
        mask.querySelector('#comfySaveOk').addEventListener('click', () => {
            if(sel.value === '__new__'){
                const name = (nameInput.value || '').trim();
                if(!name){ alert('请输入新工作流名称'); return; }
                close({ name: name.replace(/[\\/:*?"<>|]/g, '_'), isNew: true });
            } else {
                close({ name: sel.value, isNew: false });
            }
        });
    });
}

async function comfyDebugSaveWorkflow(){
    try {
        const workflow = await comfyDebugGrabWorkflow();
        const target = await comfyDebugPickTarget();
        if(!target) return;
        let storedName = target.name;
        if(target.isNew){
            if(!/\.json$/i.test(storedName)) storedName += '.json';
            const created = await fetch('/api/workflows', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ name: storedName.replace(/\.json$/i, ''), workflow })
            });
            const result = await created.json();
            if(!created.ok) throw new Error(result.detail || '保存失败');
            storedName = result.name;
        } else {
            const res = await fetch(`/api/workflows/${encodeURIComponent(storedName)}/content`, {
                method:'PUT', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ workflow })
            });
            const result = await res.json();
            if(!res.ok) throw new Error(result.detail || '替换失败');
            if(result.backup) setStatus(`已替换 ${storedName}（原文件备份为 ${result.backup}）`);
        }
        await loadList();
        selectWorkflow(storedName);
        new BroadcastChannel('studio-api').postMessage({ type:'workflows-changed' });
        setStatus(`已保存：${storedName}（画布生成会使用新内容）`);
    } catch(e){
        alert(e.message || '保存失败');
    }
}

function renderEditor(){
    if(!currentWorkflow){
        const graphCard = document.getElementById('graphCard');
        const graphWrap = document.querySelector('.graph-svg-wrap');
        const emptyState = workflowEmptyStateEl();
        deleteBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        nodeListEl.innerHTML = '';
        if(graphCard) graphCard.style.display = 'block';
        if(graphWrap) graphWrap.style.display = 'none';
        if(emptyState) emptyState.style.display = 'flex';
        if(workflowTitleInput) workflowTitleInput.value = '';
        if(subEl) subEl.textContent = tr('comfy.editorSubDefault');
        document.getElementById('nodesToggle').style.display = 'none';
        setNodeListOpen(false);
        if(miniCanvasHost) miniCanvasHost.style.display = 'none';
        return;
    }
    const emptyState = workflowEmptyStateEl();
    if(emptyState) emptyState.style.display = 'none';
    document.getElementById('nodesToggle').style.display = workspaceMode === 'graph' ? 'flex' : 'none';
    workflowTitleInput.value = currentConfig.title || selectedName.replace('.json','');
    subEl.textContent = tf('comfy.nodeStats', {nodes:Object.keys(currentWorkflow).length, fields:currentConfig.fields.length}) + (isBuiltin ? ` · ${tr('comfy.builtin')}` : '');
    deleteBtn.style.display = isBuiltin ? 'none' : 'inline-flex';
    saveBtn.style.display = 'inline-flex';

    renderGraph();
    renderWorkspaceView();

    const nodes = Object.entries(currentWorkflow).sort((a,b)=>{
        const aNum = parseInt(a[0],10), bNum = parseInt(b[0],10);
        if(!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a[0].localeCompare(b[0]);
    });

    nodeListEl.innerHTML = nodes.map(([nodeId, node])=>{
        const inputs = Object.entries(node.inputs || {}).filter(([k,v])=>{
            return !(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number');
        });
        const exposedCount = inputs.filter(([k])=>fieldExposed(fieldFor(nodeId,k))).length;
        const expanded = exposedCount > 0;
        const icon = nodeIcon(node);
        return `
            <div class="node-card ${expanded?'expanded':''}" id="node-card-${escapeAttr(nodeId)}" data-node-id="${escapeAttr(nodeId)}">
                <div class="node-card-head" onclick="this.parentElement.classList.toggle('expanded')">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
                        <span style="font-size:20px;line-height:1;flex:0 0 auto">${icon}</span>
                        <div style="min-width:0">
                            <div class="node-class">${escapeHtml(nodeLabel(node))}</div>
                            <div class="node-id">${escapeHtml(nodeSub(node))} · #${escapeHtml(nodeId)} · ${tf('comfy.configurableCount', {count:inputs.length})}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex:0 0 auto">
                        <div class="node-stats">${exposedCount > 0 ? tf('comfy.exposedCount', {count:exposedCount}) : ''}</div>
                        <i data-lucide="chevron-down" class="w-4 h-4 node-chev"></i>
                    </div>
                </div>
                <div class="node-inputs">
                    ${inputs.map(([key, value])=>renderInputRow(nodeId, key, value)).join('') || `<div style="color:var(--faint);font-size:11px;text-align:center;padding:14px">${tr('comfy.noConfigInputs')}</div>`}
                </div>
            </div>
        `;
    }).join('');
    refreshIcons();
}

// 计算节点拓扑层级（按从入度 0 的源节点向下游传播）
function computeLayers(){
    const ids = Object.keys(currentWorkflow);
    const incoming = {};   // nodeId -> Set of upstream nodeIds
    const outgoing = {};
    ids.forEach(id => { incoming[id] = new Set(); outgoing[id] = new Set(); });
    ids.forEach(id => {
        const inputs = currentWorkflow[id].inputs || {};
        Object.values(inputs).forEach(v => {
            if(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string'){
                if(currentWorkflow[v[0]]){
                    incoming[id].add(v[0]);
                    outgoing[v[0]].add(id);
                }
            }
        });
    });
    const layer = {};
    const visited = new Set();
    function dfs(id, lv){
        if(visited.has(id)) return;
        if((layer[id] || 0) < lv) layer[id] = lv;
        else layer[id] = layer[id] || lv;
        visited.add(id);
        outgoing[id].forEach(child => dfs(child, lv + 1));
    }
    // 从无上游的节点开始
    ids.forEach(id => { if(incoming[id].size === 0) dfs(id, 0); });
    // 处理可能漏掉的环 / 孤立节点
    ids.forEach(id => { if(!(id in layer)) layer[id] = 0; });
    // 按层级分桶
    const buckets = {};
    ids.forEach(id => {
        const lv = layer[id];
        (buckets[lv] = buckets[lv] || []).push(id);
    });
    return { layer, buckets, incoming };
}

function renderGraph(){
    const svg = document.getElementById('graphSvg');
    if(!currentWorkflow || !Object.keys(currentWorkflow).length){
        document.getElementById('graphCard').style.display = 'none';
        return;
    }
    document.getElementById('graphCard').style.display = 'block';
    const { layer, buckets, incoming } = computeLayers();
    const NODE_W = 130, NODE_H = 50, X_GAP = 36, Y_GAP = 14;
    const positions = {};
    const sortedLevels = Object.keys(buckets).map(Number).sort((a,b)=>a-b);
    let maxRows = 0;
    sortedLevels.forEach(lv => {
        const ids = buckets[lv].sort((a,b)=>parseInt(a,10)-parseInt(b,10));
        ids.forEach((id, idx) => {
            positions[id] = { x: lv * (NODE_W + X_GAP) + 16, y: idx * (NODE_H + Y_GAP) + 16 };
        });
        maxRows = Math.max(maxRows, ids.length);
    });
    const totalW = (sortedLevels.length) * (NODE_W + X_GAP) + 16;
    const totalH = maxRows * (NODE_H + Y_GAP) + 16;

    // 连线
    const edgesHtml = [];
    Object.keys(currentWorkflow).forEach(toId => {
        const inputs = currentWorkflow[toId].inputs || {};
        const seen = new Set();
        Object.values(inputs).forEach(v => {
            if(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && positions[v[0]]){
                if(seen.has(v[0])) return;
                seen.add(v[0]);
                const from = positions[v[0]];
                const to = positions[toId];
                const x1 = from.x + NODE_W, y1 = from.y + NODE_H/2;
                const x2 = to.x, y2 = to.y + NODE_H/2;
                const cx = (x1 + x2) / 2;
                edgesHtml.push(`<path class="gedge" d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}"></path>`);
            }
        });
    });

    // 节点
    const nodesHtml = Object.entries(currentWorkflow).map(([id, node]) => {
        const pos = positions[id];
        const label = nodeLabel(node);
        const sub = node.class_type || '';
        const exposedCount = currentConfig.fields.filter(f => f.node === id && fieldExposed(f)).length;
        const exposedClass = exposedCount > 0 ? 'has-exposed' : '';
        const cat = NODE_INFO[node.class_type]?.cat || 'misc';
        const icon = nodeIcon(node);
        const truncLabel = label.length > 12 ? label.slice(0,12) + '…' : label;
        const truncSub = sub.length > 16 ? sub.slice(0,16) + '…' : sub;
        return `
            <g class="gnode cat-${cat} ${exposedClass}" data-node-id="${escapeAttr(id)}" transform="translate(${pos.x},${pos.y})" onclick="openNodePopup('${escapeAttr(id)}', this)">
                <rect width="${NODE_W}" height="${NODE_H}" rx="8"></rect>
                <text class="gn-icon" x="10" y="20" font-size="14">${icon}</text>
                <text class="gn-title" x="28" y="20">${escapeHtml(truncLabel)}</text>
                <text class="gn-sub" x="28" y="35">${escapeHtml(truncSub)}</text>
                <text class="gn-sub" x="${NODE_W - 8}" y="20" text-anchor="end">#${escapeHtml(id)}</text>
                ${exposedCount > 0 ? `<text class="gbadge" x="${NODE_W - 8}" y="42" text-anchor="end">${tf('comfy.usedCount', {count:exposedCount})}</text>` : ''}
            </g>
        `;
    }).join('');

    graphContentSize = { w: totalW, h: totalH };
    svg.innerHTML = `<g id="graphViewport" transform="translate(${graphView.x},${graphView.y}) scale(${graphView.k})">${edgesHtml.join('')}${nodesHtml}</g>`;
    // 设置 SVG 自身尺寸（占满容器）
    const wrap = svg.parentElement;
    svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
    attachPanZoom(svg, wrap);
    updateZoomPill();
}

// 缩放/平移状态
let graphView = { k: 1, x: 0, y: 0 };
let graphContentSize = { w: 0, h: 0 };
let panState = null;

function updateZoomPill(){
    const pill = document.getElementById('zoomPill');
    if(pill) pill.textContent = Math.round(graphView.k * 100) + '%';
}
function applyGraphTransform(){
    const vp = document.getElementById('graphViewport');
    if(vp) vp.setAttribute('transform', `translate(${graphView.x},${graphView.y}) scale(${graphView.k})`);
    updateZoomPill();
}
function graphZoom(dir){
    const factor = dir > 0 ? 1.2 : 1/1.2;
    const newK = Math.max(0.2, Math.min(3, graphView.k * factor));
    // 围绕容器中心缩放
    const wrap = document.querySelector('.graph-svg-wrap');
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    graphView.x = cx - (cx - graphView.x) * (newK / graphView.k);
    graphView.y = cy - (cy - graphView.y) * (newK / graphView.k);
    graphView.k = newK;
    applyGraphTransform();
}
function graphFit(){
    const wrap = document.querySelector('.graph-svg-wrap');
    if(!graphContentSize.w || !wrap) return;
    const pad = 20;
    const kx = (wrap.clientWidth - pad*2) / graphContentSize.w;
    const ky = (wrap.clientHeight - pad*2) / graphContentSize.h;
    const k = Math.max(0.2, Math.min(2, Math.min(kx, ky)));
    graphView.k = k;
    graphView.x = (wrap.clientWidth - graphContentSize.w * k) / 2;
    graphView.y = (wrap.clientHeight - graphContentSize.h * k) / 2;
    applyGraphTransform();
}
function attachPanZoom(svg, wrap){
    if(svg.dataset.panZoomBound) return;
    svg.dataset.panZoomBound = '1';
    // 滚轮缩放（围绕鼠标位置）
    wrap.addEventListener('wheel', e => {
        if(e.target.closest('.popup-panel')) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
        const newK = Math.max(0.2, Math.min(3, graphView.k * factor));
        const rect = wrap.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        graphView.x = mx - (mx - graphView.x) * (newK / graphView.k);
        graphView.y = my - (my - graphView.y) * (newK / graphView.k);
        graphView.k = newK;
        applyGraphTransform();
    }, { passive: false });
    // 鼠标拖动（空白区域）
    svg.addEventListener('mousedown', e => {
        // 只在点击空白处（不是节点 g）才平移
        if(e.target.closest('.gnode')) return;
        e.preventDefault();
        panState = { sx: e.clientX, sy: e.clientY, ox: graphView.x, oy: graphView.y };
        wrap.classList.add('is-panning');
    });
    window.addEventListener('mousemove', e => {
        if(!panState) return;
        graphView.x = panState.ox + (e.clientX - panState.sx);
        graphView.y = panState.oy + (e.clientY - panState.sy);
        applyGraphTransform();
    });
    window.addEventListener('mouseup', () => {
        if(panState){ panState = null; wrap.classList.remove('is-panning'); }
    });
}
let popupNodeId = null;

function openNodePopup(nodeId, gEl){
    popupNodeId = nodeId;
    document.querySelectorAll('.gnode').forEach(g => g.classList.toggle('is-active', g.dataset.nodeId === nodeId));
    const node = currentWorkflow[nodeId];
    if(!node) return;
    const popup = document.getElementById('nodePopup');
    const backdrop = document.getElementById('popupBackdrop');
    const inputs = Object.entries(node.inputs || {}).filter(([k,v]) => {
        return !(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number');
    });
    const icon = nodeIcon(node);
    const label = nodeLabel(node);
    const sub = nodeSub(node);
    popup.innerHTML = `
        <div class="popup-head">
            <span class="popup-icon">${icon}</span>
            <div style="min-width:0;flex:1">
                <div class="popup-title">${escapeHtml(label)}</div>
                <div class="popup-sub">${escapeHtml(sub)} · #${escapeHtml(nodeId)}</div>
            </div>
            <div class="popup-close" onclick="closeNodePopup()"><i data-lucide="x" class="w-4 h-4"></i></div>
        </div>
        <div class="popup-body">
            ${inputs.length === 0
                ? `<div class="popup-empty">${tr('comfy.noConfigFields')}</div>`
                : inputs.map(([key, value]) => renderInputRow(nodeId, key, value)).join('')}
        </div>
    `;
    // 定位：尽量贴在节点右侧；若超出则放左侧；若上下放不下则居中
    const wrap = document.querySelector('.graph-svg-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const gRect = gEl.getBoundingClientRect();
    const POP_W = 380;
    const POP_H_MAX = Math.min(wrap.clientHeight - 40, window.innerHeight * 0.7);
    backdrop.style.display = 'block';
    popup.style.display = 'flex';
    popup.style.maxHeight = POP_H_MAX + 'px';
    // 相对 wrap 的坐标（含滚动）
    let left = gRect.right - wrapRect.left + wrap.scrollLeft + 12;
    // 不够位置就放左侧
    if(left + POP_W > wrap.scrollLeft + wrap.clientWidth - 8){
        left = gRect.left - wrapRect.left + wrap.scrollLeft - POP_W - 12;
    }
    if(left < wrap.scrollLeft + 8) left = wrap.scrollLeft + 8;
    let top = gRect.top - wrapRect.top + wrap.scrollTop;
    // 防止溢出底部
    const maxTop = wrap.scrollTop + wrap.clientHeight - POP_H_MAX - 8;
    if(top > maxTop) top = Math.max(wrap.scrollTop + 8, maxTop);
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.onwheel = e => e.stopPropagation();
    popup.querySelector('.popup-body')?.addEventListener('wheel', e => e.stopPropagation(), { passive:true });
    refreshIcons();
}

function closeNodePopup(){
    popupNodeId = null;
    document.querySelectorAll('.gnode').forEach(g => g.classList.remove('is-active'));
    document.getElementById('nodePopup').style.display = 'none';
    document.getElementById('popupBackdrop').style.display = 'none';
}

function toggleNodeList(){
    const list = document.getElementById('nodeList');
    setNodeListOpen(list.classList.contains('hidden'));
}

function setNodeListOpen(open){
    const list = document.getElementById('nodeList');
    const txt = document.getElementById('nodesToggleText');
    if(!list) return;
    list.classList.toggle('hidden', !open);
    document.querySelector('.content')?.classList.toggle('node-list-open', !!open);
    if(txt) txt.textContent = open ? tr('comfy.hideNodeList') : tr('comfy.showNodeList');
}

// Esc 关闭浮窗
document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && popupNodeId) closeNodePopup();
    if(e.key === 'Escape') closeImagePreview();
    if(e.key === 'Escape') setNodeListOpen(false);
});

function renderInputRow(nodeId, inputKey, rawValue){
    const f = fieldFor(nodeId, inputKey);
    const active = fieldExposed(f);
    const showExtras = active && (f.type === 'slider' || f.type === 'number' || f.type === 'dropdown');
    // 原始值类型徽章
    let valueBadge = '';
    const typeOf = typeof rawValue;
    if(typeOf === 'string'){
        const preview = rawValue.length > 50 ? rawValue.slice(0,50) + '…' : rawValue;
        valueBadge = `<span style="color:var(--muted);font-size:10.5px;font-weight:700">"</span><span style="color:var(--text);font-size:11px;font-weight:700">${escapeHtml(preview)}</span><span style="color:var(--muted);font-size:10.5px;font-weight:700">"</span>`;
    } else if(typeOf === 'number'){
        valueBadge = `<span style="color:#0369a1;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums">${rawValue}</span>`;
    } else if(typeOf === 'boolean'){
        valueBadge = `<span style="color:${rawValue?'#15803d':'#b45309'};font-size:11px;font-weight:800">${rawValue?'✓ true':'✗ false'}</span>`;
    } else {
        valueBadge = `<span style="color:var(--faint);font-size:11px">${escapeHtml(String(rawValue))}</span>`;
    }
    const friendlyName = inputLabel(inputKey);
    const showOriginal = friendlyName !== inputKey;
    return `
        <div class="input-row ${active?'is-active':''} ${showExtras?'has-extras':''}">
            <div class="check-toggle ${active?'checked':''}" onclick="toggleField('${escapeAttr(nodeId)}','${escapeAttr(inputKey)}')">
                ${active ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
            </div>
            <div class="input-info">
                <div class="input-key">${escapeHtml(friendlyName)}${showOriginal ? ` <span style="font-size:10px;font-weight:600;color:var(--faint);margin-left:4px">${escapeHtml(inputKey)}</span>` : ''}</div>
                <div class="input-orig">${tr('comfy.defaultValue')}${valueBadge}</div>
            </div>
            <input class="small-input" type="text" placeholder="${tr('comfy.displayName')}" value="${active?escapeAttr(f.name):escapeAttr(friendlyName)}" ${active?'':'disabled'} oninput="updateField('${active?f.id:''}','name',this.value)">
            <select class="small-select" ${active?'':'disabled'} onchange="updateField('${active?f.id:''}','type',this.value)">
                ${TYPES.map(t=>`<option value="${t.v}" ${active && f.type===t.v?'selected':''}>${typeLabel(t.v)}</option>`).join('')}
            </select>
            ${active ? renderExtras(f) : ''}
        </div>
    `;
}

function renderExtras(f){
    if(f.type === 'slider' || f.type === 'number'){
        const randomToggle = f.type === 'number'
            ? `<label class="random-toggle" onclick="event.stopPropagation()"><input type="checkbox" ${f.random_enabled === true ? 'checked' : ''} onchange="updateField('${f.id}','random_enabled',this.checked)">随机数</label>`
            : '';
        return `<div class="extras-row">
            <div class="extra-pair">min<input class="small-input" type="number" value="${f.min ?? ''}" oninput="updateField('${f.id}','min',this.value===''?null:parseFloat(this.value))"></div>
            <div class="extra-pair">max<input class="small-input" type="number" value="${f.max ?? ''}" oninput="updateField('${f.id}','max',this.value===''?null:parseFloat(this.value))"></div>
            <div class="extra-pair">step<input class="small-input" type="number" value="${f.step ?? ''}" oninput="updateField('${f.id}','step',this.value===''?null:parseFloat(this.value))"></div>
            <div class="extra-pair">${tr('comfy.defaultValue')}<input class="small-input" type="number" value="${f.default ?? ''}" oninput="updateField('${f.id}','default',this.value===''?null:parseFloat(this.value))"></div>
            ${randomToggle}
        </div>`;
    }
    if(f.type === 'dropdown'){
        const opts = f.options || [];
        const fid = escapeAttr(f.id);
        const rows = opts.map((o, i) => {
            const looksNumber = String(o).trim() !== '' && !isNaN(Number(o));
            const tag = looksNumber
                ? '<span class="opt-type-tag is-num">数字</span>'
                : '<span class="opt-type-tag">文本</span>';
            return `
                <div class="dropdown-opt-row">
                    <span class="opt-index">${i + 1}</span>
                    <input class="small-input" type="text" placeholder="选项 ${i + 1}" value="${escapeAttr(o)}"
                        onmousedown="event.stopPropagation()" onclick="event.stopPropagation()"
                        oninput="updateDropdownOption('${fid}', ${i}, this.value, this)">
                    ${tag}
                    <button class="opt-del" type="button" onclick="event.stopPropagation();removeDropdownOption('${fid}', ${i})" title="删除"><i data-lucide="x" class="w-3 h-3"></i></button>
                </div>
            `;
        }).join('');
        return `<div class="extras-row" style="flex-direction:column;align-items:stretch;gap:6px">
            <div style="font-size:11px;color:var(--muted);font-weight:700">
                下拉选项 <span style="color:var(--faint)">· 数字形式自动作为数值传给 ComfyUI</span>
            </div>
            ${rows}
            <button class="ghost-btn" type="button" onclick="event.stopPropagation();addDropdownOption('${fid}')" style="height:34px;padding:0 16px;font-size:12px;font-weight:800;align-self:flex-start;gap:6px"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>添加选项</span></button>
        </div>`;
    }
    return '';
}
function updateDropdownOption(fieldId, index, value, inputEl){
    const f = currentConfig.fields.find(x => x.id === fieldId); if(!f) return;
    f.options = f.options || [];
    f.options[index] = value;
    // 不重渲浮窗，只更新当前行右侧「数字/文本」标签
    if(inputEl){
        const tag = inputEl.parentElement?.querySelector('.opt-type-tag');
        if(tag){
            const looksNumber = String(value).trim() !== '' && !isNaN(Number(value));
            tag.classList.toggle('is-num', looksNumber);
            tag.textContent = looksNumber ? '数字' : '文本';
        }
    }
    renderPreview();  // 右侧预览的下拉选项实时同步
}
function addDropdownOption(fieldId){
    const f = currentConfig.fields.find(x => x.id === fieldId); if(!f) return;
    f.options = [...(f.options || []), ''];
    renderPreview();
    if(popupNodeId === f.node) refreshPopupBody();
}
function removeDropdownOption(fieldId, index){
    const f = currentConfig.fields.find(x => x.id === fieldId); if(!f) return;
    f.options = (f.options || []).filter((_, i) => i !== index);
    renderPreview();
    if(popupNodeId === f.node) refreshPopupBody();
}

// --- 右侧实时预览 ---
function setPreviewValue(fieldId, value){
    previewValues[fieldId] = value;
    // 更新滑块旁边的数值显示
    const valSpan = document.querySelector(`[data-slider-val="${fieldId}"]`);
    if(valSpan) valSpan.textContent = value;
}
function randomValueForField(f){
    const isFloat = Number(f.step) > 0 && Number(f.step) < 1;
    let min = Number.isFinite(Number(f.min)) ? Number(f.min) : null;
    let max = Number.isFinite(Number(f.max)) ? Number(f.max) : null;
    const name = `${f.input || ''} ${f.name || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('噪');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    let value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(f.step).split('.')[1]?.length || 2));
        value = Number(value.toFixed(precision));
    } else {
        value = Math.floor(value);
    }
    return value;
}

function fieldSupportsRandom(f){
    return !!f && f.type === 'number' && f.random_enabled === true;
}

function isPreviewRandomActive(fieldId){
    return previewRandomActive[fieldId] !== false;
}

function randomButtonHtml(f){
    if(!fieldSupportsRandom(f)) return '';
    const active = isPreviewRandomActive(f.id);
    const title = active ? '随机已开启，点击关闭' : '随机已关闭，点击开启';
    return `<button class="random-btn ${active ? 'active' : ''}" type="button" onclick="togglePreviewRandom('${f.id}')" title="${title}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>`;
}

function togglePreviewRandom(fieldId){
    const f = currentConfig?.fields?.find(x => x.id === fieldId);
    if(!fieldSupportsRandom(f)) return;
    previewRandomActive[fieldId] = !isPreviewRandomActive(fieldId);
    renderPreview();
    if(workspaceMode === 'canvas') renderMiniCanvasPreview(miniCanvasHost, true);
}

function applyActiveRandomValues(fields){
    const out = {...fields};
    currentConfig?.fields?.forEach(f => {
        if(fieldSupportsRandom(f) && isPreviewRandomActive(f.id)){
            const value = randomValueForField(f);
            out[f.id] = value;
            previewValues[f.id] = value;
        }
    });
    return out;
}

function openImagePreview(url){
    const box = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    if(!box || !img || !url) return;
    img.src = url;
    box.classList.add('open');
}

function closeImagePreview(){
    const box = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    if(box) box.classList.remove('open');
    if(img) img.src = '';
}

function runResultFromResponse(data){
    // 音频工作流有时也会返回预览图，优先选择真正的音频输出。
    const candidates = [
        ['audio', data?.audios],
        ['video', data?.videos],
        ['image', data?.images],
    ];
    for(const [kind, values] of candidates){
        const url = Array.isArray(values)
            ? values.find(value => typeof value === 'string' && value.trim())
            : '';
        if(!url) continue;
        const item = Array.isArray(data?.items)
            ? data.items.find(entry => entry?.kind === kind && entry?.url === url)
            : null;
        return { kind, url, name:item?.name || '' };
    }
    return null;
}

function renderRunResultHtml(result, mini = false){
    if(!result?.url) return '';
    const url = escapeAttr(result.url);
    const name = escapeHtml(result.name || (
        result.kind === 'audio' ? '生成音频' :
        result.kind === 'video' ? '生成视频' : '生成图片'
    ));
    const rootClass = mini ? 'mini-result' : 'run-result';
    if(result.kind === 'audio'){
        return `<div class="${rootClass} ${mini ? 'mini-result-audio' : 'run-result-audio'}">
            <div class="run-result-file">
                <i data-lucide="file-audio" class="w-4 h-4"></i>
                <span>${name}</span>
            </div>
            <audio src="${url}" controls preload="metadata"></audio>
            <div class="run-status">${tr('comfy.runSuccess')}</div>
        </div>`;
    }
    if(result.kind === 'video'){
        return `<div class="${rootClass} ${mini ? 'mini-result-video' : 'run-result-video'}">
            <video src="${url}" controls preload="metadata" playsinline></video>
            <div class="run-status">${tr('comfy.runSuccess')}</div>
        </div>`;
    }
    const previewHandler = `openImagePreview(${JSON.stringify(result.url)})`;
    return `<div class="${rootClass}">
        <img src="${url}" onclick="${escapeAttr(previewHandler)}">
        <div class="run-status">${tr('comfy.runSuccess')}</div>
    </div>`;
}

function renderPreview(){
    // 2026-09-27 只显示用户启用（enabled !== false）的参数；自动生成的未启用参数不再全部暴露
    const fields = (currentConfig?.fields || []).filter(f => fieldExposed(f));
    if(!fields.length){
        previewCard.innerHTML = `<div class="preview-empty">${tr('comfy.previewEmpty')}</div>
            <div class="muted-note" style="text-align:center;padding:6px 14px 14px;font-size:11.5px">在左侧节点里点击参数开关即可启用并暴露到画布</div>`;
        return;
    }
    const fieldsHtml = fields.map(f => renderPreviewField(f)).join('');
    const resultHtml = renderRunResultHtml(runResult);
    const runButton = `<button id="runBtn" class="run-btn" type="button" onclick="onRun()">
            <i data-lucide="play" class="w-4 h-4"></i><span>${tr('comfy.runTest')}</span>
        </button>`;
    previewCard.innerHTML = `
        ${fieldsHtml}
        ${runButton}
        ${resultHtml}
    `;
    refreshIcons();
}

function renderPreviewField(f){
    const label = `<div class="pfield-label">${escapeHtml(f.name || f.input)}</div>`;
    const v = previewValues[f.id] ?? f.default ?? (f.type==='boolean'?false:(f.type==='number'||f.type==='slider'?0:''));
    if(f.type === 'textarea'){
        return `<div class="pfield">${label}<textarea class="pfield-textarea" oninput="setPreviewValue('${f.id}',this.value)">${escapeHtml(v)}</textarea></div>`;
    }
    if(f.type === 'number'){
        const randomBtn = randomButtonHtml(f);
        return `<div class="pfield">${label}<div class="pfield-random-row" style="${randomBtn ? '' : 'grid-template-columns:1fr'}"><input class="pfield-input" type="number" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',parseFloat(this.value)||0)">${randomBtn}</div></div>`;
    }
    if(f.type === 'slider'){
        const min = f.min ?? 0, max = f.max ?? 10, step = f.step ?? 1;
        return `<div class="pfield">${label}<div class="pfield-random-row" style="grid-template-columns:1fr"><div class="pfield-slider">
            <input type="range" min="${min}" max="${max}" step="${step}" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',parseFloat(this.value))">
            <span class="pfield-slider-val" data-slider-val="${f.id}">${v}</span>
        </div></div></div>`;
    }
    if(f.type === 'dropdown'){
        const opts = (f.options || []).map(o => `<option value="${escapeAttr(o)}" ${String(v)===String(o)?'selected':''}>${escapeHtml(o)}</option>`).join('');
        return `<div class="pfield">${label}<select class="pfield-select" onchange="setPreviewValue('${f.id}',this.value)">${opts || `<option value="">${tr('comfy.noOptions')}</option>`}</select></div>`;
    }
    if(isMediaField(f)){
        // 浏览器显示用本地 blob URL；如果没有就尝试用 /output/ 之类的可访问 URL；都没有显示占位文字
        const displayUrl = previewImageUrls[f.id] || (typeof v === 'string' && /^(\/|https?:|blob:|data:)/.test(v) ? v : '');
        return `<div class="pfield">${label}<div class="pfield-image-drop ${displayUrl?'has-image':''}" onclick="pickImage('${f.id}')">
            ${mediaPreviewHtml(fieldKind(f), displayUrl, v)}
        </div></div>`;
    }
    if(f.type === 'boolean'){
        return `<div class="pfield">${label}<div class="pfield-bool">
            <div class="pfield-bool-track ${v?'on':''}" onclick="setPreviewValue('${f.id}',!${!!v});this.classList.toggle('on')">
                <div class="pfield-bool-thumb"></div>
            </div>
        </div></div>`;
    }
    return `<div class="pfield">${label}<input class="pfield-input" type="text" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',this.value)"></div>`;
}

function miniCardStyle(key){
    const p = miniCards[key] || defaultMiniCards()[key] || {x:0,y:0};
    return `left:${p.x}px;top:${p.y}px`;
}

function miniLine(aKey, bKey){
    const a = miniCards[aKey] || defaultMiniCards()[aKey];
    const b = miniCards[bKey] || defaultMiniCards()[bKey];
    const x1 = a.x + 210, y1 = a.y + 70, x2 = b.x, y2 = b.y + 70;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    const deg = Math.atan2(dy, dx) * 180 / Math.PI;
    return `<div class="mini-line" style="left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${deg}deg)"></div>`;
}

function renderWorkspaceView(){
    const graphWrap = document.querySelector('.graph-svg-wrap');
    const nodesToggle = document.getElementById('nodesToggle');
    const emptyState = workflowEmptyStateEl();
    document.getElementById('workspaceGraphTab')?.classList.toggle('active', workspaceMode === 'graph');
    document.getElementById('workspaceCanvasTab')?.classList.toggle('active', workspaceMode === 'canvas');
    document.getElementById('workspaceNativeTab')?.classList.toggle('active', workspaceMode === 'native');
    refreshSaveButtonLabel();
    const nativeHost = document.getElementById('comfyNativeHost');
    if(workspaceMode === 'native'){
        // ComfyUI 原生页面实时视图：不依赖已选工作流
        if(graphWrap){ graphWrap.style.display = 'block'; graphWrap.classList.add('native-on'); }
        if(miniCanvasHost) miniCanvasHost.style.display = 'none';
        if(nodesToggle) nodesToggle.style.display = 'none';
        setNodeListOpen(false);
        if(emptyState) emptyState.style.display = 'none';
        renderComfyNative();
        return;
    }
    if(graphWrap) graphWrap.classList.remove('native-on');
    if(nativeHost) nativeHost.style.display = 'none';
    if(!currentWorkflow){
        if(graphWrap) graphWrap.style.display = 'none';
        if(miniCanvasHost) miniCanvasHost.style.display = 'none';
        if(nodesToggle) nodesToggle.style.display = 'none';
        setNodeListOpen(false);
        if(emptyState) emptyState.style.display = 'flex';
        return;
    }
    if(emptyState) emptyState.style.display = 'none';
    if(workspaceMode === 'canvas'){
        if(graphWrap) graphWrap.style.display = 'none';
        if(nodesToggle) nodesToggle.style.display = 'none';
        setNodeListOpen(false);
        renderMiniCanvasPreview(miniCanvasHost, true);
    } else {
        if(graphWrap) graphWrap.style.display = 'block';
        if(miniCanvasHost) miniCanvasHost.style.display = 'none';
        if(nodesToggle) nodesToggle.style.display = 'flex';
    }
}

function renderMiniCanvasPreview(target = previewCard, large = false){
    if(!target) return;
    const promptFields = currentConfig.fields.filter(f => fieldKind(f) === 'prompt');
    const imageFields = currentConfig.fields.filter(f => fieldKind(f) === 'image');
    const videoFields = currentConfig.fields.filter(f => fieldKind(f) === 'video');
    const audioFields = currentConfig.fields.filter(f => fieldKind(f) === 'audio');
    const settingFields = currentConfig.fields.filter(f => fieldKind(f) === 'setting');
    const prompts = miniTestNodes.filter(n => n.type === 'prompt');
    const mediaNodes = miniTestNodes.filter(n => ['image','video','audio'].includes(n.type));
    const comfy = miniTestNodes.find(n => n.type === 'comfy') || defaultMiniTestNodes().find(n => n.type === 'comfy');
    const output = miniTestNodes.find(n => n.type === 'output') || defaultMiniTestNodes().find(n => n.type === 'output');
    const resultHtml = runResult
        ? renderRunResultHtml(runResult, true)
        : `<div class="preview-empty" style="padding:18px 10px">${tr('comfy.resultHere')}</div>`;
    target.style.display = 'block';
    target.innerHTML = `
        <div id="miniCanvas" class="mini-canvas ${large ? 'large' : ''}">
            <div class="mini-toolbar">
                <button class="mini-tool" type="button" onclick="addMiniNode('prompt')"><i data-lucide="text-cursor-input" class="w-3.5 h-3.5"></i>${tr('comfy.addPrompt')}</button>
                <button class="mini-tool" type="button" onclick="addMiniNode('image')"><i data-lucide="image-plus" class="w-3.5 h-3.5"></i>${tr('comfy.addImage')}</button>
                <button class="mini-tool" type="button" onclick="addMiniNode('video')"><i data-lucide="file-video" class="w-3.5 h-3.5"></i>${typeLabel('video')}</button>
                <button class="mini-tool" type="button" onclick="addMiniNode('audio')"><i data-lucide="file-audio" class="w-3.5 h-3.5"></i>${typeLabel('audio')}</button>
            </div>
            <div id="miniWorld" class="mini-world" style="transform:translate(${miniView.x}px,${miniView.y}px) scale(${miniView.k})">
                ${[...prompts, ...mediaNodes].map(n => miniLineBetween(n, comfy)).join('')}
                ${miniLineBetween(comfy, output)}
                ${prompts.map((n,i) => `
                    <div class="mini-card" data-node="${n.id}" style="left:${n.x}px;top:${n.y}px">
                        <span class="mini-port out"></span>
                        <div class="mini-card-head"><i data-lucide="text-cursor-input" class="w-3.5 h-3.5"></i><span class="mini-node-title">${tr('comfy.promptNode')} ${i+1}</span>${miniDeleteButton(n)}</div>
                        <div class="mini-card-body"><textarea class="mini-textarea" oninput="updateMiniNode('${n.id}','text',this.value)" placeholder="${escapeAttr(tr('comfy.promptPlaceholder'))}">${escapeHtml(n.text || '')}</textarea></div>
                    </div>`).join('')}
                ${mediaNodes.map((n,i) => `
                    <div class="mini-card" data-node="${n.id}" style="left:${n.x}px;top:${n.y}px">
                        <span class="mini-port out"></span>
                        <div class="mini-card-head"><i data-lucide="${n.type === 'video' ? 'file-video' : n.type === 'audio' ? 'file-audio' : 'image'}" class="w-3.5 h-3.5"></i><span class="mini-node-title">${typeLabel(n.type)} ${i+1}</span>${miniDeleteButton(n)}</div>
                        <div class="mini-card-body"><div class="mini-image-drop" onclick="pickMiniImage('${n.id}')">${mediaPreviewHtml(n.type, n.url, n.name || n.value, true)}</div></div>
                    </div>`).join('')}
                <div class="mini-card comfy-card" data-node="${comfy.id}" style="left:${comfy.x}px;top:${comfy.y}px">
                    <span class="mini-port in"></span><span class="mini-port out"></span>
                    <div class="mini-card-head"><i data-lucide="workflow" class="w-3.5 h-3.5"></i><span class="mini-node-title">${escapeHtml(currentConfig.title || selectedName.replace('.json',''))} · ${tr('canvas.comfyCustom')}</span></div>
                    <div class="mini-card-body">
                        <div class="text-[10px] font-black uppercase" style="color:var(--faint)">${tr('comfy.inputs')}</div>
                        <div class="preview-empty" style="padding:10px;font-size:11px;text-align:left">
                            ${mediaFieldLabel('image', imageFields.length)} · ${mediaFieldLabel('video', videoFields.length)} · ${mediaFieldLabel('audio', audioFields.length)} · ${promptFields.length ? tr('comfy.acceptsPrompt') : tr('comfy.noPromptField')}
                        </div>
                        <div class="mini-settings-list">
                            ${settingFields.length ? settingFields.map(f => renderMiniField(f)).join('') : `<div class="preview-empty" style="padding:16px 10px">${tr('comfy.otherParamsHere')}</div>`}
                        </div>
                        <button id="runBtn" class="run-btn mini-run" type="button" onclick="onRun()">
                            <i data-lucide="play" class="w-4 h-4"></i><span>${tr('comfy.runTest')}</span>
                        </button>
                    </div>
                </div>
                <div class="mini-card" data-node="${output.id}" style="left:${output.x}px;top:${output.y}px">
                    <span class="mini-port in"></span>
                    <div class="mini-card-head"><i data-lucide="circle-dot" class="w-3.5 h-3.5"></i><span>${tr('comfy.output')}</span></div>
                    <div class="mini-card-body">${resultHtml}</div>
                </div>
            </div>
        </div>
    `;
    bindMiniCanvas();
    refreshIcons();
}

function renderMiniField(f){
    const label = `<div class="pfield-label">${escapeHtml(f.name || f.input)}</div>`;
    const v = previewValues[f.id] ?? f.default ?? (f.type==='boolean'?false:(f.type==='number'||f.type==='slider'?0:''));
    if(isMediaField(f)){
        const displayUrl = previewImageUrls[f.id] || (typeof v === 'string' && /^(\/|https?:|blob:|data:)/.test(v) ? v : '');
        return `<div class="pfield">${label}<div class="mini-image-drop" onclick="pickImage('${f.id}')">${mediaPreviewHtml(fieldKind(f), displayUrl, v, true)}</div></div>`;
    }
    if(f.type === 'textarea'){
        return `<div class="pfield">${label}<textarea class="mini-textarea" oninput="setPreviewValue('${f.id}',this.value)">${escapeHtml(v)}</textarea></div>`;
    }
    if(f.type === 'number'){
        const randomBtn = randomButtonHtml(f);
        return `<div class="pfield">${label}<div class="pfield-random-row" style="${randomBtn ? '' : 'grid-template-columns:1fr'}"><input class="mini-input" type="number" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',parseFloat(this.value)||0)">${randomBtn}</div></div>`;
    }
    if(f.type === 'slider'){
        const min = f.min ?? 0, max = f.max ?? 10, step = f.step ?? 1;
        return `<div class="pfield">${label}<div class="pfield-random-row" style="grid-template-columns:1fr"><div class="pfield-slider">
            <input type="range" min="${min}" max="${max}" step="${step}" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',parseFloat(this.value))">
            <span class="pfield-slider-val" data-slider-val="${f.id}">${v}</span>
        </div></div></div>`;
    }
    if(f.type === 'dropdown'){
        const opts = (f.options || []).map(o => `<option value="${escapeAttr(o)}" ${String(v)===String(o)?'selected':''}>${escapeHtml(o)}</option>`).join('');
        return `<div class="pfield">${label}<select class="pfield-select" onchange="setPreviewValue('${f.id}',this.value)">${opts || `<option value="">${tr('comfy.noOptions')}</option>`}</select></div>`;
    }
    if(f.type === 'boolean'){
        return `<div class="pfield">${label}<div class="pfield-bool"><div class="pfield-bool-track ${v?'on':''}" onclick="setPreviewValue('${f.id}',!${!!v});this.classList.toggle('on')"><div class="pfield-bool-thumb"></div></div></div></div>`;
    }
    return `<div class="pfield">${label}<input class="mini-input" type="text" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',this.value)"></div>`;
}

function miniDeleteButton(node){
    return ['prompt','image'].includes(node.type) ? `<button class="mini-delete" type="button" onclick="removeMiniNode('${node.id}')" title="${escapeAttr(tr('common.delete'))}"><i data-lucide="x" class="w-3 h-3"></i></button>` : '';
}

function miniLineBetween(a, b){
    if(!a || !b) return '';
    const x1 = a.x + 230, y1 = a.y + 72, x2 = b.x, y2 = b.y + 72;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    const deg = Math.atan2(dy, dx) * 180 / Math.PI;
    return `<div class="mini-line" style="left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${deg}deg)"></div>`;
}

function addMiniNode(type){
    const count = miniTestNodes.filter(n => n.type === type).length;
    miniTestNodes.push({
        id:`${type}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
        type,
        x:42 + count * 26,
        y:type === 'prompt' ? 86 + count * 170 : 286 + count * 170,
        text:'',
        url:'',
        value:''
    });
    renderWorkspaceView();
}

function removeMiniNode(id){
    miniTestNodes = miniTestNodes.filter(n => n.id !== id);
    renderWorkspaceView();
}

function updateMiniNode(id, key, value){
    const node = miniTestNodes.find(n => n.id === id);
    if(node) node[key] = value;
}

async function pickMiniImage(nodeId){
    const input = document.createElement('input');
    input.type = 'file';
    const node = miniTestNodes.find(n => n.id === nodeId);
    input.accept = mediaAccept(node?.type || 'image');
    input.onchange = async () => {
        const file = input.files[0];
        if(!file) return;
        if(!node) return;
        if(node.url && node.url.startsWith('blob:')) URL.revokeObjectURL(node.url);
        node.url = URL.createObjectURL(file);
        node.name = file.name;
        renderWorkspaceView();
        const form = new FormData();
        form.append('files', file);
        try {
            const data = await fetch('/api/upload', { method:'POST', body:form }).then(r=>r.json());
            node.value = data.files?.[0]?.comfy_name || data.files?.[0]?.filename || file.name;
        } catch(e){ alert(mediaUploadFailedText(node.type)); }
    };
    input.click();
}

function bindMiniCanvas(){
    const canvas = document.getElementById('miniCanvas');
    const world = document.getElementById('miniWorld');
    if(!canvas || !world) return;
    const sync = () => { world.style.transform = `translate(${miniView.x}px,${miniView.y}px) scale(${miniView.k})`; };
    canvas.onwheel = e => {
        e.preventDefault();
        const old = miniView.k;
        const next = Math.max(0.45, Math.min(1.8, old * (e.deltaY > 0 ? 0.9 : 1.1)));
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        miniView.x = mx - (mx - miniView.x) * (next / old);
        miniView.y = my - (my - miniView.y) * (next / old);
        miniView.k = next;
        sync();
    };
    canvas.onmousedown = e => {
        if(e.target.closest('textarea,input,select,button,.mini-image-drop')) return;
        const card = e.target.closest('.mini-card');
        if(card && e.target.closest('.mini-card-head')){
            const id = card.dataset.node || card.dataset.card;
            const node = miniTestNodes.find(n => n.id === id);
            const pos = node || miniCards[id] || defaultMiniCards()[id];
            miniDrag = { type:'card', id, sx:e.clientX, sy:e.clientY, ox:pos.x, oy:pos.y };
        } else {
            miniDrag = { type:'pan', sx:e.clientX, sy:e.clientY, ox:miniView.x, oy:miniView.y };
            canvas.classList.add('is-panning');
        }
    };
    window.onmousemove = e => {
        if(!miniDrag) return;
        if(miniDrag.type === 'pan'){
            miniView.x = miniDrag.ox + e.clientX - miniDrag.sx;
            miniView.y = miniDrag.oy + e.clientY - miniDrag.sy;
            sync();
        } else {
            const dx = (e.clientX - miniDrag.sx) / miniView.k;
            const dy = (e.clientY - miniDrag.sy) / miniView.k;
            const node = miniTestNodes.find(n => n.id === miniDrag.id);
            if(node){
                node.x = miniDrag.ox + dx;
                node.y = miniDrag.oy + dy;
            } else {
                miniCards[miniDrag.id] = { x: miniDrag.ox + dx, y: miniDrag.oy + dy };
                currentConfig.mini_cards = miniCards;
            }
            const card = world.querySelector(`[data-node="${miniDrag.id}"],[data-card="${miniDrag.id}"]`);
            if(card){
                const p = node || miniCards[miniDrag.id];
                card.style.left = `${p.x}px`;
                card.style.top = `${p.y}px`;
            }
        }
    };
    window.onmouseup = () => {
        if(miniDrag?.type === 'pan') canvas.classList.remove('is-panning');
        const shouldRefresh = miniDrag?.type === 'card';
        miniDrag = null;
        if(shouldRefresh) renderWorkspaceView();
    };
}

async function pickImage(fieldId){
    const input = document.createElement('input');
    input.type = 'file';
    const field = currentConfig.fields.find(f => f.id === fieldId);
    const kind = fieldKind(field || {type:'image'});
    input.accept = mediaAccept(kind);
    input.onchange = async () => {
        const file = input.files[0];
        if(!file) return;
        // 先用本地 blob URL 立即显示缩略图
        if(previewImageUrls[fieldId]) URL.revokeObjectURL(previewImageUrls[fieldId]);
        previewImageUrls[fieldId] = URL.createObjectURL(file);
        renderPreview();
        // 再上传到 ComfyUI 拿到 comfy_name 作为运行时的实际值
        const form = new FormData();
        form.append('files', file);
        try {
            const data = await fetch('/api/upload', { method:'POST', body:form }).then(r=>r.json());
            const filename = data.files?.[0]?.comfy_name || data.files?.[0]?.filename || file.name;
            previewValues[fieldId] = filename;
        } catch(e){ alert(mediaUploadFailedText(kind)); }
    };
    input.click();
}

async function onRun(){
    if(!selectedName || !currentConfig) return;
    const btn = document.getElementById('runBtn');
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = tr('comfy.runningTest'); }
    setStatus(tr('comfy.runningTest'));
    try {
        const baseFields = workspaceMode === 'canvas' ? fieldsFromMiniCanvas() : {...previewValues};
        const runFields = applyActiveRandomValues(baseFields);
        const res = await fetch(`/api/workflows/${encodeURIComponent(selectedName)}/run`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ fields:runFields, config:currentConfig, client_id:'workflow-test' })
        });
        if(!res.ok) throw new Error((await res.json()).detail || tr('comfy.runFailed'));
        const data = await res.json();
        const result = runResultFromResponse(data);
        if(!result && data.error) throw new Error(data.error);
        runResult = result;
        renderPreview();
        renderWorkspaceView();
        setStatus(tr('comfy.runSuccess'));
    } catch(e){
        alert(e.message || tr('comfy.runFailed'));
        setStatus(tr('comfy.runFailed'));
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = tr('comfy.runTest'); }
    }
}

function fieldsFromMiniCanvas(){
    const fields = {...previewValues};
    const mediaKinds = ['image','video','audio'];
    const promptFields = currentConfig.fields.filter(f => fieldKind(f) === 'prompt');
    const prompt = miniTestNodes.filter(n => n.type === 'prompt').map(n => n.text || '').filter(Boolean).join('\n\n');
    mediaKinds.forEach(kind => {
        const mediaFields = currentConfig.fields.filter(f => fieldKind(f) === kind);
        const mediaNodes = miniTestNodes.filter(n => n.type === kind && n.value);
        mediaFields.forEach((f, i) => {
            fields[f.id] = mediaNodes[i]?.value || fields[f.id] || '';
        });
    });
    promptFields.forEach(f => {
        fields[f.id] = prompt || fields[f.id] || '';
    });
    return fields;
}

async function onUpload(event){
    const file = event.target.files[0];
    if(!file) return;
    event.target.value = '';
    try {
        const text = await file.text();
        let workflow;
        try { workflow = JSON.parse(text); }
        catch { alert(tr('comfy.invalidJson')); return; }
        const baseName = file.name.replace(/\.json$/i, '');
        const inputName = prompt(tr('comfy.namePrompt'), baseName);
        if(!inputName) return;
        const data = await fetch('/api/workflows', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ name:inputName, workflow })
        });
        const result = await data.json();
        if(!data.ok) throw new Error(result.detail || tr('comfy.uploadFailed'));
        await loadList();
        selectWorkflow(result.name);
        setStatus(tr('comfy.uploaded') + result.name);
        new BroadcastChannel('studio-api').postMessage({ type: 'workflows-changed' });
    } catch(e){ alert(e.message || tr('comfy.uploadFailed')); }
}

async function onSave(){
    if(!selectedName || !currentConfig) return;
    // 校验
    for(const f of currentConfig.fields){
        if(!f.name || !f.name.trim()){
            alert(tf('comfy.saveMissingName', {field:f.input})); return;
        }
    }
    setStatus(workspaceMode === 'native' ? '正在保存 ComfyUI 当前工作流...' : tr('comfy.saving'));
    try {
        const workflowSave = await saveNativeWorkflowContentToCurrent();
        const res = await fetch(`/api/workflows/${encodeURIComponent(selectedName)}/config`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(currentConfig)
        });
        if(!res.ok) throw new Error((await res.json()).detail || tr('comfy.saveFailed'));
        setStatus(workflowSave
            ? `已保存配置，并写回左侧工作流：${selectedName}${workflowSave.backup ? `（已备份 ${workflowSave.backup}）` : ''}`
            : tr('comfy.saved'));
        await loadList();
        new BroadcastChannel('studio-api').postMessage({ type: 'workflows-changed' });
    } catch(e){ alert(e.message || tr('comfy.saveFailed')); setStatus(tr('comfy.saveFailed')); }
}

async function onDelete(){
    if(!selectedName || isBuiltin) return;
    if(!confirm(tf('comfy.deleteConfirm', {name: currentConfig.title || selectedName}))) return;
    try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(selectedName)}`, { method:'DELETE' });
        if(!res.ok) throw new Error((await res.json()).detail || tr('comfy.deleteFailed'));
        selectedName = '';
        currentWorkflow = null;
        currentConfig = null;
        renderEditor();
        renderPreview();
        renderWorkspaceView();
        await loadList();
        new BroadcastChannel('studio-api').postMessage({ type: 'workflows-changed' });
    } catch(e){ alert(e.message || tr('comfy.deleteFailed')); }
}

window.addEventListener('message', event => {
    if(event.data?.type === 'studio-theme' && window.StudioTheme) window.StudioTheme.set(event.data.theme);
    if(event.data?.type === 'studio-lang' && window.StudioI18n) window.StudioI18n.set(event.data.lang);
});
window.addEventListener('studio-lang-change', refreshLanguageView);

document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    if(window.StudioI18n) StudioI18n.apply();
    loadList();
    loadComfyInstances();
    loadComfyDir();
    loadConnRunning();
});

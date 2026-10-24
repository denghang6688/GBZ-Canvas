// canvas-list.js — Project Workspace.
// Two-pane: LEFT project list, RIGHT pannable/zoomable board of canvas cards.
// Self-contained; relies only on global fetch / StudioI18n / lucide.

/* ===== Small helpers (copied from the previous gate file) ===== */
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function tr(key){ return window.StudioI18n ? StudioI18n.t(key) : key; }
function langIsEn(){ return window.StudioI18n?.lang?.() === 'en'; }
function escapeHtml(str){ return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(str){ return escapeHtml(str); }
function L(zh, en){ return langIsEn() ? en : zh; }
function compactLabel(fullZh, compactZh, en){ return window.innerWidth <= 760 ? L(compactZh, en) : L(fullZh, en); }
const CANVAS_LIST_PROJECT_KEY = 'canvasListCurrentProjectId';
const WORKFLOW_NAV_CATEGORY_LABELS = {
    recommended:'推荐',
    brand:'品牌',
    ecommerce:'电商',
    film:'影视',
    photo:'摄影',
    design:'设计',
    car:'汽车',
    acg:'ACG',
    cosplay:'COSPLAY',
    other:'其他'
};
const WORKFLOW_NAV_CATEGORY_OPTIONS = [
    {value:'recommended', label:'推荐'},
    {value:'brand', label:'品牌'},
    {value:'ecommerce', label:'电商'},
    {value:'film', label:'影视'},
    {value:'photo', label:'摄影'},
    {value:'design', label:'设计'},
    {value:'car', label:'汽车'},
    {value:'acg', label:'ACG'},
    {value:'cosplay', label:'COSPLAY'},
    {value:'other', label:'其他'}
];
const WORKFLOW_NAV_CATEGORY_LABEL_MAP = Object.fromEntries(WORKFLOW_NAV_CATEGORY_OPTIONS.map(item => [item.value, item.label]));

function workflowNavSavedMatchesCategory(item, category){
    if(!category || category === 'all') return true;
    if(String(category).startsWith('wfcat:')){
        return String(item?.category_id || '') === String(category).slice(6);
    }
    const label = WORKFLOW_NAV_CATEGORY_LABEL_MAP[category] || WORKFLOW_NAV_CATEGORY_LABELS[category] || '';
    const keys = [category, label].filter(Boolean).map(text => String(text).toLowerCase());
    const haystack = `${item?.category_name || ''} ${(item?.tags || []).join(' ')} ${item?.name || ''}`.toLowerCase();
    return keys.some(key => haystack.includes(key));
}

function workflowNavAssetCategories(){
    const libs = Array.isArray(workflowNavAssetLibrary.libraries) && workflowNavAssetLibrary.libraries.length
        ? workflowNavAssetLibrary.libraries
        : [{id:'default', name:'默认资产库', categories:workflowNavAssetLibrary.categories || []}];
    return libs.flatMap(lib => (lib.categories || [])
        .filter(cat => (cat.type || 'image') === 'workflow')
        .map(cat => ({...cat, __libraryId:lib.id || ''})));
}

function workflowNavBuiltinCategoryPrefs(){
    // 与素材库 asset-manager.js 共用同一个 localStorage key：
    // 用户在素材库删除/改名内置工作流分类后，弹窗分类实时保持一致。
    try {
        const data = JSON.parse(localStorage.getItem('asset_manager_workflow_builtin_category_prefs_v1') || '{}');
        return data && typeof data === 'object' ? {
            hidden: Array.isArray(data.hidden) ? data.hidden.map(String) : [],
            labels: data.labels && typeof data.labels === 'object' ? data.labels : {}
        } : {hidden:[], labels:{}};
    } catch(_) {
        return {hidden:[], labels:{}};
    }
}

function renderWorkflowNavCategories(){
    const wrap = workflowNavPanel?.querySelector('.workflow-nav-cats');
    if(!wrap) return;
    // 2026-09-20 分类与素材库「工作流」分组对应：
    // 内置分类读取素材库同一份删除/改名记录（localStorage），库里删除的不显示；
    // 再拼上资产库里的真实工作流分类（重名去重）。
    const cats = workflowNavAssetCategories();
    const prefs = workflowNavBuiltinCategoryPrefs();
    const hidden = new Set(prefs.hidden || []);
    const labels = prefs.labels || {};
    const builtins = WORKFLOW_NAV_CATEGORY_OPTIONS
        .filter(item => !hidden.has(item.value))
        .map(item => ({value:item.value, label:String(labels[item.value] || item.label)}));
    const realKeys = new Set(cats.map(cat => String(cat.name || '').trim().toLowerCase()));
    const values = new Set(['all', ...builtins.map(item => item.value), ...cats.map(cat => `wfcat:${cat.id || ''}`)]);
    if(!values.has(workflowNavCategory)) workflowNavCategory = 'all';
    wrap.innerHTML = [
        `<button class="${workflowNavCategory === 'all' ? 'active' : ''}" type="button" data-workflow-nav-category="all">全部</button>`,
        ...builtins.filter(item => !realKeys.has(item.label.toLowerCase()) && !realKeys.has(item.value.toLowerCase()))
            .map(item => `<button class="${workflowNavCategory === item.value ? 'active' : ''}" type="button" data-workflow-nav-category="${escapeAttr(item.value)}">${escapeHtml(item.label)}</button>`),
        ...cats.map(cat => {
            const value = `wfcat:${cat.id || ''}`;
            return `<button class="${workflowNavCategory === value ? 'active' : ''}" type="button" data-workflow-nav-category="${escapeAttr(value)}">${escapeHtml(cat.name || '工作流')}</button>`;
        })
    ].join('');
    refreshIcons();
}

function canvasListOriginalMediaUrl(itemOrUrl){
    const raw = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl?.url || '');
    const text = String(raw || '');
    if(!text) return '';
    try {
        const parsed = new URL(text, window.location.origin);
        if(parsed.pathname === '/api/media-preview') return parsed.searchParams.get('url') || text;
    } catch(e) {}
    return text;
}

function canvasListMediaPreviewUrl(itemOrUrl, size=640){
    const raw = canvasListOriginalMediaUrl(itemOrUrl);
    if(!raw || /^data:image\//i.test(raw)) return raw;
    const width = Math.max(96, Math.min(1600, Number(size) || 640));
    return `/api/media-preview?w=${width}&url=${encodeURIComponent(raw)}`;
}

function workflowCoverImageUrlFromItem(item, options={}){
    const seen = new Set();
    const imageUrl = value => {
        let url = typeof value === 'string' ? value : (value?.url || value?.src || value?.path || value?.uri || '');
        if(typeof value === 'string'){
            const match = value.match(/(?:^|[;{,\s])url=([^;}]+)/i);
            if(match?.[1]) url = match[1].trim();
        }
        if(!url) return '';
        try {
            const parsed = new URL(url, window.location.origin);
            if(parsed.pathname === '/api/media-preview' && parsed.searchParams.get('url')){
                url = parsed.searchParams.get('url') || url;
            }
        } catch(e) {}
        const clean = String(url).split('#')[0].split('?')[0];
        if(/^data:image\//i.test(url)) return url;
        if(/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(clean)) return url;
        return '';
    };
    const scan = value => {
        if(!value || seen.has(value)) return '';
        if(typeof value === 'object') seen.add(value);
        const directUrl = imageUrl(value);
        if(directUrl) return directUrl;
        if(Array.isArray(value)){
            for(const child of value){
                const found = scan(child);
                if(found) return found;
            }
            return '';
        }
        if(typeof value !== 'object') return '';
        const priorityKeys = ['images','resources','assets','items','nodes','workflow','payload','data'];
        for(const key of priorityKeys){
            const found = scan(value[key]);
            if(found) return found;
        }
        return '';
    };
    if(options.preferSource){
        const source = scan(item);
        if(source) return source;
        seen.clear();
    }
    const direct = [item?.cover, item?.cover_data, item?.coverData, item?.cover_url, item?.coverUrl, item?.thumbnail, item?.thumb, item?.preview, item?.image]
        .map(imageUrl)
        .find(Boolean);
    if(direct) return direct;
    return scan(item);
}

function canvasListLaunchParams(){
    try { return new URLSearchParams(window.location.search); }
    catch(e){ return new URLSearchParams(); }
}

function shouldOpenWorkflowNavOnBoot(){
    return canvasListLaunchParams().get('openWorkflowNav') === '1';
}

function shouldOpenProjectOverviewOnBoot(){
    return canvasListLaunchParams().get('overview') === '1';
}

function shouldOpenProjectBoardOnBoot(){
    const params = canvasListLaunchParams();
    return params.has('project') && params.get('overview') !== '1';
}

function rememberedProjectId(){
    try {
        return canvasListLaunchParams().get('project') || localStorage.getItem(CANVAS_LIST_PROJECT_KEY) || 'default';
    } catch(e){
        return 'default';
    }
}

function rememberProjectId(pid){
    if(!pid) return;
    try { localStorage.setItem(CANVAS_LIST_PROJECT_KEY, pid); } catch(e){}
}

function formatCanvasTime(value){
    if(!value) return '--';
    const raw = Number(value);
    const time = raw < 10000000000 ? raw * 1000 : raw;
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString(langIsEn() ? 'en-US' : 'zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function renderCanvasIcon(icon, size = 16){
    if(!icon || icon === '🧩') return `<i data-lucide="sparkles" style="width:${size}px;height:${size}px"></i>`;
    if(/[^\x00-\x7F]/.test(icon)) return escapeHtml(icon);
    return `<i data-lucide="${escapeHtml(icon)}" style="width:${size}px;height:${size}px"></i>`;
}

/* ===== DOM refs ===== */
const board = document.getElementById('board');
const boardWorld = document.getElementById('boardWorld');
const boardEmptyHint = document.getElementById('boardEmptyHint');
const projectOverview = document.getElementById('projectOverview');
const projectOverviewGrid = document.getElementById('projectOverviewGrid');
const projectOverviewCreateBtn = document.getElementById('projectOverviewCreateBtn');
const boardProjectName = document.getElementById('boardProjectName');
const boardCanvasCount = document.getElementById('boardCanvasCount');
const projectListEl = document.getElementById('projectList');
const trashEntryBtn = document.getElementById('trashEntry');
const trashBadge = document.getElementById('trashBadge');
const trashPanel = document.getElementById('trashPanel');
const trashListEl = document.getElementById('trashList');
const trashCloseBtn = document.getElementById('trashClose');
const trashEditToggleBtn = document.getElementById('trashEditToggle');
const trashSelectAllBtn = document.getElementById('trashSelectAll');
const trashDeleteSelectedBtn = document.getElementById('trashDeleteSelected');
const trashClearAllBtn = document.getElementById('trashClearAll');
const trashBulkCount = document.getElementById('trashBulkCount');
const newProjectBtn = document.getElementById('newProjectBtn');
const newProjectRow = document.getElementById('newProjectRow');
const newProjectInput = document.getElementById('newProjectInput');
const newProjectConfirm = document.getElementById('newProjectConfirm');
const newProjectCancel = document.getElementById('newProjectCancel');
const backProjectsBtn = document.getElementById('backProjectsBtn');
const canvasTopBackBtn = document.getElementById('canvasTopBackBtn');
const overviewNewProjectBtn = document.getElementById('overviewNewProjectBtn');
const newCanvasBtn = document.getElementById('newCanvasBtn');
const boardRefreshBtn = document.getElementById('boardRefresh');
const boardResetViewBtn = document.getElementById('boardResetView');
const pasteCanvasBtn = document.getElementById('pasteCanvasBtn');
const emptyCreateCanvasBtn = document.getElementById('emptyCreateCanvasBtn');
const statusEl = document.getElementById('boardStatus');
const boardZoomOutBtn = document.getElementById('boardZoomOut');
const boardZoomInBtn = document.getElementById('boardZoomIn');
const boardFitViewBtn = document.getElementById('boardFitView');
const boardMapToggleBtn = document.getElementById('boardMapToggle');
const boardZoomRange = document.getElementById('boardZoomRange');
const boardMinimap = document.getElementById('boardMinimap');
const boardHelpBtn = document.getElementById('boardHelp');
const workflowNavPanel = document.getElementById('workflowNavPanel');
const workflowNavCloseBtn = document.getElementById('workflowNavClose');
const workflowNavGrid = document.getElementById('workflowNavGrid');
const workflowNavSearch = document.getElementById('workflowNavSearch');

/* ===== State ===== */
let projects = [];
let canvases = [];          // all canvases across projects
let deletedCanvases = [];
let trashEditMode = false;
let trashSelectedIds = new Set();
let currentProjectId = rememberedProjectId();
let projectOverviewMode = !shouldOpenProjectBoardOnBoot();
let pendingDeleteProjectId = null;
let statusTimer = null;
let clipboardCanvasId = null;   // 剪切的画布（切到别的项目后粘贴）
let workflowNavOpen = false;
let workflowNavLoading = false;
let workflowNavLoaded = false;
let workflowNavWorkflows = [];
let workflowNavAssetLibrary = {libraries:[], categories:[]};
let workflowNavTab = 'mine';
let workflowNavCategory = 'all';
let workflowNavQuery = '';
let workflowNavConfirmEl = null;
let boardMinimapOpen = false;

// board viewport (mirrors smart-canvas math)
const viewport = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.3, MAX_SCALE = 2;

/* ===== Status toast ===== */
function setStatus(text){
    if(!statusEl) return;
    if(!text){ statusEl.classList.remove('show'); return; }
    statusEl.textContent = text;
    statusEl.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2200);
}

/* ===== Viewport math (mirrors smart-canvas.js) ===== */
function applyViewport(){
    boardWorld.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    board.style.backgroundSize = `${120 * viewport.scale}px ${120 * viewport.scale}px, ${120 * viewport.scale}px ${120 * viewport.scale}px, ${24 * viewport.scale}px ${24 * viewport.scale}px`;
    board.style.backgroundPosition = `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`;
    if(boardZoomRange) boardZoomRange.value = String(Math.round(viewport.scale * 100));
    if(boardMinimapOpen) renderBoardMinimap();
}
function screenToWorld(clientX, clientY){
    const rect = board.getBoundingClientRect();
    return {
        x: (clientX - rect.left - viewport.x) / viewport.scale,
        y: (clientY - rect.top - viewport.y) / viewport.scale
    };
}
function boardCenterWorld(){
    return {
        x: (board.clientWidth / 2 - viewport.x) / viewport.scale,
        y: (board.clientHeight / 2 - viewport.y) / viewport.scale
    };
}
function resetView(){
    const cards = Array.from(boardWorld.querySelectorAll('.ws-card'));
    if(!cards.length){
        viewport.x = 0; viewport.y = 0; viewport.scale = 1; applyViewport();
        return;
    }
    const bounds = cards.reduce((acc, el) => {
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 248;
        const h = el.offsetHeight || 150;
        acc.minX = Math.min(acc.minX, x);
        acc.minY = Math.min(acc.minY, y);
        acc.maxX = Math.max(acc.maxX, x + w);
        acc.maxY = Math.max(acc.maxY, y + h);
        return acc;
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const padding = board.clientWidth < 640 ? 20 : 40;
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const fitScale = Math.min(1, (board.clientWidth - padding * 2) / width, (board.clientHeight - padding * 2) / height);
    viewport.scale = board.clientWidth < 640 ? 1 : Math.min(MAX_SCALE, Math.max(0.9, fitScale));
    const fitsX = width * viewport.scale <= board.clientWidth - padding * 2;
    const fitsY = height * viewport.scale <= board.clientHeight - padding * 2;
    viewport.x = Math.round((fitsX ? (board.clientWidth - width * viewport.scale) / 2 : padding) - bounds.minX * viewport.scale);
    viewport.y = Math.round((fitsY ? Math.max(padding, (board.clientHeight - height * viewport.scale) / 2) : padding) - bounds.minY * viewport.scale);
    applyViewport();
}
function setBoardZoom(nextScale, anchorClientX = board.clientWidth / 2, anchorClientY = board.clientHeight / 2){
    const old = viewport.scale || 1;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(nextScale) || 1));
    const rect = board.getBoundingClientRect();
    const ax = anchorClientX - rect.left;
    const ay = anchorClientY - rect.top;
    const worldX = (ax - viewport.x) / old;
    const worldY = (ay - viewport.y) / old;
    viewport.scale = scale;
    viewport.x = ax - worldX * scale;
    viewport.y = ay - worldY * scale;
    applyViewport();
}
function stepBoardZoom(direction){
    const factor = direction > 0 ? 1.16 : 1 / 1.16;
    setBoardZoom(viewport.scale * factor);
}
function renderBoardMinimap(){
    if(!boardMinimap) return;
    const cards = Array.from(boardWorld.querySelectorAll('.ws-card'));
    if(!cards.length){
        boardMinimap.innerHTML = '<div class="gbz-minimap-empty">暂无节点</div>';
        return;
    }
    const bounds = cards.reduce((acc, el) => {
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 248;
        const h = el.offsetHeight || 150;
        acc.minX = Math.min(acc.minX, x);
        acc.minY = Math.min(acc.minY, y);
        acc.maxX = Math.max(acc.maxX, x + w);
        acc.maxY = Math.max(acc.maxY, y + h);
        return acc;
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const pad = 12;
    const mapW = boardMinimap.clientWidth || 220;
    const mapH = boardMinimap.clientHeight || 150;
    const worldW = Math.max(1, bounds.maxX - bounds.minX);
    const worldH = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min((mapW - pad * 2) / worldW, (mapH - pad * 2) / worldH);
    const offsetX = (mapW - worldW * scale) / 2;
    const offsetY = (mapH - worldH * scale) / 2;
    const cardHtml = cards.map(el => {
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 248;
        const h = el.offsetHeight || 150;
        return `<span class="gbz-minimap-card" style="left:${offsetX + (x - bounds.minX) * scale}px;top:${offsetY + (y - bounds.minY) * scale}px;width:${Math.max(4, w * scale)}px;height:${Math.max(4, h * scale)}px"></span>`;
    }).join('');
    const viewLeft = offsetX + ((-viewport.x / viewport.scale) - bounds.minX) * scale;
    const viewTop = offsetY + ((-viewport.y / viewport.scale) - bounds.minY) * scale;
    const viewW = (board.clientWidth / viewport.scale) * scale;
    const viewH = (board.clientHeight / viewport.scale) * scale;
    boardMinimap.innerHTML = `${cardHtml}<span class="gbz-minimap-viewport" style="left:${viewLeft}px;top:${viewTop}px;width:${viewW}px;height:${viewH}px"></span>`;
}
function toggleBoardMinimap(force){
    boardMinimapOpen = typeof force === 'boolean' ? force : !boardMinimapOpen;
    boardMinimap?.classList.toggle('open', boardMinimapOpen);
    boardMapToggleBtn?.classList.toggle('active', boardMinimapOpen);
    if(boardMinimapOpen) renderBoardMinimap();
}

/* ===== Board pan & zoom ===== */
let panState = null;
function onBoardPanStart(e){
    if(e.button !== 0) return;
    if(e.target.closest('.ws-card') || e.target.closest('.ws-create-card') || e.target.closest('.ws-card-pop') || e.target.closest('button,input,textarea,select')) return;
    closeCardMenu();
    panState = { startX: e.clientX, startY: e.clientY, ox: viewport.x, oy: viewport.y, moved: false };
    board.classList.add('panning');
}
function onBoardPanMove(e){
    if(!panState) return;
    viewport.x = panState.ox + (e.clientX - panState.startX);
    viewport.y = panState.oy + (e.clientY - panState.startY);
    if(Math.abs(e.clientX - panState.startX) > 3 || Math.abs(e.clientY - panState.startY) > 3) panState.moved = true;
    applyViewport();
}
function onBoardPanEnd(){
    if(!panState) return;
    panState = null;
    board.classList.remove('panning');
}
function onBoardWheel(e){
    e.preventDefault();
    const rect = board.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    // world point under cursor before zoom
    const wx = (px - viewport.x) / viewport.scale;
    const wy = (py - viewport.y) / viewport.scale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * factor));
    viewport.scale = next;
    // keep the same world point under the cursor
    viewport.x = px - wx * next;
    viewport.y = py - wy * next;
    applyViewport();
}

/* ===== Data loading ===== */
function currentProject(){ return projects.find(p => p.id === currentProjectId) || projects[0] || null; }
function canvasesInProject(pid){ return canvases.filter(c => (c.project || 'default') === pid); }

async function loadAll(){
    try {
        const [pRes, cRes] = await Promise.all([
            fetch('/api/projects'),
            fetch('/api/canvases')
        ]);
        const pData = pRes.ok ? await pRes.json() : { projects: [] };
        const cData = cRes.ok ? await cRes.json() : { canvases: [] };
        projects = (pData.projects || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        if(!projects.length) projects = [{ id: 'default', name: L('默认项目','Default'), order: 0, canvas_count: 0 }];
        canvases = cData.canvases || [];
        // pick first project (prefer default / order 0)
        if(!projects.find(p => p.id === currentProjectId)){
            const def = projects.find(p => p.id === 'default') || projects.slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0];
            currentProjectId = def ? def.id : 'default';
        }
        rememberProjectId(currentProjectId);
        renderProjects();
        setProjectOverviewMode(projectOverviewMode);
        refreshTrashCount();
        hydrateCanvasPreviewCovers();
    } catch(e){
        console.error(e);
        setStatus(L('加载失败','Load failed'));
    }
}

function projectCanvasCount(pid){
    const p = projects.find(x => x.id === pid);
    // prefer live count from canvases array; fall back to server count
    const live = canvasesInProject(pid).length;
    return canvases.length ? live : (p?.canvas_count || 0);
}

function projectLatestTime(pid){
    const items = canvasesInProject(pid);
    const latestCanvas = Math.max(0, ...items.map(c => Number(c.updated_at || c.created_at || 0)));
    const p = projects.find(x => x.id === pid);
    return Math.max(latestCanvas, Number(p?.updated_at || p?.created_at || 0));
}

function canvasCoverUrl(canvas){
    return canvas?.cover_url || canvas?.cover || canvas?.thumbnail || canvas?.preview || canvas?.image || canvas?._previewCover || '';
}

function canvasPreviewImageSources(canvas, size=520){
    const cover = canvasCoverUrl(canvas);
    if(!cover) return {cover:'', preview:'', original:''};
    const original = canvasListOriginalMediaUrl(cover);
    const preview = canvasListMediaPreviewUrl({...canvas, url:cover}, size);
    return {cover, preview, original};
}

function canvasPreviewImgHtml(canvas, size=520){
    const sources = canvasPreviewImageSources(canvas, size);
    if(!sources.preview) return '';
    const title = canvas?.title || 'Canvas';
    return `<img class="canvas-preview-img" src="${escapeAttr(sources.preview)}" data-preview-src="${escapeAttr(sources.preview)}" data-original-src="${escapeAttr(sources.original)}" data-preview-retry="0" alt="${escapeAttr(title)}" onload="canvasListHandlePreviewLoad(this)" onerror="canvasListHandlePreviewError(this)">`;
}

function canvasListPreviewRetryUrl(src, retry){
    if(!src || /^data:image\//i.test(src)) return src || '';
    const joiner = src.includes('?') ? '&' : '?';
    return `${src}${joiner}_preview_retry=${Date.now()}_${retry || 0}`;
}

function canvasListHandlePreviewLoad(img){
    const wrap = img?.closest?.('.ws-card-cover,.project-overview-thumb');
    img?.classList?.remove('is-pending', 'is-failed');
    if(wrap){
        wrap.classList.remove('is-loading', 'is-retrying', 'is-failed');
        wrap.classList.add('has-image');
    }
}

function canvasListHandlePreviewError(img){
    if(!img) return;
    const wrap = img.closest('.ws-card-cover,.project-overview-thumb');
    const retry = Number(img.dataset.previewRetry || 0);
    const preview = img.dataset.previewSrc || '';
    const original = img.dataset.originalSrc || '';
    img.classList.add('is-pending');
    if(wrap){
        wrap.classList.add('is-loading', 'is-retrying');
        wrap.classList.remove('is-failed');
    }
    if(retry >= 5){
        img.classList.add('is-failed');
        if(wrap){
            wrap.classList.remove('is-loading', 'is-retrying');
            wrap.classList.add('is-failed');
        }
        return;
    }
    const delay = [300, 800, 1600, 2800, 4200][retry] || 5000;
    window.setTimeout(() => {
        if(!img.isConnected) return;
        const nextRetry = retry + 1;
        img.dataset.previewRetry = String(nextRetry);
        const useOriginal = retry === 0 && original && original !== preview && !/^data:image\//i.test(original);
        img.src = canvasListPreviewRetryUrl(useOriginal ? original : preview, nextRetry);
    }, delay);
}

function canvasCardCoverHtml(canvas){
    const img = canvasPreviewImgHtml(canvas, 520);
    return img
        ? `<div class="ws-card-cover has-image is-loading">${img}</div>`
        : `<div class="ws-card-cover empty"><i data-lucide="image"></i></div>`;
}

function updateCanvasPreviewElements(canvas){
    if(!canvas?.id || !canvasCoverUrl(canvas)) return;
    const card = boardWorld?.querySelector?.(`.ws-card[data-canvas-id="${CSS.escape(canvas.id)}"]`);
    const cardCover = card?.querySelector?.('.ws-card-cover');
    if(cardCover){
        cardCover.outerHTML = canvasCardCoverHtml(canvas);
    }
    document.querySelectorAll(`.project-overview-thumb[data-canvas-id="${CSS.escape(canvas.id)}"]`).forEach(thumb => {
        thumb.outerHTML = canvasPreviewThumbHtml(canvas);
    });
    refreshIcons();
}

function canvasPreviewThumbHtml(canvas, index=0){
    const cover = canvasCoverUrl(canvas);
    if(cover){
        return `<span class="project-overview-thumb has-image is-loading" data-canvas-id="${escapeAttr(canvas.id || '')}" title="${escapeAttr(canvas.title || 'Canvas')}">
            ${canvasPreviewImgHtml(canvas, 420)}
        </span>`;
    }
    const label = (canvas.title || L('未命名画布','Untitled')).slice(0, 8);
    return `<span class="project-overview-thumb empty" data-canvas-id="${escapeAttr(canvas.id || '')}" title="${escapeAttr(canvas.title || 'Canvas')}"><strong>${escapeHtml(label)}</strong></span>`;
}

let canvasPreviewHydrating = false;
async function hydrateCanvasPreviewCovers(){
    if(canvasPreviewHydrating) return;
    const targets = canvases
        .filter(c => c?.id && !canvasCoverUrl(c))
        .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))
        .slice(0, 80);
    if(!targets.length) return;
    canvasPreviewHydrating = true;
    let changed = false;
    try {
        const workers = Array.from({length:Math.min(5, targets.length)}, async (_, workerIndex) => {
            for(let i = workerIndex; i < targets.length; i += 5){
                const canvas = targets[i];
                try {
                    const res = await fetch(`/api/canvases/${encodeURIComponent(canvas.id)}`);
                    if(!res.ok) continue;
                    const data = await res.json();
                    const detail = data.canvas || data;
                    const cover = workflowCoverImageUrlFromItem(detail);
                    if(cover){
                        canvas._previewCover = cover;
                        changed = true;
                        updateCanvasPreviewElements(canvas);
                    }
                    if(detail?.node_count != null) canvas.node_count = detail.node_count;
                } catch(e) {}
            }
        });
        await Promise.all(workers);
    } finally {
        canvasPreviewHydrating = false;
    }
    if(changed){
        if(projectOverviewMode) renderProjectOverview();
        else renderBoard();
    }
}

function setProjectOverviewMode(active){
    projectOverviewMode = !!active;
    document.body.classList.toggle('project-overview-mode', projectOverviewMode);
    closeCardMenu();
    closeCreateCard();
    closeTrashView();
    if(projectOverviewMode){
        updateBoardHeader();
        renderProjects();
        renderProjectOverview();
    } else {
        renderProjects();
        renderBoard();
        resetView();
    }
    refreshIcons();
}

function returnProjectOverview(){
    setProjectOverviewMode(true);
    setStatus('');
}

function enterProject(pid){
    currentProjectId = pid || currentProjectId || 'default';
    rememberProjectId(currentProjectId);
    setProjectOverviewMode(false);
}

function renderProjectOverview(){
    if(!projectOverviewGrid) return;
    const sorted = projects.slice().sort((a, b) => {
        if(a.id === 'default') return -1;
        if(b.id === 'default') return 1;
        return projectLatestTime(b.id) - projectLatestTime(a.id);
    });
    const cards = sorted.map(p => {
        const items = canvasesInProject(p.id)
            .slice()
            .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0));
        const count = items.length;
        const latest = projectLatestTime(p.id);
        const previewItems = items.slice(0, 4);
        const previews = previewItems.map((c, index) => canvasPreviewThumbHtml(c, index)).join('');
        const isDefault = p.id === 'default';
        const confirmDelete = pendingDeleteProjectId === p.id;
        return `<div class="project-overview-card" role="button" tabindex="0" data-project-id="${escapeAttr(p.id)}">
            <span class="project-overview-card-icon"><i data-lucide="${isDefault ? 'folder' : 'folder-open'}"></i></span>
            <span class="project-overview-actions">
                <button class="project-overview-action rename" type="button" title="${L('重命名项目','Rename project')}" aria-label="${L('重命名项目','Rename project')}" data-project-rename="${escapeAttr(p.id)}"><i data-lucide="pencil"></i></button>
                ${isDefault ? '' : `<button class="project-overview-action danger" type="button" title="${L('删除项目','Delete project')}" aria-label="${L('删除项目','Delete project')}" data-project-delete="${escapeAttr(p.id)}"><i data-lucide="trash-2"></i></button>`}
            </span>
            <span class="project-overview-card-main">
                <strong class="project-overview-title">${escapeHtml(p.name || '未命名项目')}</strong>
                <em>${count} ${L('张画布','canvases')} · ${latest ? formatCanvasTime(latest) : L('暂无更新','No updates')}</em>
            </span>
            <span class="project-overview-preview ${previews ? '' : 'empty'}">${previews || L('进入项目后新建第一张画布','Open to create the first canvas')}</span>
            ${confirmDelete ? `<span class="project-overview-delete-confirm">
                <strong>删除「${escapeHtml(p.name || '未命名项目')}」？</strong>
                <em>项目内 ${count} 张画布将移入回收站。</em>
                <span>
                    <button type="button" class="danger" data-project-delete-confirm="${escapeAttr(p.id)}">删除</button>
                    <button type="button" data-project-delete-cancel>取消</button>
                </span>
            </span>` : ''}
        </div>`;
    }).join('');
    projectOverviewGrid.innerHTML = cards;
    refreshIcons();
}

/* ===== Project sidebar rendering ===== */
function renderProjects(){
    projectListEl.innerHTML = '';
    projects.forEach(p => {
        if(pendingDeleteProjectId === p.id){
            const box = document.createElement('div');
            box.className = 'ws-project-confirm';
            box.innerHTML = `
                <div class="ws-project-confirm-title">${L('删除项目','Delete project')}「${escapeHtml(p.name)}」？${L('其画布将移回默认项目。','Canvases move back to Default.')}</div>
                <div class="ws-project-confirm-actions">
                    <button class="ws-confirm-btn" type="button">${L('删除','Delete')}</button>
                    <button class="ws-cancel-btn" type="button">${L('取消','Cancel')}</button>
                </div>`;
            box.querySelector('.ws-confirm-btn').onclick = () => deleteProject(p.id);
            box.querySelector('.ws-cancel-btn').onclick = () => { pendingDeleteProjectId = null; renderProjects(); };
            projectListEl.appendChild(box);
            return;
        }
        const row = document.createElement('div');
        row.className = 'ws-project-row' + (p.id === currentProjectId ? ' active' : '');
        row.dataset.projectId = p.id;
        const count = projectCanvasCount(p.id);
        const isDefault = p.id === 'default';
        row.innerHTML = `
            <span class="ws-project-icon"><i data-lucide="${isDefault ? 'folder' : 'folder-open'}" class="w-4 h-4"></i></span>
            <span class="ws-project-name">${escapeHtml(p.name)}</span>
            <span class="ws-project-count">${count}</span>
            <span class="ws-project-actions">
                <button class="ws-proj-act rename" type="button" title="${L('重命名','Rename')}" aria-label="${L('重命名','Rename')}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                ${isDefault ? '' : `<button class="ws-proj-act del" type="button" title="${L('删除','Delete')}" aria-label="${L('删除','Delete')}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`}
            </span>`;
        row.onclick = e => {
            if(e.target.closest('.ws-proj-act')) return;
            selectProject(p.id);
        };
        const renameBtn = row.querySelector('.ws-proj-act.rename');
        if(renameBtn) renameBtn.onclick = e => { e.stopPropagation(); startProjectRename(p.id, row); };
        const delBtn = row.querySelector('.ws-proj-act.del');
        if(delBtn) delBtn.onclick = e => { e.stopPropagation(); pendingDeleteProjectId = p.id; renderProjects(); };
        projectListEl.appendChild(row);
    });
    refreshIcons();
}

function selectProject(pid){
    if(pid === currentProjectId && !trashPanel.classList.contains('active')) return;
    currentProjectId = pid;
    rememberProjectId(pid);
    closeTrashView();
    projectOverviewMode = false;
    document.body.classList.remove('project-overview-mode');
    renderProjects();
    renderBoard();
    resetView();
}

function startProjectRename(pid, row){
    const p = projects.find(x => x.id === pid);
    if(!p) return;
    const nameEl = row.querySelector('.ws-project-name');
    if(!nameEl || nameEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 60; input.value = p.name;
    input.className = 'ws-project-name-input';
    nameEl.replaceWith(input);
    input.focus(); input.select();
    input.onclick = e => e.stopPropagation();
    let done = false;
    const finish = commit => {
        if(done) return; done = true;
        const v = input.value.trim();
        if(commit && v && v !== p.name) renameProject(pid, v);
        else renderProjects();
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}

function startProjectOverviewRename(pid, card){
    const p = projects.find(x => x.id === pid);
    if(!p || !card) return;
    const titleEl = card.querySelector('.project-overview-title');
    if(!titleEl || card.querySelector('.project-overview-name-input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.value = p.name || '';
    input.className = 'project-overview-name-input';
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    input.onclick = e => e.stopPropagation();
    input.onmousedown = e => e.stopPropagation();
    let done = false;
    const finish = commit => {
        if(done) return;
        done = true;
        const v = input.value.trim();
        if(commit && v && v !== p.name) renameProject(pid, v);
        else renderProjectOverview();
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}

/* ===== Project CRUD ===== */
function openNewProject(){
    if(projectOverviewMode){
        const name = window.prompt(L('项目名称','Project name'), '');
        if(name === null) return;
        createProjectWithName(name);
        return;
    }
    newProjectRow.classList.add('active');
    newProjectInput.value = '';
    newProjectInput.focus();
}
function closeNewProject(){
    newProjectRow.classList.remove('active');
    newProjectInput.value = '';
}
async function createProjectWithName(rawName=''){
    const name = String(rawName || '').trim() || L('新项目','New project');
    closeNewProject();
    try {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if(!res.ok) throw new Error('create project failed');
        const data = await res.json();
        const proj = data.project;
        if(proj){
            projects.push(proj);
            projects.sort((a, b) => (a.order || 0) - (b.order || 0));
            currentProjectId = proj.id;
            rememberProjectId(proj.id);
            renderProjects();
            if(projectOverviewMode) renderProjectOverview();
            else selectProject(proj.id);
        }
    } catch(e){
        console.error(e); setStatus(L('创建项目失败','Create project failed'));
    }
}
async function createProject(){
    await createProjectWithName(newProjectInput.value);
}
async function renameProject(pid, name){
    const p = projects.find(x => x.id === pid);
    if(p) p.name = name;
    renderProjects();
    if(projectOverviewMode) renderProjectOverview();
    if(pid === currentProjectId) updateBoardHeader();
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if(!res.ok) throw new Error('rename project failed');
    } catch(e){ console.error(e); setStatus(L('重命名失败','Rename failed')); loadAll(); }
}
async function deleteProject(pid){
    pendingDeleteProjectId = null;
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}`, { method: 'DELETE' });
        if(!res.ok) throw new Error('delete project failed');
        // canvases of deleted project move back to default
        canvases.forEach(c => { if((c.project || 'default') === pid) c.project = 'default'; });
        projects = projects.filter(p => p.id !== pid);
        if(currentProjectId === pid) currentProjectId = 'default';
        rememberProjectId(currentProjectId);
        renderProjects();
        if(projectOverviewMode) renderProjectOverview();
        else renderBoard();
    } catch(e){ console.error(e); setStatus(L('删除项目失败','Delete project failed')); loadAll(); }
}

async function deleteProjectToTrash(pid){
    const p = projects.find(x => x.id === pid);
    if(!p || pid === 'default') return;
    pendingDeleteProjectId = null;
    const projectCanvases = canvasesInProject(pid);
    try {
        for(const canvas of projectCanvases){
            const res = await fetch(`/api/canvases/${encodeURIComponent(canvas.id)}`, { method:'DELETE' });
            if(!res.ok) throw new Error('trash project canvas failed');
        }
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}`, { method:'DELETE' });
        if(!res.ok) throw new Error('delete project failed');
        canvases = canvases.filter(canvas => (canvas.project || 'default') !== pid);
        projects = projects.filter(project => project.id !== pid);
        if(currentProjectId === pid) currentProjectId = 'default';
        rememberProjectId(currentProjectId);
        renderProjects();
        setProjectOverviewMode(false);
        renderBoard();
        await refreshTrashCount();
        await openTrashView();
        setStatus(projectCanvases.length ? `项目已删除，${projectCanvases.length} 张画布已移入回收站` : '项目已删除');
    } catch(e){
        console.error(e);
        setStatus('删除项目失败');
        loadAll();
    }
}

/* ===== Board rendering ===== */
function updateBoardHeader(){
    if(projectOverviewMode){
        boardProjectName.textContent = L('项目管理','Projects');
        boardCanvasCount.textContent = String(projects.length);
        return;
    }
    const p = currentProject();
    boardProjectName.textContent = p ? p.name : L('默认项目','Default');
    boardCanvasCount.textContent = String(canvasesInProject(currentProjectId).length);
}

function canvasBoardSortTime(canvas){
    return Number(canvas?.updated_at || canvas?.created_at || 0);
}

function autoLayoutCanvases(items){
    const CARD_W = 282;
    const CARD_H = 386;
    const GAP_X = 42;
    const GAP_Y = 58;
    const ROW_STAGGER_X = 0;
    const CARD_STAGGER_Y = 0;
    const X0 = 40;
    const Y0 = 40;
    const usableW = Math.max(CARD_W, (board?.clientWidth || 1280) - X0 * 2);
    const cols = Math.max(1, Math.floor((usableW + GAP_X) / (CARD_W + GAP_X)));
    const ordered = [...items].sort((a, b) => {
        const ta = canvasBoardSortTime(a);
        const tb = canvasBoardSortTime(b);
        if(ta !== tb) return ta - tb;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });
    ordered.forEach((c, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const rowOffsetX = cols > 1 ? (row % 2) * ROW_STAGGER_X : 0;
        const cardOffsetY = cols > 1 ? (col % 2) * CARD_STAGGER_Y : 0;
        const board_x = X0 + rowOffsetX + col * (CARD_W + GAP_X);
        const board_y = Y0 + row * (CARD_H + GAP_Y) + cardOffsetY;
        if(Math.round(Number(c.board_x || 0)) !== board_x || Math.round(Number(c.board_y || 0)) !== board_y){
            c.board_x = board_x;
            c.board_y = board_y;
            persistMeta(c.id, { board_x, board_y });
        } else {
            c.board_x = board_x;
            c.board_y = board_y;
        }
    });
    const rows = Math.ceil(ordered.length / cols);
    const maxRowOffsetX = rows > 1 && cols > 1 ? ROW_STAGGER_X : 0;
    const maxCardOffsetY = ordered.length > 1 && cols > 1 ? CARD_STAGGER_Y : 0;
    boardWorld.style.width = `${X0 * 2 + maxRowOffsetX + cols * CARD_W + Math.max(0, cols - 1) * GAP_X}px`;
    boardWorld.style.height = `${Y0 * 2 + rows * CARD_H + Math.max(0, rows - 1) * GAP_Y + maxCardOffsetY}px`;
    return ordered;
}

function renderBoard(){
    updateBoardHeader();
    const items = canvasesInProject(currentProjectId);
    const orderedItems = autoLayoutCanvases(items);
    boardWorld.innerHTML = '';
    orderedItems.forEach(c => boardWorld.appendChild(buildCard(c)));
    boardEmptyHint.classList.toggle('hidden', items.length > 0);
    updatePasteBtn();
    refreshIcons();
    if(boardMinimapOpen) renderBoardMinimap();
}

function buildCard(c){
    const isSmart = true;
    const coverHtml = canvasCardCoverHtml(c);
    const card = document.createElement('div');
    card.className = 'ws-card'
        + (String(c.color || '').trim() ? ' cc-marked' : '')
        + (clipboardCanvasId === c.id ? ' cut' : '');
    card.dataset.canvasId = c.id;
    card.style.left = (c.board_x || 0) + 'px';
    card.style.top = (c.board_y || 0) + 'px';
    // 卡片布局：顶部=类型标签+更多按钮；中部=标题；底部=节点数·时间。已移除图标。
    card.innerHTML = `
        <div class="ws-card-top">
            <span class="ws-card-kind smart ws-card-name-pill" title="${escapeAttr(c.title || '未命名画布')}">${escapeHtml(c.title || '未命名画布')}</span>
            <button class="ws-card-menu" type="button" title="${L('更多','More')}" aria-label="${L('更多','More')}"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>
        </div>
        ${coverHtml}
        <div class="ws-card-title">${escapeHtml(c.title)}</div>
        <div class="ws-card-meta">
            <span class="ws-card-nodes">${(c.node_count != null ? c.node_count : 0)} ${L('节点','nodes')}</span>
            <span class="ws-card-meta-dot"></span>
            <span class="ws-card-time">${formatCanvasTime(c.updated_at || c.created_at)}</span>
        </div>
        <div class="ws-card-delete-confirm">
            <div class="ws-card-delete-title">${L('移入回收站？','Move to trash?')}</div>
            <div class="ws-card-delete-actions">
                <button class="ws-card-delete-yes" type="button">${L('删除','Delete')}</button>
                <button class="ws-card-delete-no" type="button">${L('取消','Cancel')}</button>
            </div>
        </div>`;
    card.draggable = false;
    card.addEventListener('mousedown', e => {
        if(e.button !== 0) return;
        if(e.target.closest('.ws-card-menu')) return;
        if(e.target.closest('.ws-card-delete-confirm')) return;
        if(card.querySelector('.ws-card-name-input')) return;
        e.stopPropagation();
        closeCardMenu();
    });
    card.addEventListener('click', e => {
        if(e.target.closest('.ws-card-menu')) return;
        if(e.target.closest('.ws-card-delete-confirm')) return;
        if(card.querySelector('.ws-card-name-input')) return;
        e.stopPropagation();
        openCanvas(c);
    });
    const menuBtn = card.querySelector('.ws-card-menu');
    menuBtn.onmousedown = e => e.stopPropagation();
    menuBtn.onclick = e => { e.stopPropagation(); openCardMenu(c.id, menuBtn); };
    card.querySelector('.ws-card-delete-confirm').onmousedown = e => e.stopPropagation();
    card.querySelector('.ws-card-delete-yes').onclick = e => { e.stopPropagation(); deleteCanvas(c.id); };
    card.querySelector('.ws-card-delete-no').onclick = e => { e.stopPropagation(); card.classList.remove('confirming-delete'); };
    return card;
}

/* ===== Card drag vs click ===== */
function attachCardDrag(card, c){
    card.addEventListener('mousedown', e => {
        if(e.button !== 0) return;
        if(e.target.closest('.ws-card-menu')) return;
        if(e.target.closest('.ws-card-delete-confirm')) return;
        if(card.querySelector('.ws-card-name-input')) return; // editing title
        e.stopPropagation();
        closeCardMenu();
        const startWorld = screenToWorld(e.clientX, e.clientY);
        const origX = c.board_x || 0, origY = c.board_y || 0;
        let moved = false;
        const onMove = ev => {
            const w = screenToWorld(ev.clientX, ev.clientY);
            const dx = w.x - startWorld.x, dy = w.y - startWorld.y;
            if(!moved && (Math.abs(dx * viewport.scale) > 5 || Math.abs(dy * viewport.scale) > 5)){
                moved = true; card.classList.add('dragging');
            }
            if(moved){
                c.board_x = origX + dx; c.board_y = origY + dy;
                card.style.left = c.board_x + 'px';
                card.style.top = c.board_y + 'px';
                if(boardMinimapOpen) renderBoardMinimap();
            }
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            card.classList.remove('dragging');
            if(moved){
                persistMeta(c.id, { board_x: Math.round(c.board_x), board_y: Math.round(c.board_y) });
            } else {
                openCanvas(c);
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

function openCanvas(c){
    const enc = encodeURIComponent(c.id);
    const project = encodeURIComponent(c.project || currentProjectId || 'default');
    const workflowAsset = String(c.source_workflow_id || '').trim();
    const workflowParam = workflowAsset ? `&editWorkflowAsset=${encodeURIComponent(workflowAsset)}` : '';
    rememberProjectId(c.project || currentProjectId || 'default');
    window.location.href = `/static/smart-canvas.html?id=${enc}&project=${project}${workflowParam}&v=V10-09.blank-canvas-guard`;
}

/* ===== Card create flow ===== */
let createCardEl = null;
let createKind = 'smart';
function closeCreateCard(){ createCardEl?.remove(); createCardEl = null; }
function openCreateCard(worldPt){
    closeCreateCard();
    closeCardMenu();
    createKind = 'smart';
    const el = document.createElement('div');
    el.className = 'ws-create-card';
    el.style.left = worldPt.x + 'px';
    el.style.top = worldPt.y + 'px';
    el.innerHTML = `
        <div class="ws-create-title">${L('新建智能画布','New smart canvas')}</div>
        <input class="ws-create-input" type="text" maxlength="80" placeholder="${L('智能画布名称（可留空）','Smart canvas name (optional)')}">
        <div class="ws-create-type"><i data-lucide="sparkles" class="w-3.5 h-3.5"></i><span>${L('智能画布','Smart canvas')}</span></div>
        <div class="ws-create-actions">
            <button class="ws-create-confirm" type="button">${L('创建','Create')}</button>
            <button class="ws-create-cancel" type="button">${L('取消','Cancel')}</button>
        </div>`;
    boardWorld.appendChild(el);
    createCardEl = el;
    el.addEventListener('mousedown', e => e.stopPropagation());
    const input = el.querySelector('.ws-create-input');
    input.focus();
    const confirm = () => createCanvasOnBoard(input.value.trim(), createKind, worldPt);
    el.querySelector('.ws-create-confirm').onclick = confirm;
    el.querySelector('.ws-create-cancel').onclick = closeCreateCard;
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); confirm(); }
        if(e.key === 'Escape'){ e.preventDefault(); closeCreateCard(); }
    };
}

async function createCanvasOnBoard(title, kind, worldPt){
    const isSmart = true;
    const base = L('智能画布','Smart canvas');
    const name = title || `${base} ${new Date().toLocaleTimeString(langIsEn() ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    closeCreateCard();
    try {
        const res = await fetch('/api/canvases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: name,
                icon: 'sparkles',
                kind: 'smart',
                project: currentProjectId,
                board_x: Math.round(worldPt.x),
                board_y: Math.round(worldPt.y)
            })
        });
        if(!res.ok) throw new Error('create canvas failed');
        const data = await res.json();
        const nc = data.canvas;
        if(nc){
            if(nc.project == null) nc.project = currentProjectId;
            if(nc.board_x == null) nc.board_x = Math.round(worldPt.x);
            if(nc.board_y == null) nc.board_y = Math.round(worldPt.y);
            canvases.push(nc);
            renderBoard();
            renderProjects();
        }
    } catch(e){ console.error(e); setStatus(L('创建失败','Create failed')); }
}

/* ===== Card context menu (rename / delete / move) ===== */
function closeCardMenu(){ document.querySelector('.ws-card-pop')?.remove(); }
function openCardMenu(canvasId, anchorBtn){
    closeCardMenu();
    const c = canvases.find(x => x.id === canvasId);
    if(!c) return;
    const pop = document.createElement('div');
    pop.className = 'ws-card-pop';
    const projectOptions = projects.map(p => `<option value="${escapeAttr(p.id)}" ${(p.id === (c.project || 'default')) ? 'selected' : ''}>${escapeHtml(p.name || '未命名项目')}</option>`).join('');
    pop.innerHTML = `
        <button class="ws-pop-item" data-act="rename"><i data-lucide="pencil" class="w-4 h-4"></i><span>${L('重命名','Rename')}</span></button>
        <button class="ws-pop-item" data-act="export"><i data-lucide="download" class="w-4 h-4"></i><span>${L('导出画布','Export canvas')}</span></button>
        <button class="ws-pop-item" data-act="export-assets"><i data-lucide="archive" class="w-4 h-4"></i><span>${L('导出画布 + 资源','Export with assets')}</span></button>
        <label class="ws-pop-field"><span>${L('移动到项目','Move to project')}</span><select data-act="move-project">${projectOptions}</select></label>
        <div class="ws-pop-sep"></div>
        <button class="ws-pop-item danger" data-act="delete"><i data-lucide="trash-2" class="w-4 h-4"></i><span>${L('删除','Delete')}</span></button>`;
    document.body.appendChild(pop);
    const r = anchorBtn.getBoundingClientRect();
    const w = pop.offsetWidth || 188, h = pop.offsetHeight || 120;
    let left = Math.min(r.left, window.innerWidth - w - 12);
    let top = r.bottom + 6;
    if(top + h > window.innerHeight - 12) top = r.top - h - 6;
    pop.style.left = Math.round(Math.max(12, left)) + 'px';
    pop.style.top = Math.round(Math.max(12, top)) + 'px';
    pop.querySelector('[data-act="rename"]').onclick = () => { closeCardMenu(); startCardRename(canvasId); };
    pop.querySelector('[data-act="export"]').onclick = () => { closeCardMenu(); exportCanvas(canvasId); };
    pop.querySelector('[data-act="export-assets"]').onclick = () => { closeCardMenu(); exportCanvasWithResources(canvasId); };
    pop.querySelector('[data-act="move-project"]').onchange = event => { const projectId = event.target.value; closeCardMenu(); moveCanvasToProject(canvasId, projectId); };
    pop.querySelector('[data-act="delete"]').onclick = () => { closeCardMenu(); showCardDeleteConfirm(canvasId); };
    refreshIcons();
}

function showCardDeleteConfirm(canvasId){
    const card = boardWorld.querySelector(`.ws-card[data-canvas-id="${CSS.escape(canvasId)}"]`);
    if(!card) return;
    boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => {
        if(el !== card) el.classList.remove('confirming-delete');
    });
    card.classList.add('confirming-delete');
}

/* ===== Export canvas (download the full canvas JSON) ===== */
async function exportCanvas(id){
    const c = canvases.find(x => x.id === id);
    setStatus(L('正在导出...','Exporting...'));
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`);
        if(!res.ok) throw new Error('export failed');
        const data = await res.json();
        const cv = data.canvas || data;
        const base = String((c?.title) || cv.title || 'canvas').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'canvas';
        const blob = new Blob([JSON.stringify(cv, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = base + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setStatus(L('已导出','Exported'));
    } catch(e){ console.error(e); setStatus(L('导出失败','Export failed')); }
}

/* ===== Export canvas with referenced resources ===== */
const ZIP_ENCODER = new TextEncoder();
let ZIP_CRC_TABLE = null;

function safeExportBase(name, fallback = 'canvas'){
    return String(name || fallback).replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || fallback;
}

function collectCanvasResourceUrls(value, out = [], seen = new Set()){
    if(value == null) return out;
    if(typeof value === 'string'){
        const text = value.trim();
        if(isCanvasResourceUrl(text) && !seen.has(text)){
            seen.add(text);
            out.push(text);
        }
        return out;
    }
    if(Array.isArray(value)){
        value.forEach(item => collectCanvasResourceUrls(item, out, seen));
        return out;
    }
    if(typeof value === 'object'){
        Object.values(value).forEach(item => collectCanvasResourceUrls(item, out, seen));
    }
    return out;
}

function isCanvasResourceUrl(url){
    return url.startsWith('/assets/') || url.startsWith('/output/') || /^https?:\/\//i.test(url);
}

function exportResourceName(url, index, used){
    let name = '';
    try {
        const parsed = new URL(url, location.origin);
        name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    } catch(e) {
        name = String(url || '').split(/[?#]/)[0].split('/').pop() || '';
    }
    name = safeExportBase(name || `resource-${String(index + 1).padStart(3, '0')}`, `resource-${index + 1}`);
    if(!/\.[a-z0-9]{1,8}$/i.test(name)) name += '.bin';
    let finalName = `resources/${name}`;
    const dot = finalName.lastIndexOf('.');
    const stem = dot > 0 ? finalName.slice(0, dot) : finalName;
    const ext = dot > 0 ? finalName.slice(dot) : '';
    let suffix = 2;
    while(used.has(finalName)){
        finalName = `${stem}-${suffix}${ext}`;
        suffix++;
    }
    used.add(finalName);
    return finalName;
}

async function fetchResourceBytes(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
}

function zipCrc32(bytes){
    if(!ZIP_CRC_TABLE){
        ZIP_CRC_TABLE = new Uint32Array(256);
        for(let i = 0; i < 256; i++){
            let c = i;
            for(let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            ZIP_CRC_TABLE[i] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for(let i = 0; i < bytes.length; i++) crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function zipDosTime(date = new Date()){
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const year = Math.max(1980, date.getFullYear());
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

function zipHeader(signature, size){
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    return { bytes, view };
}

function createZipBlob(entries){
    const now = zipDosTime();
    const files = [];
    const central = [];
    let offset = 0;
    entries.forEach(entry => {
        const nameBytes = ZIP_ENCODER.encode(entry.name);
        const data = entry.bytes instanceof Uint8Array ? entry.bytes : ZIP_ENCODER.encode(String(entry.bytes || ''));
        const crc = zipCrc32(data);
        const local = zipHeader(0x04034b50, 30 + nameBytes.length);
        local.view.setUint16(4, 20, true);
        local.view.setUint16(6, 0x0800, true);
        local.view.setUint16(8, 0, true);
        local.view.setUint16(10, now.time, true);
        local.view.setUint16(12, now.day, true);
        local.view.setUint32(14, crc, true);
        local.view.setUint32(18, data.length, true);
        local.view.setUint32(22, data.length, true);
        local.view.setUint16(26, nameBytes.length, true);
        local.bytes.set(nameBytes, 30);
        files.push(local.bytes, data);

        const cd = zipHeader(0x02014b50, 46 + nameBytes.length);
        cd.view.setUint16(4, 20, true);
        cd.view.setUint16(6, 20, true);
        cd.view.setUint16(8, 0x0800, true);
        cd.view.setUint16(10, 0, true);
        cd.view.setUint16(12, now.time, true);
        cd.view.setUint16(14, now.day, true);
        cd.view.setUint32(16, crc, true);
        cd.view.setUint32(20, data.length, true);
        cd.view.setUint32(24, data.length, true);
        cd.view.setUint16(28, nameBytes.length, true);
        cd.view.setUint32(42, offset, true);
        cd.bytes.set(nameBytes, 46);
        central.push(cd.bytes);
        offset += local.bytes.length + data.length;
    });
    const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
    const end = zipHeader(0x06054b50, 22);
    end.view.setUint16(8, entries.length, true);
    end.view.setUint16(10, entries.length, true);
    end.view.setUint32(12, centralSize, true);
    end.view.setUint32(16, offset, true);
    return new Blob([...files, ...central, end.bytes], { type:'application/zip' });
}

async function exportCanvasWithResources(id){
    const c = canvases.find(x => x.id === id);
    setStatus(L('正在收集资源...','Collecting assets...'));
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`);
        if(!res.ok) throw new Error('export failed');
        const data = await res.json();
        const cv = data.canvas || data;
        const base = safeExportBase((c?.title) || cv.title || 'canvas');
        const urls = collectCanvasResourceUrls(cv).slice(0, 1000);
        const usedNames = new Set(['canvas.json', 'resources-manifest.json']);
        const entries = [{ name:'canvas.json', bytes:ZIP_ENCODER.encode(JSON.stringify(cv, null, 2)) }];
        const manifest = [];
        let skipped = 0;
        for(let i = 0; i < urls.length; i++){
            const url = urls[i];
            try {
                const bytes = await fetchResourceBytes(url);
                const name = exportResourceName(url, i, usedNames);
                entries.push({ name, bytes });
                manifest.push({ url, file:name, size:bytes.length });
            } catch(e) {
                skipped++;
                manifest.push({ url, skipped:true, reason:String(e?.message || e || 'fetch failed').slice(0, 120) });
            }
        }
        entries.push({ name:'resources-manifest.json', bytes:ZIP_ENCODER.encode(JSON.stringify({ canvas_id:id, resources:manifest }, null, 2)) });
        const blob = createZipBlob(entries);
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = `${base}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1500);
        const included = Math.max(0, entries.length - 2);
        setStatus(skipped
            ? L(`已导出，跳过 ${skipped} 个资源`, `Exported, skipped ${skipped} assets`)
            : L(`已导出 ${included} 个资源`, `Exported ${included} assets`));
    } catch(e){ console.error(e); setStatus(L('导出失败','Export failed')); }
}

/* ===== Cut / paste a canvas across projects ===== */
function cutCanvas(id){
    clipboardCanvasId = id;
    setStatus(L('已剪切，切换到目标项目后点“粘贴到此项目”','Cut — open another project, then Paste'));
    renderBoard();
}
function updatePasteBtn(){
    if(!pasteCanvasBtn) return;
    const show = !!clipboardCanvasId && canvases.some(x => x.id === clipboardCanvasId);
    pasteCanvasBtn.style.display = show ? 'inline-flex' : 'none';
}
async function pasteCanvas(){
    if(!clipboardCanvasId) return;
    const c = canvases.find(x => x.id === clipboardCanvasId);
    const targetPid = currentProjectId;
    clipboardCanvasId = null;
    if(!c){ updatePasteBtn(); renderBoard(); return; }
    if((c.project || 'default') === targetPid){ renderBoard(); setStatus(L('已在当前项目','Already in this project')); return; }
    await moveCanvasToProject(c.id, targetPid);
}

function startCardRename(canvasId){
    const card = boardWorld.querySelector(`.ws-card[data-canvas-id="${CSS.escape(canvasId)}"]`);
    const c = canvases.find(x => x.id === canvasId);
    if(!card || !c) return;
    const titleEl = card.querySelector('.ws-card-name-pill');
    if(!titleEl || titleEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 80; input.value = c.title || '';
    input.className = 'ws-card-name-input';
    titleEl.replaceWith(input);
    input.onmousedown = e => e.stopPropagation();
    input.onclick = e => e.stopPropagation();
    input.focus(); input.select();
    let done = false;
    const finish = commit => {
        if(done) return; done = true;
        const v = input.value.trim();
        if(commit && v && v !== c.title) setCanvasTitle(canvasId, v);
        else renderBoard();
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}

async function setCanvasTitle(id, title){
    const c = canvases.find(x => x.id === id);
    if(c) c.title = title;
    renderBoard();
    await persistMeta(id, { title });
}

async function moveCanvasToProject(id, projectId){
    const c = canvases.find(x => x.id === id);
    if(c) c.project = projectId;
    renderBoard();
    renderProjects();
    setStatus(L('已移动','Moved'));
    await persistMeta(id, { project: projectId });
}

/* ===== Card meta persist (POST /meta) ===== */
async function persistMeta(id, patch){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        if(!res.ok) throw new Error('meta save failed');
        const data = await res.json();
        if(data.canvas){
            const idx = canvases.findIndex(x => x.id === id);
            if(idx >= 0) canvases[idx] = { ...canvases[idx], ...data.canvas };
        }
    } catch(e){ console.error(e); setStatus(L('保存失败','Save failed')); }
}

/* ===== Delete canvas (soft -> trash, with confirm) ===== */
async function deleteCanvas(id){
    const c = canvases.find(x => x.id === id);
    if(!c) return;
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if(!res.ok) throw new Error('delete failed');
        canvases = canvases.filter(x => x.id !== id);
        renderBoard();
        renderProjects();
        refreshTrashCount();
        setStatus(L('已移入回收站','Moved to trash'));
    } catch(e){ console.error(e); setStatus(L('删除失败','Delete failed')); }
}

/* ===== Trash / recycle bin ===== */
async function refreshTrashCount(){
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) return;
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        syncTrashSelection();
        if(trashPanel?.classList.contains('active')) renderTrash();
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
    } catch(e){}
}
async function openTrashView(){
    trashEntryBtn.classList.add('active');
    trashPanel.classList.add('active');
    document.body.classList.add('trash-view-mode');
    closeCardMenu(); closeCreateCard();
    await loadTrash();
}
function closeTrashView(){
    trashEntryBtn.classList.remove('active');
    trashPanel.classList.remove('active');
    document.body.classList.remove('trash-view-mode');
    trashEditMode = false;
    trashSelectedIds.clear();
    updateTrashBulkToolbar();
}
async function loadTrash(){
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) throw new Error('trash load failed');
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        syncTrashSelection();
        renderTrash();
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
    } catch(e){ console.error(e); setStatus(L('加载回收站失败','Load trash failed')); }
}
function syncTrashSelection(){
    const alive = new Set(deletedCanvases.map(c => c.id));
    trashSelectedIds = new Set([...trashSelectedIds].filter(id => alive.has(id)));
    if(!deletedCanvases.length) trashEditMode = false;
}
function updateTrashBulkToolbar(){
    const total = deletedCanvases.length;
    const selected = trashSelectedIds.size;
    const allSelected = total > 0 && selected === total;
    trashEditToggleBtn?.classList.toggle('active', trashEditMode);
    if(trashBulkCount){
        trashBulkCount.textContent = total <= 0
            ? L('回收站为空','Trash is empty')
            : trashEditMode
                ? L(`已选 ${selected} / ${total}`,'Selected items')
                : L(`共 ${total} 个画布`,'Trash items');
    }
    if(trashEditToggleBtn) trashEditToggleBtn.disabled = total <= 0;
    const editLabel = trashEditToggleBtn?.querySelector('span');
    if(editLabel) editLabel.textContent = trashEditMode ? L('完成管理','Done') : L('管理编辑','Manage');
    const selectLabel = trashSelectAllBtn?.querySelector('span');
    if(selectLabel) selectLabel.textContent = allSelected ? L('取消全选','Clear') : L('全选','Select all');
    const deleteLabel = trashDeleteSelectedBtn?.querySelector('span');
    if(deleteLabel) deleteLabel.textContent = selected ? L(`删除选中 ${selected}`,'Delete selected') : L('删除选中','Delete selected');
    if(trashSelectAllBtn) trashSelectAllBtn.disabled = !trashEditMode || total <= 0;
    if(trashDeleteSelectedBtn) trashDeleteSelectedBtn.disabled = !trashEditMode || selected <= 0;
    if(trashClearAllBtn) trashClearAllBtn.disabled = total <= 0;
}
function setTrashEditMode(active){
    trashEditMode = Boolean(active) && deletedCanvases.length > 0;
    if(!trashEditMode) trashSelectedIds.clear();
    renderTrash();
}
function toggleTrashSelection(id){
    if(!id) return;
    if(trashSelectedIds.has(id)) trashSelectedIds.delete(id);
    else trashSelectedIds.add(id);
    renderTrash();
}
function toggleTrashSelectAll(){
    if(!trashEditMode || !deletedCanvases.length) return;
    if(trashSelectedIds.size === deletedCanvases.length) trashSelectedIds.clear();
    else trashSelectedIds = new Set(deletedCanvases.map(c => c.id));
    renderTrash();
}
function updateTrashCountBadge(){
    const n = deletedCanvases.length;
    trashBadge.textContent = String(n);
    trashBadge.classList.toggle('visible', n > 0);
}
function renderTrash(){
    syncTrashSelection();
    updateTrashBulkToolbar();
    trashListEl.innerHTML = '';
    if(!deletedCanvases.length){
        const empty = document.createElement('div');
        empty.className = 'ws-trash-empty';
        empty.textContent = L('回收站为空','Trash is empty');
        trashListEl.appendChild(empty);
        refreshIcons();
        return;
    }
    deletedCanvases.forEach(c => {
        const isSmart = true;
        const projName = (projects.find(p => p.id === (c.project || 'default')) || {}).name || L('默认项目','Default');
        const card = document.createElement('div');
        const selected = trashSelectedIds.has(c.id);
        card.className = `ws-trash-card ${trashEditMode ? 'is-editing' : ''} ${selected ? 'selected' : ''}`;
        card.dataset.canvasId = c.id;
        card.innerHTML = `
            <label class="ws-trash-select" title="${L('选择','Select')}"><input type="checkbox" ${selected ? 'checked' : ''}><span></span></label>
            <div class="ws-card-top">
                <span class="ws-card-icon">${renderCanvasIcon('sparkles', 17)}</span>
                <span class="ws-card-kind smart">${L('智能','Smart')}</span>
            </div>
            <div class="ws-card-title">${escapeHtml(c.title)}</div>
            <div class="ws-card-meta"><span class="ws-card-nodes">${escapeHtml(projName)}</span><span class="ws-card-meta-dot"></span><span class="ws-card-time">${formatCanvasTime(c.deleted_at)}</span></div>
            <div class="ws-card-actions">
                <button class="ws-trash-act restore" type="button"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i><span>${L('恢复','Restore')}</span></button>
                <button class="ws-trash-act purge" type="button"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>${L('彻底删除','Delete')}</span></button>
            </div>
            <div class="ws-trash-confirm">
                <div class="ws-trash-confirm-title">${L('彻底删除？不可恢复','Delete permanently?')}</div>
                <div class="ws-trash-confirm-actions">
                    <button class="ws-trash-confirm-yes" type="button">${L('删除','Delete')}</button>
                    <button class="ws-trash-confirm-no" type="button">${L('取消','Cancel')}</button>
                </div>
            </div>`;
        card.querySelector('.ws-trash-act.restore').onclick = () => restoreCanvas(c.id);
        card.querySelector('.ws-trash-act.purge').onclick = () => card.classList.add('confirming');
        card.querySelector('.ws-trash-confirm-yes').onclick = () => purgeCanvas(c.id);
        card.querySelector('.ws-trash-confirm-no').onclick = () => card.classList.remove('confirming');
        card.querySelector('.ws-trash-select input')?.addEventListener('change', () => toggleTrashSelection(c.id));
        card.addEventListener('click', event => {
            if(!trashEditMode || event.target.closest('button,input,label')) return;
            toggleTrashSelection(c.id);
        });
        trashListEl.appendChild(card);
    });
    refreshIcons();
}
async function restoreCanvas(id){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/restore`, { method: 'POST' });
        if(!res.ok) throw new Error('restore failed');
        deletedCanvases = deletedCanvases.filter(c => c.id !== id);
        trashSelectedIds.delete(id);
        await loadAll();           // restored canvas returns to its stored project
        renderTrash();
        setStatus(L('已恢复','Restored'));
    } catch(e){ console.error(e); setStatus(L('恢复失败','Restore failed')); }
}
async function purgeCanvas(id){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/purge`, { method: 'DELETE' });
        if(!res.ok) throw new Error('purge failed');
        deletedCanvases = deletedCanvases.filter(c => c.id !== id);
        trashSelectedIds.delete(id);
        renderTrash();
        updateTrashCountBadge();
        setStatus(L('已彻底删除','Deleted'));
    } catch(e){ console.error(e); setStatus(L('删除失败','Delete failed')); }
}
async function purgeTrashCanvases(ids, message){
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if(!uniqueIds.length) return;
    if(trashDeleteSelectedBtn) trashDeleteSelectedBtn.disabled = true;
    if(trashClearAllBtn) trashClearAllBtn.disabled = true;
    const deletedIds = new Set();
    for(const id of uniqueIds){
        try {
            const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/purge`, { method: 'DELETE' });
            if(!res.ok) throw new Error('purge failed');
            deletedIds.add(id);
            trashSelectedIds.delete(id);
        } catch(e) {
            console.error(e);
        }
    }
    deletedCanvases = deletedCanvases.filter(c => !deletedIds.has(c.id));
    if(!deletedCanvases.length) trashEditMode = false;
    renderTrash();
    updateTrashCountBadge();
    setStatus(deletedIds.size === uniqueIds.length ? message : L(`已删除 ${deletedIds.size} 个，部分失败`,'Some items failed'));
}
async function deleteSelectedTrashCanvases(){
    const ids = [...trashSelectedIds];
    if(!ids.length) return;
    if(!confirm(L(`彻底删除选中的 ${ids.length} 个画布？不可恢复。`, `Delete ${ids.length} selected canvas(es) forever?`))) return;
    await purgeTrashCanvases(ids, L(`已删除 ${ids.length} 个画布`, 'Deleted selected canvases'));
}
async function clearTrashCanvases(){
    const ids = deletedCanvases.map(c => c.id);
    if(!ids.length) return;
    if(!confirm(L(`清空回收站中的 ${ids.length} 个画布？不可恢复。`, `Empty trash and delete ${ids.length} canvas(es) forever?`))) return;
    await purgeTrashCanvases(ids, L('回收站已清空','Trash emptied'));
}

/* ===== Workflow navigation overlay ===== */
function workflowNavDisplayTitle(workflow){
    const name = workflow?.name || '';
    const title = workflow?.title || name.replace(/\.json$/i, '');
    const map = {
        'Z-Image.json':'Z-Image 文生图',
        'custom/Z-Image.json':'Z-Image 文生图',
        'Z-Image-Enhance.json':'Z-Image 高清增强',
        'custom/Z-Image-Enhance.json':'Z-Image 高清增强',
        'Flux2-Klein.json':'Flux2 Klein 图像编辑',
        'custom/Flux2-Klein.json':'Flux2 Klein 图像编辑',
        '2511.json':'Qwen Image Edit 2511'
    };
    return map[name] || title || 'Comfy 工作流';
}
function workflowNavMeta(workflow){
    const name = workflow?.name || '';
    const title = workflowNavDisplayTitle(workflow);
    const lower = `${name} ${title}`.toLowerCase();
    if(lower.includes('enhance') || title.includes('放大') || title.includes('增强')) return {tag:'摄影', desc:'高清修复、细节增强和放大输出', tone:'green', cats:['recommended','photo','design','brand']};
    if(lower.includes('klein') || lower.includes('edit') || title.includes('融图') || title.includes('扩图') || title.includes('编辑')) return {tag:'设计', desc:'参考图改图、融合、扩图和局部重绘', tone:'blue', cats:['recommended','design','ecommerce','brand']};
    if(lower.includes('z-image') || lower.includes('zimage')) return {tag:'摄影', desc:'从提示词生成首图或创意草稿', tone:'green', cats:['recommended','photo','design','acg']};
    if(lower.includes('2511') || lower.includes('qwen')) return {tag:'电商', desc:'商品图编辑、结构保留和局部改写', tone:'violet', cats:['recommended','ecommerce','brand','design']};
    return {tag:'其他', desc:`${workflow?.field_count || 0} 个可调参数`, tone:'slate', cats:['other']};
}
function workflowNavCoverHtml(workflow, meta, index=0){
    const src = workflowNavPreviewUrl(workflow, meta, index);
    return `<span class="workflow-nav-thumb has-cover">
        <img src="${escapeAttr(src)}" alt="${escapeAttr(workflowNavDisplayTitle(workflow))}">
        <small>${escapeHtml(meta.tag)}</small>
    </span>`;
}
function workflowNavPreviewUrl(workflow, meta, index=0){
    const direct = workflow?.thumbnail || workflow?.thumb || workflow?.preview || workflow?.cover || workflow?.image;
    if(direct) return String(direct);
    const name = `${workflow?.name || ''} ${workflow?.title || ''}`.toLowerCase();
    const pools = {
        ecommerce:[
            '/assets/output/online_03f90d1ff0.jpg',
            '/assets/input/ai_ref_05ff347b29f8.jpg',
            '/assets/input/ai_ref_251024429588.jpg'
        ],
        design:[
            '/assets/input/ai_ref_14367073eb6e.png',
            '/assets/input/ai_ref_6bc1cc312d7a.png',
            '/assets/output/chat_ab75d97a6b.jpg'
        ],
        photo:[
            '/assets/input/ai_ref_17ad2799741e.jpg',
            '/assets/input/ai_ref_656b1cc9e8e3.jpg',
            '/assets/output/online_a82c621e79.jpg'
        ],
        film:[
            '/assets/input/ai_ref_b0d9adc4e335.jpg',
            '/assets/input/ai_ref_d5f76f504d5b.jpg',
            '/assets/output/chat_b5a5106cdb.jpg'
        ],
        other:[
            '/assets/output/online_b541b783e3.jpg',
            '/assets/input/ai_ref_30289aa50fa7.png',
            '/assets/output/online_e25ba4ca42.jpg'
        ]
    };
    const key = name.includes('2511') || name.includes('qwen') ? 'ecommerce'
        : name.includes('klein') || name.includes('edit') || name.includes('flux') ? 'design'
        : name.includes('enhance') || name.includes('upscale') ? 'photo'
        : name.includes('z-image') || name.includes('zimage') ? 'film'
        : (meta?.cats || []).includes('ecommerce') ? 'ecommerce'
        : (meta?.cats || []).includes('design') ? 'design'
        : (meta?.cats || []).includes('photo') ? 'photo'
        : 'other';
    const list = pools[key] || pools.other;
    return list[index % list.length];
}
function workflowNavSavedItems(){
    const libs = Array.isArray(workflowNavAssetLibrary.libraries) && workflowNavAssetLibrary.libraries.length
        ? workflowNavAssetLibrary.libraries
        : [{id:'default', name:'默认资产库', categories:workflowNavAssetLibrary.categories || []}];
    return libs.flatMap(lib => (lib.categories || []).filter(cat => (cat.type || 'image') === 'workflow').flatMap(cat => (cat.items || []).map(item => ({
        ...item,
        library_id: lib.id || '',
        category_id: cat.id || '',
        category_name: cat.name || '我的工作流'
    })))).filter(item => item.kind === 'workflow' || item.type === 'workflow' || String(item.url || '').toLowerCase().endsWith('.zip'));
}
function workflowNavFallbackCoverHtml(index=0){
    return `<span class="workflow-nav-cover-empty"><i data-lucide="image"></i><strong>暂无封面</strong></span>`;
}
function workflowNavSavedCardHtml(item, index=0){
    const cover = workflowCoverImageUrlFromItem(item, {preferSource:true});
    const coverSrc = cover ? canvasListMediaPreviewUrl({...item, url:cover}, 720) : '';
    const desc = item.description || [
        item.node_count ? `${item.node_count} 个节点` : '',
        item.resource_count ? `${item.resource_count} 个资源` : '',
        item.category_name || ''
    ].filter(Boolean).join(' / ') || '进入画布后可导入使用';
    return `<button class="workflow-nav-card saved-workflow-card" type="button" data-workflow-nav-asset="${escapeAttr(item.id || '')}">
        <span class="workflow-nav-thumb saved-workflow-thumb ${coverSrc ? 'has-cover' : ''}">
            ${workflowNavFallbackCoverHtml(index)}
            ${coverSrc ? `<img src="${escapeAttr(coverSrc)}" alt="${escapeAttr(item.name || 'Workflow')}" onerror="this.closest('.saved-workflow-thumb')?.classList.remove('has-cover');this.remove()">` : ''}
            <small>${escapeHtml(item.category_name || '我的')}</small>
            <span class="saved-workflow-delete" role="button" tabindex="-1" title="删除该工作流" aria-label="删除该工作流" data-saved-workflow-delete="${escapeAttr(item.id || '')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
            </span>
        </span>
        <span class="workflow-nav-info">
            <strong>${escapeHtml(item.name || '未命名工作流')}</strong>
            <em>${escapeHtml(desc)}</em>
        </span>
    </button>`;
}
function normalizeWorkflowImportPayload(data){
    if(Array.isArray(data)) return {nodes:data, connections:[]};
    if(Array.isArray(data?.nodes)) return {nodes:data.nodes, connections:Array.isArray(data.connections) ? data.connections : []};
    if(Array.isArray(data?.workflow?.nodes)) return {nodes:data.workflow.nodes, connections:Array.isArray(data.workflow.connections) ? data.workflow.connections : []};
    return {nodes:[], connections:[]};
}
function layoutImportedWorkflowForCanvas(imported, sourceAsset=null){
    const nodes = (imported.nodes || []).map(node => JSON.parse(JSON.stringify(node || {}))).filter(Boolean);
    const connections = (imported.connections || []).map(conn => JSON.parse(JSON.stringify(conn || {}))).filter(Boolean);
    if(!nodes.length) return {nodes, connections};
    const minX = Math.min(...nodes.map(node => Number(node.x || 0)));
    const minY = Math.min(...nodes.map(node => Number(node.y || 0)));
    const dx = 120 - minX;
    const dy = 120 - minY;
    nodes.forEach(node => {
        node.x = Math.round(Number(node.x || 0) + dx);
        node.y = Math.round(Number(node.y || 0) + dy);
        node.created_at = node.created_at || Date.now();
        if(sourceAsset?.id && node.type === 'workflow-group'){
            node.workflowAssetId = sourceAsset.id;
            node.sourceWorkflowAssetId = sourceAsset.id;
            node.source_workflow_id = sourceAsset.id;
            node.source_workflow_name = sourceAsset.name || '';
            node.source_workflow_url = sourceAsset.url || '';
        }
    });
    return {nodes, connections};
}

function workflowNavExistingCanvasForItem(item){
    if(!item) return null;
    const projectId = currentProjectId || 'default';
    const workflowId = String(item.id || '').trim();
    const workflowUrl = String(item.url || '').trim();
    return canvases.find(canvas => {
        if((canvas.project || 'default') !== projectId) return false;
        if(workflowId && String(canvas.source_workflow_id || '') === workflowId) return true;
        if(workflowUrl && String(canvas.source_workflow_url || '') === workflowUrl) return true;
        if(!canvas.source_workflow_id && !canvas.source_workflow_url && item.name && String(canvas.title || '') === String(item.name || '')) return true;
        return false;
    }) || null;
}

function closeWorkflowNavConfirm(){
    workflowNavConfirmEl?.remove();
    workflowNavConfirmEl = null;
}

function openWorkflowNavConfirm(assetId=''){
    const item = workflowNavSavedItems().find(entry => entry.id === assetId);
    if(!item) return;
    closeWorkflowNavConfirm();
    const existing = workflowNavExistingCanvasForItem(item);
    const cover = workflowCoverImageUrlFromItem(item);
    const coverSrc = cover ? canvasListMediaPreviewUrl({...item, url:cover}, 720) : '';
    const desc = item.description || [
        item.node_count ? `${item.node_count} 个节点` : '',
        item.resource_count ? `${item.resource_count} 个资源` : '',
        item.category_name || ''
    ].filter(Boolean).join(' / ') || '确认后会在当前项目中新建一张画布。';
    const el = document.createElement('div');
    el.className = 'workflow-nav-confirm';
    el.innerHTML = `
        <div class="workflow-nav-confirm-dialog" role="dialog" aria-modal="true" aria-label="使用工作流">
            <button class="workflow-nav-confirm-close" type="button" data-workflow-confirm-close aria-label="关闭"><i data-lucide="x"></i></button>
            <div class="workflow-nav-confirm-cover">
                ${coverSrc ? `<img src="${escapeAttr(coverSrc)}" alt="${escapeAttr(item.name || 'Workflow')}" onerror="this.remove()">` : workflowNavFallbackCoverHtml(0)}
            </div>
            <div class="workflow-nav-confirm-body">
                <div class="workflow-nav-confirm-kicker">工作流预览</div>
                <strong>${escapeHtml(item.name || '未命名工作流')}</strong>
                <p>${escapeHtml(desc)}</p>
                ${existing ? `<div class="workflow-nav-confirm-note">当前项目已存在由这个工作流创建的画布：${escapeHtml(existing.title || '未命名画布')}</div>` : ''}
            </div>
            <div class="workflow-nav-confirm-actions">
                ${existing ? `<button class="workflow-nav-confirm-secondary" type="button" data-workflow-open-existing>打开已有画布</button>` : ''}
                <button class="workflow-nav-confirm-primary" type="button" data-workflow-create-new>${existing ? '仍然新建副本' : '使用此工作流新建画布'}</button>
                <button class="workflow-nav-confirm-ghost" type="button" data-workflow-confirm-close>取消</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    workflowNavConfirmEl = el;
    el.addEventListener('mousedown', event => {
        if(event.target === el) closeWorkflowNavConfirm();
    });
    el.querySelectorAll('[data-workflow-confirm-close]').forEach(btn => btn.onclick = closeWorkflowNavConfirm);
    el.querySelector('[data-workflow-open-existing]')?.addEventListener('click', () => {
        closeWorkflowNavConfirm();
        if(existing) openCanvas(existing);
    });
    el.querySelector('[data-workflow-create-new]')?.addEventListener('click', () => {
        closeWorkflowNavConfirm();
        importWorkflowAssetToNewCanvas(assetId);
    });
    refreshIcons();
}

async function importWorkflowAssetToNewCanvas(assetId=''){
    const item = workflowNavSavedItems().find(entry => entry.id === assetId);
    if(!item?.url){ setStatus('工作流文件不存在'); return; }
    workflowNavGrid?.classList.add('busy');
    setStatus('正在创建工作流画布...');
    try {
        const zipRes = await fetch(item.url);
        if(!zipRes.ok) throw new Error('读取工作流文件失败');
        const blob = await zipRes.blob();
        const filename = item.name && /\.(json|zip)$/i.test(item.name) ? item.name : `${item.name || 'workflow'}.${item.format === 'json' ? 'json' : 'zip'}`;
        const form = new FormData();
        form.append('file', new File([blob], filename, {type:blob.type || 'application/zip'}));
        const importRes = await fetch('/api/canvas-workflows/import', {method:'POST', body:form});
        if(!importRes.ok) throw new Error((await importRes.text()) || '导入工作流失败');
        const imported = layoutImportedWorkflowForCanvas(normalizeWorkflowImportPayload(await importRes.json()), item);
        if(!imported.nodes.length) throw new Error('工作流里没有可导入节点');
        const createRes = await fetch('/api/canvases', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                title:item.name || '工作流画布',
                icon:'sparkles',
                kind:'smart',
                project:currentProjectId || 'default',
                board_x:120,
                board_y:120
            })
        });
        if(!createRes.ok) throw new Error('创建画布失败');
        const created = await createRes.json();
        const canvas = created.canvas;
        if(!canvas?.id) throw new Error('创建画布失败');
        const saveRes = await fetch(`/api/canvases/${encodeURIComponent(canvas.id)}`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                title:canvas.title || item.name || '工作流画布',
                icon:canvas.icon || 'sparkles',
                nodes:imported.nodes,
                connections:imported.connections,
                viewport:{x:0, y:0, scale:.82},
                logs:[],
                settings:{},
                // 2026-10-23（用户反馈：首页工作流点进去没反应）：后端保存接口带乐观锁，
                // 必须回传创建时返回的 updated_at 作为 base_updated_at，否则 409 被静默拒绝。
                base_updated_at:Number(canvas.updated_at || 0),
                source_type:'workflow',
                source_workflow_id:item.id || '',
                source_workflow_name:item.name || '',
                source_workflow_url:item.url || ''
            })
        });
        if(!saveRes.ok) throw new Error('写入工作流画布失败');
        rememberProjectId(canvas.project || currentProjectId || 'default');
        window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(canvas.id)}&project=${encodeURIComponent(canvas.project || currentProjectId || 'default')}&editWorkflowAsset=${encodeURIComponent(item.id || '')}&v=2026.07.15.workflow-overwrite`;
    } catch(err) {
        setStatus(err.message || '导入工作流失败');
    } finally {
        workflowNavGrid?.classList.remove('busy');
    }
}
function renderWorkflowNav(){
    if(!workflowNavGrid) return;
    const query = String(workflowNavQuery || '').trim().toLowerCase();
    renderWorkflowNavCategories();
    if(workflowNavTab === 'mine'){
        const saved = workflowNavSavedItems().filter(item => {
            if(!workflowNavSavedMatchesCategory(item, workflowNavCategory)) return false;
            if(query){
                const haystack = `${item.name || ''} ${item.description || ''} ${item.category_name || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
                if(!haystack.includes(query)) return false;
            }
            return true;
        });
        workflowNavPanel?.querySelectorAll('[data-workflow-nav-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.workflowNavTab === workflowNavTab));
        workflowNavPanel?.querySelectorAll('[data-workflow-nav-category]').forEach(btn => btn.classList.toggle('active', btn.dataset.workflowNavCategory === workflowNavCategory));
        if(workflowNavLoading){
            workflowNavGrid.innerHTML = '<div class="workflow-nav-empty">正在加载工作流...</div>';
            return;
        }
        if(!saved.length){
            workflowNavGrid.innerHTML = '<div class="workflow-nav-empty">还没有保存的工作流。进入画布后选中分组，点击“保存工作流”即可出现在这里。</div>';
            return;
        }
        workflowNavGrid.innerHTML = saved.map((item, index) => workflowNavSavedCardHtml(item, index)).join('');
        refreshIcons();
        return;
    }
    workflowNavPanel?.querySelectorAll('[data-workflow-nav-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.workflowNavTab === workflowNavTab));
    workflowNavPanel?.querySelectorAll('[data-workflow-nav-category]').forEach(btn => btn.classList.toggle('active', btn.dataset.workflowNavCategory === workflowNavCategory));
    workflowNavGrid.innerHTML = '<div class="workflow-nav-empty">工作流社区暂未开放。</div>';
    return;
    const list = workflowNavWorkflows.filter(workflow => {
        const meta = workflowNavMeta(workflow);
        if(workflowNavCategory !== 'all' && !(meta.cats || []).includes(workflowNavCategory)) return false;
        if(query){
            const haystack = `${workflow.name || ''} ${workflow.title || ''} ${workflowNavDisplayTitle(workflow)} ${meta.tag} ${meta.desc}`.toLowerCase();
            if(!haystack.includes(query)) return false;
        }
        return true;
    });
    workflowNavPanel?.querySelectorAll('[data-workflow-nav-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.workflowNavTab === workflowNavTab));
    workflowNavPanel?.querySelectorAll('[data-workflow-nav-category]').forEach(btn => btn.classList.toggle('active', btn.dataset.workflowNavCategory === workflowNavCategory));
    if(workflowNavLoading){
        workflowNavGrid.innerHTML = '<div class="workflow-nav-empty">正在加载工作流...</div>';
        return;
    }
    if(!list.length){
        workflowNavGrid.innerHTML = '<div class="workflow-nav-empty">没有匹配的工作流。换个分类或搜索词试试。</div>';
        return;
    }
    workflowNavGrid.innerHTML = list.map((workflow, index) => {
        const meta = workflowNavMeta(workflow);
        return `<button class="workflow-nav-card tone-${escapeHtml(meta.tone)}" type="button" data-workflow-nav-name="${escapeAttr(workflow.name)}">
            ${workflowNavCoverHtml(workflow, meta, index)}
            <span class="workflow-nav-info">
                <strong>${escapeHtml(workflowNavDisplayTitle(workflow))}</strong>
                <em>${escapeHtml(meta.desc)}</em>
            </span>
        </button>`;
    }).join('');
    refreshIcons();
}
async function loadWorkflowNavWorkflows(options={}){
    if(!options.force && (workflowNavLoaded || workflowNavLoading)) return;
    workflowNavLoading = true;
    if(options.force) workflowNavLoaded = false;
    renderWorkflowNav();
    try {
        const [data, assetData] = await Promise.all([
            fetch('/api/workflows').then(r => r.ok ? r.json() : {workflows:[]}),
            fetch('/api/asset-library').then(r => r.ok ? r.json() : {library:{libraries:[], categories:[]}}).catch(() => ({library:{libraries:[], categories:[]}}))
        ]);
        workflowNavWorkflows = Array.isArray(data.workflows) ? data.workflows : [];
        workflowNavAssetLibrary = assetData.library || {libraries:[], categories:[]};
        workflowNavLoaded = true;
    } catch(e){
        console.error(e);
        workflowNavWorkflows = [];
        setStatus('工作流加载失败');
    } finally {
        workflowNavLoading = false;
        renderWorkflowNav();
    }
}
async function openWorkflowNavPanel(){
    workflowNavOpen = true;
    workflowNavPanel?.classList.add('open');
    try { window.parent?.postMessage({type:'studio-workflow-nav-opened'}, location.origin); } catch(e) {}
    await loadWorkflowNavWorkflows();
    renderWorkflowNav();
}
async function deleteWorkflowNavItem(assetId=''){
    const id = String(assetId || '').trim();
    if(!id) return;
    if(!window.confirm('确定删除该工作流？删除后不可恢复。')) return;
    try {
        const res = await fetch(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'DELETE'});
        const data = await res.json().catch(() => ({}));
        if(!res.ok) throw new Error(data.detail || '删除工作流失败');
        if(data.library) workflowNavAssetLibrary = data.library;
        workflowNavLoaded = false;
        await loadWorkflowNavWorkflows({force:true});
        setStatus('已删除工作流');
    } catch(err){
        setStatus(err.message || '删除工作流失败');
        alert(err.message || '删除工作流失败');
    }
}
window.deleteWorkflowNavItem = deleteWorkflowNavItem;
function closeWorkflowNavPanel(){
    workflowNavOpen = false;
    closeWorkflowNavConfirm();
    workflowNavPanel?.classList.remove('open');
    try { window.parent?.postMessage({type:'studio-workflow-nav-closed'}, location.origin); } catch(e) {}
}

/* ===== Event bindings ===== */
board.addEventListener('mousedown', onBoardPanStart);
document.addEventListener('mousemove', onBoardPanMove);
document.addEventListener('mouseup', onBoardPanEnd);
board.addEventListener('wheel', onBoardWheel, { passive: false });
board.addEventListener('dblclick', e => {
    if(e.target.closest('.ws-card') || e.target.closest('.ws-create-card')) return;
    openCreateCard(screenToWorld(e.clientX, e.clientY));
});

newCanvasBtn.addEventListener('click', () => openCreateCard(boardCenterWorld()));
canvasTopBackBtn?.addEventListener('click', returnProjectOverview);
backProjectsBtn?.addEventListener('click', returnProjectOverview);
overviewNewProjectBtn?.addEventListener('click', openNewProject);
projectOverviewCreateBtn?.addEventListener('click', openNewProject);
projectOverviewGrid?.addEventListener('click', e => {
    const deleteConfirm = e.target.closest('[data-project-delete-confirm]');
    if(deleteConfirm){
        e.preventDefault();
        e.stopPropagation();
        deleteProjectToTrash(deleteConfirm.dataset.projectDeleteConfirm || '');
        return;
    }
    if(e.target.closest('[data-project-delete-cancel]')){
        e.preventDefault();
        e.stopPropagation();
        pendingDeleteProjectId = null;
        renderProjectOverview();
        return;
    }
    const del = e.target.closest('[data-project-delete]');
    if(del){
        e.preventDefault();
        e.stopPropagation();
        pendingDeleteProjectId = del.dataset.projectDelete || '';
        renderProjectOverview();
        return;
    }
    const rename = e.target.closest('[data-project-rename]');
    if(rename){
        e.preventDefault();
        e.stopPropagation();
        const card = rename.closest('[data-project-id]');
        startProjectOverviewRename(rename.dataset.projectRename, card);
        return;
    }
    const create = e.target.closest('[data-create-project]');
    if(create){
        openNewProject();
        return;
    }
    const card = e.target.closest('[data-project-id]');
    if(card){
        enterProject(card.dataset.projectId);
    }
});
projectOverviewGrid?.addEventListener('keydown', e => {
    if(e.key !== 'Enter' && e.key !== ' ') return;
    if(e.target.closest('input, button')) return;
    const create = e.target.closest('[data-create-project]');
    if(create){
        e.preventDefault();
        openNewProject();
        return;
    }
    const card = e.target.closest('[data-project-id]');
    if(card){
        e.preventDefault();
        enterProject(card.dataset.projectId);
    }
});
emptyCreateCanvasBtn?.addEventListener('mousedown', e => e.stopPropagation());
emptyCreateCanvasBtn?.addEventListener('click', e => {
    e.stopPropagation();
    openCreateCard(boardCenterWorld());
});
boardRefreshBtn.addEventListener('click', loadAll);
boardResetViewBtn.addEventListener('click', resetView);
boardFitViewBtn?.addEventListener('click', resetView);
boardZoomOutBtn?.addEventListener('click', () => stepBoardZoom(-1));
boardZoomInBtn?.addEventListener('click', () => stepBoardZoom(1));
boardZoomRange?.addEventListener('input', e => setBoardZoom(Number(e.target.value) / 100));
boardMapToggleBtn?.addEventListener('click', () => toggleBoardMinimap());
boardHelpBtn?.addEventListener('click', () => setStatus('滚轮缩放，拖动画布平移，点击节点进入画布，节点地图可查看当前位置'));
pasteCanvasBtn?.addEventListener('click', pasteCanvas);

newProjectBtn.addEventListener('click', openNewProject);
newProjectConfirm.addEventListener('click', createProject);
newProjectCancel.addEventListener('click', closeNewProject);
newProjectInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); createProject(); }
    if(e.key === 'Escape'){ e.preventDefault(); closeNewProject(); }
});

trashEntryBtn.addEventListener('click', () => {
    if(trashPanel.classList.contains('active')) closeTrashView();
    else openTrashView();
});
trashCloseBtn.addEventListener('click', closeTrashView);
trashEditToggleBtn?.addEventListener('click', () => setTrashEditMode(!trashEditMode));
trashSelectAllBtn?.addEventListener('click', toggleTrashSelectAll);
trashDeleteSelectedBtn?.addEventListener('click', deleteSelectedTrashCanvases);
trashClearAllBtn?.addEventListener('click', clearTrashCanvases);
workflowNavCloseBtn?.addEventListener('click', closeWorkflowNavPanel);
workflowNavSearch?.addEventListener('input', e => {
    workflowNavQuery = e.target.value || '';
    renderWorkflowNav();
});
workflowNavPanel?.addEventListener('click', e => {
    if(e.target === workflowNavPanel) closeWorkflowNavPanel();
    const tabBtn = e.target.closest('[data-workflow-nav-tab]');
    if(tabBtn){
        workflowNavTab = tabBtn.dataset.workflowNavTab || 'community';
        renderWorkflowNav();
        return;
    }
    const catBtn = e.target.closest('[data-workflow-nav-category]');
    if(catBtn){
        workflowNavCategory = catBtn.dataset.workflowNavCategory || 'all';
        renderWorkflowNav();
        return;
    }
    const delBtn = e.target.closest('[data-saved-workflow-delete]');
    if(delBtn){
        // 2026-09-20 卡片右上角删除按钮：直接删除工作流资产
        e.preventDefault();
        e.stopPropagation();
        deleteWorkflowNavItem(delBtn.dataset.savedWorkflowDelete || '');
        return;
    }
    const saved = e.target.closest('[data-workflow-nav-asset]');
    if(saved){
        openWorkflowNavConfirm(saved.dataset.workflowNavAsset || '');
        return;
    }
    const card = e.target.closest('[data-workflow-nav-name]');
    if(card){
        const workflow = workflowNavWorkflows.find(item => item.name === card.dataset.workflowNavName);
        setStatus(workflow ? `已选择 ${workflowNavDisplayTitle(workflow)}` : '已选择工作流');
    }
});

// close card menu when clicking outside
document.addEventListener('mousedown', e => {
    if(document.querySelector('.ws-card-pop') && !e.target.closest('.ws-card-pop') && !e.target.closest('.ws-card-menu')){
        closeCardMenu();
    }
    if(document.querySelector('.ws-card.confirming-delete') && !e.target.closest('.ws-card.confirming-delete')){
        boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => el.classList.remove('confirming-delete'));
    }
});

document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    closeCardMenu();
    closeCreateCard();
    boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => el.classList.remove('confirming-delete'));
    if(trashPanel.classList.contains('active')) closeTrashView();
    if(workflowNavOpen) closeWorkflowNavPanel();
});

// language switch from parent (index.html) via postMessage
window.addEventListener('message', event => {
    if(event.origin && event.origin !== location.origin) return;
    if(event.data?.type === 'studio-lang'){
        if(event.data.lang && window.StudioI18n) StudioI18n.set(event.data.lang);
        window.StudioI18n?.apply?.();
        renderProjects();
        if(projectOverviewMode) renderProjectOverview();
        else renderBoard();
        if(trashPanel.classList.contains('active')) renderTrash();
        if(workflowNavOpen) renderWorkflowNav();
        refreshIcons();
    }
    if(event.data?.type === 'studio-open-workflow-nav') {
        openWorkflowNavPanel();
    }
    if(event.data?.type === 'studio-open-trash') {
        setProjectOverviewMode(false);
        renderBoard();
        openTrashView();
    }
    if(event.data?.type === 'studio-close-workflow-nav' && workflowNavOpen) {
        closeWorkflowNavPanel();
    }
    if(event.data?.type === 'asset_library_updated') {
        workflowNavLoaded = false;
        if(workflowNavOpen) loadWorkflowNavWorkflows({force:true});
    }
    if(event.data?.type === 'canvas-focus') {
        setProjectOverviewMode(true);
    }
});

try {
    const studioApiChannel = new BroadcastChannel('studio-api');
    studioApiChannel.onmessage = event => {
        if(event.data?.type !== 'asset_library_updated') return;
        workflowNavLoaded = false;
        if(workflowNavOpen) loadWorkflowNavWorkflows({force:true});
    };
} catch(e) {}

/* ===== Boot ===== */
window.StudioI18n?.apply?.();
document.body.classList.toggle('project-overview-mode', projectOverviewMode);
applyViewport();
loadAll().then(() => {
    if(shouldOpenWorkflowNavOnBoot()) openWorkflowNavPanel();
});
refreshIcons();

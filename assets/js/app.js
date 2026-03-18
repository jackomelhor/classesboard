const state = {
  client: window.classboardSupabase?.client || null,
  ready: Boolean(window.classboardSupabase?.ready),
  configError: window.classboardSupabase?.configError || null,
  authMode: 'signin',
  session: null,
  user: null,
  profile: null,
  workspaces: [],
  currentWorkspaceId: localStorage.getItem('classboard.currentWorkspaceId') || null,
  tasks: [],
  members: [],
  announcements: [],
  materials: [],
  currentView: 'dashboard',
  filters: { status: '', priority: '', type: '', search: '' },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));


const LABELS = {
  taskType: { prova: 'Prova', trabalho: 'Trabalho', atividade: 'Atividade', apresentacao: 'Apresentação', estudo: 'Estudo' },
  priority: { baixa: 'Baixa', media: 'Média', alta: 'Alta' },
  status: { pendente: 'Pendente', andamento: 'Em andamento', concluido: 'Concluída' },
  role: { owner: 'Responsável', admin: 'Administrador', member: 'Membro' },
  workspaceType: { grupo: 'Grupo', turma: 'Turma', individual: 'Individual' },
  materialType: { link: 'Link', pdf: 'PDF', slides: 'Slides', documento: 'Documento', video: 'Vídeo' },
};

function labelFor(group, value, fallback = '—') {
  return LABELS[group]?.[value] || value || fallback;
}

function setSectionMessage(selector, title, text) {
  const host = $(selector);
  if (!host) return;
  host.innerHTML = `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function setWorkspaceDependents() {
  const hasWorkspace = Boolean(getCurrentWorkspace());
  ['#taskForm input', '#taskForm textarea', '#taskForm select', '#announcementForm input', '#announcementForm textarea', '#announcementForm select', '#materialForm input', '#materialForm textarea', '#materialForm select']
    .forEach((selector) => {
      $$(selector).forEach((el) => {
        if (['taskId', 'announcementId', 'materialId'].includes(el.id)) return;
        el.disabled = !hasWorkspace;
      });
    });

  ['#taskForm button[type="submit"]', '#announcementForm button[type="submit"]', '#materialForm button[type="submit"]']
    .forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = !hasWorkspace;
    });

  ['taskForm', 'announcementForm', 'materialForm'].forEach((id) => {
    const form = document.getElementById(id);
    if (form) form.dataset.locked = hasWorkspace ? 'false' : 'true';
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function supa() {
  if (!state.ready || !state.client) {
    throw new Error(state.configError || 'Serviço temporariamente indisponível.');
  }
  return state.client;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr, withTime = false) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    const [y, m, d] = String(dateStr).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const opts = withTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Intl.DateTimeFormat('pt-BR', opts).format(date);
}

function daysUntil(dateStr) {
  const today = new Date(`${todayISO()}T00:00:00`);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

function randomInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function toast(message, type = 'info') {
  const host = $('#toastContainer');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<strong>${type === 'success' ? 'Pronto' : type === 'danger' ? 'Algo deu errado' : type === 'warning' ? 'Atenção' : 'ClassBoard'}</strong><span>${escapeHtml(message)}</span>`;
  host.appendChild(node);
  setTimeout(() => node.classList.add('visible'), 20);
  setTimeout(() => {
    node.classList.remove('visible');
    setTimeout(() => node.remove(), 250);
  }, 4200);
}

function authScreen() {
  $('#authScreen').classList.add('active');
  $('#appScreen').classList.remove('active');
}

function appScreen() {
  $('#authScreen').classList.remove('active');
  $('#appScreen').classList.add('active');
}

function getCurrentWorkspace() {
  return state.workspaces.find((w) => w.id === state.currentWorkspaceId) || null;
}

function getCurrentMember() {
  return state.members.find((m) => m.user_id === state.user?.id) || null;
}

function getCurrentRole() {
  return getCurrentMember()?.role || getCurrentWorkspace()?.my_role || null;
}

function canManageWorkspace() {
  return ['owner', 'admin'].includes(getCurrentRole());
}

function canTransferOwnership() {
  return getCurrentRole() === 'owner';
}

function canEditTask(task) {
  if (!task) return false;
  const role = getCurrentRole();
  return task.author_id === state.user?.id || role === 'owner' || role === 'admin';
}

function canEditPost(item) {
  if (!item) return false;
  const role = getCurrentRole();
  return item.author_id === state.user?.id || role === 'owner' || role === 'admin';
}

function displayNameByUserId(userId) {
  if (!userId) return 'Equipe';
  if (state.profile?.id === userId) return state.profile.full_name;
  return state.members.find((m) => m.user_id === userId)?.full_name || 'Equipe';
}

function updateAuthText(mode) {
  const eyebrow = $('#authEyebrow');
  const title = $('#authTitle');
  const subtitle = $('#authSubtitle');

  if (mode === 'signup') {
    eyebrow.textContent = 'Crie sua conta';
    title.textContent = 'Comece seu workspace';
    subtitle.textContent = 'Abra sua área, convide pessoas e organize tarefas, provas e materiais.';
  } else if (mode === 'recover') {
    eyebrow.textContent = 'Recuperar acesso';
    title.textContent = 'Redefina sua senha';
    subtitle.textContent = 'Enviaremos um link de recuperação para o email informado.';
  } else {
    eyebrow.textContent = 'Bem-vindo de volta';
    title.textContent = 'Entre na sua conta';
    subtitle.textContent = 'Acesse seus workspaces, tarefas e lembretes com poucos cliques.';
  }
}

function setAuthMode(mode) {
  state.authMode = ['signin', 'signup', 'recover'].includes(mode) ? mode : 'signin';
  $$('.auth-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.authMode === state.authMode));
  $$('.auth-form').forEach((form) => form.classList.remove('active'));
  if (state.authMode === 'signin') $('#signInForm').classList.add('active');
  if (state.authMode === 'signup') $('#signUpForm').classList.add('active');
  if (state.authMode === 'recover') $('#recoverForm').classList.add('active');
  updateAuthText(state.authMode);
}

function switchView(viewName) {
  state.currentView = viewName;
  $$('.nav-link').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === viewName));
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${viewName}`));
}

function resetTaskForm() {
  $('#taskForm').reset();
  $('#taskId').value = '';
  $('#taskType').value = 'prova';
  $('#taskPriority').value = 'media';
  $('#taskStatus').value = 'pendente';
}

function resetAnnouncementForm() {
  $('#announcementForm').reset();
  $('#announcementId').value = '';
  $('#announcementPinned').value = 'false';
}

function resetMaterialForm() {
  $('#materialForm').reset();
  $('#materialId').value = '';
  $('#materialType').value = 'link';
}

function parseChecklist(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ text: line, is_done: false, sort_order: index + 1 }));
}

function getFilteredTasks() {
  const search = state.filters.search.trim().toLowerCase();
  return state.tasks.filter((task) => {
    if (state.filters.status && task.status !== state.filters.status) return false;
    if (state.filters.priority && task.priority !== state.filters.priority) return false;
    if (state.filters.type && task.task_type !== state.filters.type) return false;
    if (!search) return true;
    return `${task.title} ${task.subject || ''} ${task.description || ''}`.toLowerCase().includes(search);
  });
}

async function ensureProfile() {
  const fallbackName = state.user?.user_metadata?.full_name || state.user?.email?.split('@')[0] || 'Usuário';
  const payload = {
    id: state.user.id,
    full_name: fallbackName,
    email: state.user.email,
  };
  const { data, error } = await supa().from('profiles').upsert(payload, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  state.profile = data;
}

async function loadWorkspaces() {
  const { data, error } = await supa()
    .from('workspace_members')
    .select(`
      role,
      workspace_id,
      workspaces (
        id,
        owner_id,
        name,
        school_name,
        type,
        invite_code,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', state.user.id);

  if (error) throw error;

  state.workspaces = (data || []).map((row) => ({ ...(row.workspaces || {}), my_role: row.role })).filter((row) => row.id);
  state.workspaces.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));

  if (!state.currentWorkspaceId || !state.workspaces.some((w) => w.id === state.currentWorkspaceId)) {
    state.currentWorkspaceId = state.workspaces[0]?.id || null;
  }
  localStorage.setItem('classboard.currentWorkspaceId', state.currentWorkspaceId || '');
}

async function loadMembers() {
  if (!state.currentWorkspaceId) {
    state.members = [];
    return;
  }
  const { data, error } = await supa()
    .from('workspace_members')
    .select(`
      id,
      user_id,
      role,
      created_at,
      profiles ( full_name, email )
    `)
    .eq('workspace_id', state.currentWorkspaceId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  state.members = (data || []).map((item) => ({
    ...item,
    full_name: item.profiles?.full_name || 'Sem nome',
    email: item.profiles?.email || 'Sem email',
  }));
}

async function loadTasks() {
  if (!state.currentWorkspaceId) {
    state.tasks = [];
    return;
  }
  const { data, error } = await supa()
    .from('tasks')
    .select(`
      id,
      workspace_id,
      author_id,
      title,
      description,
      subject,
      task_type,
      due_date,
      priority,
      status,
      created_at,
      updated_at,
      task_checklist_items ( id, text, is_done, sort_order )
    `)
    .eq('workspace_id', state.currentWorkspaceId)
    .order('due_date', { ascending: true });

  if (error) throw error;
  state.tasks = (data || []).map((item) => ({
    ...item,
    task_checklist_items: (item.task_checklist_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
  }));
}

async function loadAnnouncements() {
  if (!state.currentWorkspaceId) {
    state.announcements = [];
    return;
  }
  const { data, error } = await supa()
    .from('announcements')
    .select('*')
    .eq('workspace_id', state.currentWorkspaceId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  state.announcements = data || [];
}

async function loadMaterials() {
  if (!state.currentWorkspaceId) {
    state.materials = [];
    return;
  }
  const { data, error } = await supa()
    .from('materials')
    .select('*')
    .eq('workspace_id', state.currentWorkspaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  state.materials = data || [];
}

async function refreshAllData() {
  if (!state.user) return;
  await ensureProfile();
  await loadWorkspaces();
  await loadMembers();
  await loadTasks();
  await loadAnnouncements();
  await loadMaterials();
  renderAll();
}

function renderTopbar() {
  const workspace = getCurrentWorkspace();
  $('#workspaceTitle').textContent = workspace?.name || 'Nenhum workspace selecionado';
  $('#workspaceSubtitle').textContent = workspace
    ? `${workspace.school_name || 'Sem escola'} · ${labelFor('workspaceType', workspace.type)} · ${labelFor('role', workspace.my_role)}`
    : 'Uma base organizada para acompanhar tarefas, avisos, materiais e pessoas no mesmo espaço.';
  $('#sidebarUserName').textContent = state.profile?.full_name || '—';
  $('#sidebarUserEmail').textContent = state.profile?.email || state.user?.email || '—';

  const switcher = $('#workspaceSwitcher');
  if (!state.workspaces.length) {
    switcher.innerHTML = '<option value="">Sem workspace</option>';
    switcher.value = '';
  } else {
    switcher.innerHTML = state.workspaces.map((ws) => `<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.name)} · ${escapeHtml(ws.my_role)}</option>`).join('');
    switcher.value = state.currentWorkspaceId;
  }
}

function renderDashboard() {
  const tasks = state.tasks.slice();
  const today = todayISO();
  const in7 = addDays(today, 7);
  const dueToday = tasks.filter((task) => task.status !== 'concluido' && task.due_date === today);
  const overdue = tasks.filter((task) => task.status !== 'concluido' && task.due_date < today);
  const week = tasks.filter((task) => task.due_date >= today && task.due_date <= in7);
  const nextTasks = tasks.filter((task) => task.status !== 'concluido').slice(0, 5);
  const attention = [...overdue, ...tasks.filter((task) => task.task_type === 'prova' && task.due_date >= today && daysUntil(task.due_date) <= 3)].slice(0, 5);
  const pinnedAnnouncements = state.announcements.filter((a) => a.pinned).slice(0, 4);

  $('#metricToday').textContent = dueToday.length;
  $('#metricOverdue').textContent = overdue.length;
  $('#metricMembers').textContent = state.members.length;
  $('#metricAnnouncements').textContent = state.announcements.length;
  $('#summaryDone').textContent = week.filter((task) => task.status === 'concluido').length;
  $('#summaryOpen').textContent = week.filter((task) => task.status !== 'concluido').length;
  $('#summaryExams').textContent = week.filter((task) => task.task_type === 'prova').length;
  $('#summaryMaterials').textContent = state.materials.length;
  $('#weekBadge').textContent = `Próximos 7 dias`;
  $('#nextTasksBadge').textContent = String(nextTasks.length);
  $('#attentionBadge').textContent = String(attention.length);

  if (!getCurrentWorkspace()) {
    $('#dashboardHeadline').textContent = 'Comece criando seu primeiro workspace';
    $('#dashboardSummary').textContent = 'Você pode organizar uma turma completa, um pequeno grupo ou um espaço individual.';
  } else if (dueToday.length) {
    $('#dashboardHeadline').textContent = `${dueToday.length} compromisso(s) para hoje`;
    $('#dashboardSummary').textContent = dueToday.map((task) => task.title).join(' · ');
  } else if (overdue.length) {
    $('#dashboardHeadline').textContent = `${overdue.length} tarefa(s) atrasada(s)`;
    $('#dashboardSummary').textContent = 'Vale revisar as pendências e reorganizar os próximos passos.';
  } else {
    $('#dashboardHeadline').textContent = 'Tudo em bom andamento';
    $('#dashboardSummary').textContent = 'Seu painel está atualizado e pronto para novos registros.';
  }

  renderMiniTaskList('#dashboardNextTasks', nextTasks, 'Nenhuma tarefa pendente.');
  renderMiniTaskList('#dashboardAttention', attention, 'Sem alertas importantes no momento.');
  renderAnnouncementMiniList('#dashboardAnnouncements', pinnedAnnouncements, 'Nenhum aviso em destaque.');

  const snapshot = $('#workspaceSnapshot');
  const workspace = getCurrentWorkspace();
  if (!workspace) {
    snapshot.innerHTML = '<div class="empty-state">Nenhum workspace ativo.</div>';
    return;
  }
  snapshot.innerHTML = `
    <div class="list-item">
      <div class="list-item-title">${escapeHtml(workspace.name)}</div>
      <div class="subtle">${escapeHtml(workspace.school_name || 'Sem escola')} · ${escapeHtml(labelFor('workspaceType', workspace.type))}</div>
    </div>
    <div class="list-item">
      <div class="list-item-title">Papel atual</div>
      <div class="subtle">${escapeHtml(labelFor('role', workspace.my_role || 'member'))}</div>
    </div>
    <div class="list-item">
      <div class="list-item-title">Código de convite</div>
      <div class="subtle">${canManageWorkspace() ? escapeHtml(workspace.invite_code || '—') : 'Visível para owner e admins'}</div>
    </div>
  `;
}

function renderMiniTaskList(selector, tasks, emptyText) {
  const host = $(selector);
  if (!tasks.length) {
    host.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }
  host.innerHTML = tasks.map((task) => {
    const due = daysUntil(task.due_date);
    const dueText = due < 0 ? `${Math.abs(due)} dia(s) atrasada` : due === 0 ? 'Hoje' : `Em ${due} dia(s)`;
    return `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(task.title)}</div>
        <div class="subtle">${escapeHtml(task.subject || 'Sem matéria')} · ${formatDate(task.due_date)}</div>
        <div class="meta-line"><span class="pill ${task.priority === 'alta' ? 'high' : task.priority === 'media' ? 'medium' : 'low'}">${escapeHtml(labelFor('priority', task.priority))}</span><span class="pill ${due < 0 ? 'overdue' : 'info'}">${dueText}</span></div>
      </div>
    `;
  }).join('');
}

function renderAnnouncementMiniList(selector, items, emptyText) {
  const host = $(selector);
  if (!items.length) {
    host.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }
  host.innerHTML = items.map((item) => `
    <div class="list-item">
      <div class="list-item-title">${escapeHtml(item.title)}</div>
      <div class="subtle">${escapeHtml(item.content).slice(0, 100)}${item.content.length > 100 ? '…' : ''}</div>
    </div>
  `).join('');
}

function renderTasks() {
  const host = $('#taskList');
  if (!getCurrentWorkspace()) {
    setSectionMessage('#taskList', 'Sem workspace ativo', 'As tarefas passam a aparecer assim que houver um workspace selecionado.');
    return;
  }

  const tasks = getFilteredTasks();
  if (!tasks.length) {
    setSectionMessage('#taskList', 'Nada por aqui', 'Os filtros atuais não retornaram tarefas no momento.');
    return;
  }

  host.innerHTML = tasks.map((task) => {
    const due = daysUntil(task.due_date);
    const dueText = due < 0 ? `${Math.abs(due)} dia(s) atrasada` : due === 0 ? 'Hoje' : `Em ${due} dia(s)`;
    const checklist = (task.task_checklist_items || []).length
      ? `<ul class="task-checklist">${task.task_checklist_items.map((item) => `
          <li>
            <label>
              <input type="checkbox" data-check-id="${escapeHtml(item.id)}" ${item.is_done ? 'checked' : ''}>
              <span>${escapeHtml(item.text)}</span>
            </label>
          </li>`).join('')}</ul>`
      : '<div class="subtle top-gap">Sem checklist cadastrado.</div>';

    return `
      <article class="task-card">
        <div class="task-card-head">
          <div>
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="subtle">${escapeHtml(task.subject || 'Sem matéria')} · ${formatDate(task.due_date)}</div>
          </div>
          <div class="meta-line">
            <span class="pill ${task.priority === 'alta' ? 'high' : task.priority === 'media' ? 'medium' : 'low'}">${escapeHtml(labelFor('priority', task.priority))}</span>
            <span class="pill ${due < 0 ? 'overdue' : 'info'}">${dueText}</span>
          </div>
        </div>
        <p>${escapeHtml(task.description || 'Sem descrição.')}</p>
        <div class="meta-line">
          <span class="pill info">${escapeHtml(labelFor('taskType', task.task_type))}</span>
          <span class="pill info">${escapeHtml(labelFor('status', task.status))}</span>
          <span class="pill info">${escapeHtml(displayNameByUserId(task.author_id))}</span>
        </div>
        ${checklist}
        <div class="button-row top-gap">
          <button class="ghost-btn" data-edit-task="${escapeHtml(task.id)}" ${canEditTask(task) ? '' : 'disabled'}>Editar</button>
          <button class="ghost-btn danger" data-delete-task="${escapeHtml(task.id)}" ${canEditTask(task) ? '' : 'disabled'}>Excluir</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderAgenda() {
  const host = $('#agendaList');
  const today = todayISO();
  const limit = addDays(today, 30);
  const tasks = state.tasks.filter((task) => task.due_date >= today && task.due_date <= limit);

  if (!tasks.length) {
    host.innerHTML = '<div class="empty-state">Nenhum evento nos próximos 30 dias.</div>';
    return;
  }

  const grouped = tasks.reduce((acc, task) => {
    acc[task.due_date] ||= [];
    acc[task.due_date].push(task);
    return acc;
  }, {});

  host.innerHTML = Object.keys(grouped).sort().map((date) => `
    <article class="card">
      <div class="card-head">
        <h3>${formatDate(date)}</h3>
        <span class="badge info">${grouped[date].length} item(ns)</span>
      </div>
      <div class="list-stack">
        ${grouped[date].map((task) => `
          <div class="list-item">
            <div class="list-item-title">${escapeHtml(task.title)}</div>
            <div class="subtle">${escapeHtml(task.subject || 'Sem matéria')} · ${escapeHtml(task.task_type)} · ${escapeHtml(task.status)}</div>
          </div>
        `).join('')}
      </div>
    </article>
  `).join('');
}

function renderAnnouncements() {
  const host = $('#announcementList');
  if (!getCurrentWorkspace()) {
    setSectionMessage('#announcementList', 'Sem workspace ativo', 'Os avisos ficam disponíveis dentro de cada workspace.');
    return;
  }
  if (!state.announcements.length) {
    setSectionMessage('#announcementList', 'Nenhum aviso ainda', 'Quando surgirem comunicados, eles aparecerão aqui.');
    return;
  }
  host.innerHTML = state.announcements.map((item) => `
    <article class="announcement-card ${item.pinned ? 'pinned' : ''}">
      <div class="task-card-head">
        <div>
          <div class="task-title">${escapeHtml(item.title)}</div>
          <div class="subtle">${formatDate(item.created_at, true)} · ${escapeHtml(displayNameByUserId(item.author_id))}</div>
        </div>
        <div class="meta-line">
          ${item.pinned ? '<span class="pill info">Fixado</span>' : ''}
        </div>
      </div>
      <p>${escapeHtml(item.content)}</p>
      <div class="button-row top-gap">
        <button class="ghost-btn" data-edit-announcement="${escapeHtml(item.id)}" ${canEditPost(item) ? '' : 'disabled'}>Editar</button>
        <button class="ghost-btn danger" data-delete-announcement="${escapeHtml(item.id)}" ${canEditPost(item) ? '' : 'disabled'}>Excluir</button>
      </div>
    </article>
  `).join('');
}

function renderMaterials() {
  const host = $('#materialList');
  if (!getCurrentWorkspace()) {
    setSectionMessage('#materialList', 'Sem workspace ativo', 'Os materiais ficam organizados dentro de cada workspace.');
    return;
  }
  if (!state.materials.length) {
    setSectionMessage('#materialList', 'Nenhum material ainda', 'Links, slides, PDFs e referências aparecem aqui.');
    return;
  }
  host.innerHTML = state.materials.map((item) => `
    <article class="material-card">
      <div class="task-card-head">
        <div>
          <div class="task-title">${escapeHtml(item.title)}</div>
          <div class="subtle">${escapeHtml(labelFor('materialType', item.material_type))} · ${escapeHtml(displayNameByUserId(item.author_id))}</div>
        </div>
        <span class="pill info">${formatDate(item.created_at, true)}</span>
      </div>
      <p>${escapeHtml(item.description || 'Sem descrição.')}</p>
      <div class="button-row top-gap wrap">
        <a class="ghost-btn link-btn" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>
        <button class="ghost-btn" data-edit-material="${escapeHtml(item.id)}" ${canEditPost(item) ? '' : 'disabled'}>Editar</button>
        <button class="ghost-btn danger" data-delete-material="${escapeHtml(item.id)}" ${canEditPost(item) ? '' : 'disabled'}>Excluir</button>
      </div>
    </article>
  `).join('');
}

function renderMembers() {
  const host = $('#memberList');
  const select = $('#memberSelect');
  const role = $('#memberRole');
  const canManage = canManageWorkspace();

  if (!getCurrentWorkspace()) {
    setSectionMessage('#memberList', 'Sem workspace ativo', 'A lista de membros aparece quando houver um workspace selecionado.');
    select.innerHTML = '<option value="">Nenhum membro</option>';
    role.disabled = true;
    $('#removeMemberBtn').disabled = true;
    return;
  }

  host.innerHTML = state.members.length
    ? state.members.map((member) => `
        <article class="member-card">
          <div class="task-card-head">
            <div>
              <div class="task-title">${escapeHtml(member.full_name)}</div>
              <div class="subtle">${escapeHtml(member.email)}</div>
            </div>
            <span class="pill info">${escapeHtml(labelFor('role', member.role))}</span>
          </div>
        </article>
      `).join('')
    : '<div class="empty-state">Nenhum membro encontrado.</div>';

  select.innerHTML = state.members.length ? state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.full_name)} · ${escapeHtml(labelFor('role', member.role))}</option>`).join('') : '<option value="">Nenhum membro</option>';
  select.disabled = !canManage;
  role.disabled = !canManage;
  $('#removeMemberBtn').disabled = !canManage;
  const selected = state.members.find((m) => m.id === select.value) || state.members[0];
  if (selected) {
    select.value = selected.id;
    role.value = selected.role;
  }
}

function renderWorkspaceView() {
  const host = $('#workspaceList');
  if (!state.workspaces.length) {
    setSectionMessage('#workspaceList', 'Nenhum espaço disponível', 'Assim que o primeiro workspace surgir, ele aparecerá aqui.');
  } else {
    host.innerHTML = state.workspaces.map((ws) => `
      <article class="workspace-card ${ws.id === state.currentWorkspaceId ? 'active-card' : ''}">
        <div class="task-card-head">
          <div>
            <div class="task-title">${escapeHtml(ws.name)}</div>
            <div class="subtle">${escapeHtml(ws.school_name || 'Sem escola')} · ${escapeHtml(labelFor('workspaceType', ws.type))} · ${escapeHtml(labelFor('role', ws.my_role))}</div>
          </div>
          <button class="ghost-btn" data-select-workspace="${escapeHtml(ws.id)}">Abrir</button>
        </div>
      </article>
    `).join('');
  }

  const current = getCurrentWorkspace();
  $('#workspaceSettingsName').value = current?.name || '';
  $('#workspaceSettingsSchool').value = current?.school_name || '';
  $('#workspaceSettingsType').value = current?.type || 'grupo';
  $('#workspaceSettingsInvite').value = current?.invite_code || '';

  const canManage = Boolean(current) && canManageWorkspace();
  $('#workspaceSettingsName').disabled = !canManage;
  $('#workspaceSettingsSchool').disabled = !canManage;
  $('#workspaceSettingsType').disabled = !canManage;
  $('#copyInviteBtn').disabled = !current || !canManageWorkspace();
  $('#regenerateInviteBtn').disabled = !current || !canManageWorkspace();
  $('#deleteWorkspaceBtn').disabled = !current || getCurrentRole() !== 'owner';
  $('#leaveWorkspaceBtn').disabled = !current || getCurrentRole() === 'owner';
}

function renderAccount() {
  $('#profileName').value = state.profile?.full_name || '';
  $('#profileEmail').value = state.profile?.email || state.user?.email || '';
}

function renderAll() {
  renderTopbar();
  renderDashboard();
  renderTasks();
  renderAgenda();
  renderAnnouncements();
  renderMaterials();
  renderMembers();
  renderWorkspaceView();
  renderAccount();
  setWorkspaceDependents();
}

function fillTaskForm(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  $('#taskId').value = task.id;
  $('#taskTitle').value = task.title || '';
  $('#taskSubject').value = task.subject || '';
  $('#taskType').value = task.task_type || 'atividade';
  $('#taskPriority').value = task.priority || 'media';
  $('#taskStatus').value = task.status || 'pendente';
  $('#taskDueDate').value = task.due_date || '';
  $('#taskDescription').value = task.description || '';
  $('#taskChecklist').value = (task.task_checklist_items || []).map((item) => item.text).join('\n');
  switchView('tasks');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillAnnouncementForm(id) {
  const item = state.announcements.find((a) => a.id === id);
  if (!item) return;
  $('#announcementId').value = item.id;
  $('#announcementTitle').value = item.title || '';
  $('#announcementContent').value = item.content || '';
  $('#announcementPinned').value = item.pinned ? 'true' : 'false';
  switchView('announcements');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillMaterialForm(id) {
  const item = state.materials.find((a) => a.id === id);
  if (!item) return;
  $('#materialId').value = item.id;
  $('#materialTitle').value = item.title || '';
  $('#materialUrl').value = item.url || '';
  $('#materialType').value = item.material_type || 'link';
  $('#materialDescription').value = item.description || '';
  switchView('materials');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleSignIn(event) {
  event.preventDefault();
  try {
    const email = $('#signInEmail').value.trim();
    const password = $('#signInPassword').value;
    const { error } = await supa().auth.signInWithPassword({ email, password });
    if (error) throw error;
    toast('Login realizado com sucesso.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível entrar.', 'danger');
  }
}

async function handleSignUp(event) {
  event.preventDefault();
  try {
    const fullName = $('#signUpName').value.trim();
    const email = $('#signUpEmail').value.trim();
    const password = $('#signUpPassword').value;
    const { error } = await supa().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    toast('Conta criada. Verifique seu email se a confirmação estiver ativa.', 'success');
    $('#signInEmail').value = email;
    $('#signInPassword').value = password;
    setAuthMode('signin');
  } catch (error) {
    toast(error.message || 'Não foi possível criar a conta.', 'danger');
  }
}

async function handleRecovery(event) {
  event.preventDefault();
  try {
    const email = $('#recoverEmail').value.trim();
    const redirectTo = window.location.href.split('#')[0];
    const { error } = await supa().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    toast('Link de recuperação enviado.', 'success');
    $('#recoverForm').reset();
  } catch (error) {
    toast(error.message || 'Não foi possível enviar o link.', 'danger');
  }
}

async function handleSignOut() {
  try {
    const { error } = await supa().auth.signOut();
    if (error) throw error;
    state.session = null;
    state.user = null;
    state.profile = null;
    state.workspaces = [];
    state.currentWorkspaceId = null;
    state.tasks = [];
    state.members = [];
    state.announcements = [];
    state.materials = [];
    localStorage.removeItem('classboard.currentWorkspaceId');
    authScreen();
    toast('Sessão encerrada.', 'info');
  } catch (error) {
    toast(error.message || 'Não foi possível sair.', 'danger');
  }
}

async function handleWorkspaceCreate(event) {
  event.preventDefault();
  try {
    const payload = {
      owner_id: state.user.id,
      name: $('#workspaceName').value.trim(),
      school_name: $('#workspaceSchool').value.trim(),
      type: $('#workspaceType').value,
      invite_code: randomInviteCode(),
    };
    const { error } = await supa().from('workspaces').insert(payload);
    if (error) throw error;
    event.target.reset();
    await refreshAllData();
    switchView('workspace');
    toast('Workspace criado com sucesso.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível criar o workspace.', 'danger');
  }
}

async function handleWorkspaceJoin(event) {
  event.preventDefault();
  try {
    const invite = $('#inviteCodeInput').value.trim().toUpperCase();
    const { error } = await supa().rpc('join_workspace_by_code', { invite });
    if (error) throw error;
    event.target.reset();
    await refreshAllData();
    toast('Entrada realizada com sucesso.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível entrar no workspace.', 'danger');
  }
}

async function handleWorkspaceSettings(event) {
  event.preventDefault();
  try {
    const current = getCurrentWorkspace();
    if (!current) throw new Error('Nenhum workspace selecionado.');
    const payload = {
      name: $('#workspaceSettingsName').value.trim(),
      school_name: $('#workspaceSettingsSchool').value.trim(),
      type: $('#workspaceSettingsType').value,
    };
    const { error } = await supa().from('workspaces').update(payload).eq('id', current.id);
    if (error) throw error;
    await refreshAllData();
    toast('Workspace atualizado.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível salvar o workspace.', 'danger');
  }
}

async function handleLeaveWorkspace() {
  try {
    const current = getCurrentWorkspace();
    if (!current) throw new Error('Nenhum workspace selecionado.');
    if (!window.confirm('Deseja sair deste workspace?')) return;
    const { error } = await supa().rpc('leave_current_workspace', { p_workspace_id: current.id });
    if (error) throw error;
    await refreshAllData();
    toast('Você saiu do workspace.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível sair do workspace.', 'danger');
  }
}

async function handleDeleteWorkspace() {
  try {
    const current = getCurrentWorkspace();
    if (!current) throw new Error('Nenhum workspace selecionado.');
    if (!window.confirm(`Excluir definitivamente "${current.name}"?`)) return;
    const { error } = await supa().from('workspaces').delete().eq('id', current.id);
    if (error) throw error;
    await refreshAllData();
    toast('Workspace excluído.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível excluir o workspace.', 'danger');
  }
}

async function handleInviteRegeneration() {
  try {
    const current = getCurrentWorkspace();
    if (!current) throw new Error('Nenhum workspace selecionado.');
    const { error } = await supa().rpc('regenerate_workspace_code', { p_workspace_id: current.id });
    if (error) throw error;
    await refreshAllData();
    toast('Novo código de convite gerado.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível gerar um novo código.', 'danger');
  }
}

async function handleTaskSave(event) {
  event.preventDefault();
  try {
    const current = getCurrentWorkspace();
    if (!current) throw new Error('Selecione um workspace antes de salvar tarefas.');

    const taskId = $('#taskId').value.trim();
    const payload = {
      workspace_id: current.id,
      author_id: state.user.id,
      title: $('#taskTitle').value.trim(),
      subject: $('#taskSubject').value.trim(),
      task_type: $('#taskType').value,
      priority: $('#taskPriority').value,
      status: $('#taskStatus').value,
      due_date: $('#taskDueDate').value,
      description: $('#taskDescription').value.trim(),
    };

    let savedId = taskId;

    if (taskId) {
      const existing = state.tasks.find((task) => task.id === taskId);
      if (!existing) throw new Error('Tarefa não encontrada.');
      payload.author_id = existing.author_id;
      const { error } = await supa().from('tasks').update(payload).eq('id', taskId);
      if (error) throw error;
      const { error: clearChecklistError } = await supa().from('task_checklist_items').delete().eq('task_id', taskId);
      if (clearChecklistError) throw clearChecklistError;
    } else {
      const { data, error } = await supa().from('tasks').insert(payload).select('id').single();
      if (error) throw error;
      savedId = data.id;
    }

    const checklistRows = parseChecklist($('#taskChecklist').value).map((item) => ({ ...item, task_id: savedId }));
    if (checklistRows.length) {
      const { error } = await supa().from('task_checklist_items').insert(checklistRows);
      if (error) throw error;
    }

    resetTaskForm();
    await refreshAllData();
    toast(taskId ? 'Tarefa atualizada.' : 'Tarefa criada com sucesso.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível salvar a tarefa.', 'danger');
  }
}

async function handleTaskDelete(taskId) {
  try {
    if (!window.confirm('Deseja excluir esta tarefa?')) return;
    const { error } = await supa().from('tasks').delete().eq('id', taskId);
    if (error) throw error;
    await refreshAllData();
    toast('Tarefa excluída.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível excluir a tarefa.', 'danger');
  }
}

async function handleChecklistToggle(checkId, checked) {
  try {
    const { error } = await supa().from('task_checklist_items').update({ is_done: checked }).eq('id', checkId);
    if (error) throw error;
    await loadTasks();
    renderDashboard();
    renderTasks();
    renderAgenda();
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar o checklist.', 'danger');
  }
}

async function handleAnnouncementSave(event) {
  event.preventDefault();
  try {
    const current = getCurrentWorkspace();
    if (!current) throw new Error('Selecione um workspace antes de publicar avisos.');
    const id = $('#announcementId').value.trim();
    const payload = {
      workspace_id: current.id,
      author_id: state.user.id,
      title: $('#announcementTitle').value.trim(),
      content: $('#announcementContent').value.trim(),
      pinned: $('#announcementPinned').value === 'true',
    };

    if (id) {
      const existing = state.announcements.find((item) => item.id === id);
      if (!existing) throw new Error('Aviso não encontrado.');
      payload.author_id = existing.author_id;
      const { error } = await supa().from('announcements').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supa().from('announcements').insert(payload);
      if (error) throw error;
    }

    resetAnnouncementForm();
    await refreshAllData();
    toast(id ? 'Aviso atualizado.' : 'Aviso publicado.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível salvar o aviso.', 'danger');
  }
}

async function handleAnnouncementDelete(id) {
  try {
    if (!window.confirm('Deseja excluir este aviso?')) return;
    const { error } = await supa().from('announcements').delete().eq('id', id);
    if (error) throw error;
    await refreshAllData();
    toast('Aviso excluído.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível excluir o aviso.', 'danger');
  }
}

async function handleMaterialSave(event) {
  event.preventDefault();
  try {
    const current = getCurrentWorkspace();
    if (!current) throw new Error('Selecione um workspace antes de salvar materiais.');
    const id = $('#materialId').value.trim();
    const payload = {
      workspace_id: current.id,
      author_id: state.user.id,
      title: $('#materialTitle').value.trim(),
      url: $('#materialUrl').value.trim(),
      material_type: $('#materialType').value,
      description: $('#materialDescription').value.trim(),
    };
    if (id) {
      const existing = state.materials.find((item) => item.id === id);
      if (!existing) throw new Error('Material não encontrado.');
      payload.author_id = existing.author_id;
      const { error } = await supa().from('materials').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supa().from('materials').insert(payload);
      if (error) throw error;
    }
    resetMaterialForm();
    await refreshAllData();
    toast(id ? 'Material atualizado.' : 'Material salvo.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível salvar o material.', 'danger');
  }
}

async function handleMaterialDelete(id) {
  try {
    if (!window.confirm('Deseja excluir este material?')) return;
    const { error } = await supa().from('materials').delete().eq('id', id);
    if (error) throw error;
    await refreshAllData();
    toast('Material excluído.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível excluir o material.', 'danger');
  }
}

async function handleProfileSave(event) {
  event.preventDefault();
  try {
    const full_name = $('#profileName').value.trim();
    const { error } = await supa().from('profiles').update({ full_name }).eq('id', state.user.id);
    if (error) throw error;
    await ensureProfile();
    renderAccount();
    renderTopbar();
    toast('Perfil atualizado.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar o perfil.', 'danger');
  }
}

async function handlePasswordUpdate(event) {
  event.preventDefault();
  try {
    const password = $('#newPassword').value;
    const confirm = $('#newPasswordConfirm').value;
    if (password !== confirm) throw new Error('As senhas não coincidem.');
    const { error } = await supa().auth.updateUser({ password });
    if (error) throw error;
    event.target.reset();
    toast('Senha atualizada com sucesso.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar a senha.', 'danger');
  }
}

async function handleRoleUpdate(event) {
  event.preventDefault();
  try {
    const memberRowId = $('#memberSelect').value;
    const nextRole = $('#memberRole').value;
    const member = state.members.find((item) => item.id === memberRowId);
    if (!member) throw new Error('Selecione um membro.');

    if (nextRole === 'owner') {
      if (!canTransferOwnership()) throw new Error('Somente o owner atual pode transferir a propriedade.');
      const { error } = await supa().rpc('transfer_workspace_owner', {
        p_workspace_id: state.currentWorkspaceId,
        p_new_owner_user_id: member.user_id,
      });
      if (error) throw error;
    } else {
      const { error } = await supa().from('workspace_members').update({ role: nextRole }).eq('id', memberRowId);
      if (error) throw error;
    }
    await refreshAllData();
    toast('Papel atualizado.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível atualizar o papel.', 'danger');
  }
}

async function handleMemberRemoval() {
  try {
    const memberRowId = $('#memberSelect').value;
    const member = state.members.find((item) => item.id === memberRowId);
    if (!member) throw new Error('Selecione um membro.');
    if (member.role === 'owner') throw new Error('Transfira a propriedade antes de remover o owner.');
    if (member.user_id === state.user.id) throw new Error('Use a opção de sair do workspace para remover sua própria participação.');
    if (!window.confirm(`Remover ${member.full_name} do workspace?`)) return;
    const { error } = await supa().from('workspace_members').delete().eq('id', memberRowId);
    if (error) throw error;
    await refreshAllData();
    toast('Membro removido.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível remover o membro.', 'danger');
  }
}

function applyFilters() {
  state.filters.status = $('#filterStatus').value;
  state.filters.priority = $('#filterPriority').value;
  state.filters.type = $('#filterType').value;
  state.filters.search = $('#filterSearch').value;
  renderTasks();
}

async function copyInviteCode() {
  try {
    const current = getCurrentWorkspace();
    if (!current?.invite_code) throw new Error('Código indisponível.');
    await navigator.clipboard.writeText(current.invite_code);
    toast('Código copiado.', 'success');
  } catch (error) {
    toast('Não foi possível copiar o código.', 'danger');
  }
}

function bindEvents() {
  $$('.auth-tab').forEach((btn) => btn.addEventListener('click', () => setAuthMode(btn.dataset.authMode)));
  $('#signInForm').addEventListener('submit', handleSignIn);
  $('#signUpForm').addEventListener('submit', handleSignUp);
  $('#recoverForm').addEventListener('submit', handleRecovery);
  $('#signOutBtn').addEventListener('click', handleSignOut);
  $('#refreshBtn').addEventListener('click', async () => {
    try {
      await refreshAllData();
      toast('Dados atualizados.', 'info');
    } catch (error) {
      toast(error.message || 'Não foi possível atualizar os dados.', 'danger');
    }
  });

  $$('.nav-link').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $$('[data-open-view]').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.openView)));

  $('#workspaceSwitcher').addEventListener('change', async (event) => {
    state.currentWorkspaceId = event.target.value || null;
    localStorage.setItem('classboard.currentWorkspaceId', state.currentWorkspaceId || '');
    await loadMembers();
    await loadTasks();
    await loadAnnouncements();
    await loadMaterials();
    renderAll();
  });

  $('#workspaceForm').addEventListener('submit', handleWorkspaceCreate);
  $('#joinWorkspaceForm').addEventListener('submit', handleWorkspaceJoin);
  $('#workspaceSettingsForm').addEventListener('submit', handleWorkspaceSettings);
  $('#copyInviteBtn').addEventListener('click', copyInviteCode);
  $('#regenerateInviteBtn').addEventListener('click', handleInviteRegeneration);
  $('#deleteWorkspaceBtn').addEventListener('click', handleDeleteWorkspace);
  $('#leaveWorkspaceBtn').addEventListener('click', handleLeaveWorkspace);

  $('#taskForm').addEventListener('submit', handleTaskSave);
  $('#taskFormReset').addEventListener('click', resetTaskForm);
  $('#announcementForm').addEventListener('submit', handleAnnouncementSave);
  $('#announcementFormReset').addEventListener('click', resetAnnouncementForm);
  $('#materialForm').addEventListener('submit', handleMaterialSave);
  $('#materialFormReset').addEventListener('click', resetMaterialForm);

  $('#profileForm').addEventListener('submit', handleProfileSave);
  $('#passwordForm').addEventListener('submit', handlePasswordUpdate);
  $('#memberRoleForm').addEventListener('submit', handleRoleUpdate);
  $('#removeMemberBtn').addEventListener('click', handleMemberRemoval);

  ['#filterStatus', '#filterPriority', '#filterType', '#filterSearch'].forEach((selector) => {
    $(selector).addEventListener('input', applyFilters);
    $(selector).addEventListener('change', applyFilters);
  });

  $('#taskList').addEventListener('click', async (event) => {
    const editId = event.target.dataset.editTask;
    const deleteId = event.target.dataset.deleteTask;
    if (editId) fillTaskForm(editId);
    if (deleteId) await handleTaskDelete(deleteId);
  });

  $('#taskList').addEventListener('change', async (event) => {
    if (event.target.matches('[data-check-id]')) {
      await handleChecklistToggle(event.target.dataset.checkId, event.target.checked);
    }
  });

  $('#announcementList').addEventListener('click', async (event) => {
    const editId = event.target.dataset.editAnnouncement;
    const deleteId = event.target.dataset.deleteAnnouncement;
    if (editId) fillAnnouncementForm(editId);
    if (deleteId) await handleAnnouncementDelete(deleteId);
  });

  $('#materialList').addEventListener('click', async (event) => {
    const editId = event.target.dataset.editMaterial;
    const deleteId = event.target.dataset.deleteMaterial;
    if (editId) fillMaterialForm(editId);
    if (deleteId) await handleMaterialDelete(deleteId);
  });

  $('#workspaceList').addEventListener('click', async (event) => {
    const id = event.target.dataset.selectWorkspace;
    if (!id) return;
    state.currentWorkspaceId = id;
    localStorage.setItem('classboard.currentWorkspaceId', id);
    await loadMembers();
    await loadTasks();
    await loadAnnouncements();
    await loadMaterials();
    renderAll();
  });

  $('#memberSelect').addEventListener('change', (event) => {
    const member = state.members.find((item) => item.id === event.target.value);
    if (member) $('#memberRole').value = member.role;
  });
}

async function bootstrapAuthenticated(session) {
  state.session = session;
  state.user = session?.user || null;
  if (!state.user) {
    authScreen();
    return;
  }
  appScreen();
  try {
    await refreshAllData();
    switchView(state.currentView);
  } catch (error) {
    toast('Não foi possível carregar sua área agora.', 'danger');
  }
}

async function initialize() {
  bindEvents();
  setAuthMode('signin');

  if (!state.ready) {
    authScreen();
    toast('O serviço está temporariamente indisponível no momento.', 'warning');
    return;
  }

  const { data, error } = await supa().auth.getSession();
  if (error) toast(error.message || 'Não foi possível recuperar a sessão.', 'danger');

  supa().auth.onAuthStateChange(async (_event, session) => {
    if (session?.user?.id) {
      await bootstrapAuthenticated(session);
    } else {
      state.session = null;
      state.user = null;
      authScreen();
    }
  });

  if (data?.session?.user?.id) {
    await bootstrapAuthenticated(data.session);
  } else {
    authScreen();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initialize().catch((error) => {
    console.error(error);
    toast('O aplicativo encontrou um erro inesperado na inicialização.', 'danger');
  });
});

const supaState = {
  client: window.classboardSupabase?.client || null,
  ready: Boolean(window.classboardSupabase?.ready),
  configError: window.classboardSupabase?.configError || null,
  authMode: 'signin',
  session: null,
  user: null,
  profile: null,
  workspaces: [],
  currentWorkspaceId: null,
  tasks: [],
  members: [],
  currentView: 'dashboard',
  filters: {
    status: '',
    priority: '',
    type: '',
    search: '',
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function randomInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function daysUntil(dateStr) {
  const today = new Date(`${todayISO()}T00:00:00`);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function showAlert(message, type = 'info') {
  const isAuthVisible = $('#authScreen').classList.contains('active');
  const alerts = isAuthVisible ? $('#authAlerts') : $('#alerts');
  if (!alerts) return;
  const div = document.createElement('div');
  div.className = `alert ${type}`;
  div.textContent = message;
  alerts.appendChild(div);
  setTimeout(() => div.remove(), 4200);
}

function requireSupabase() {
  if (!supaState.ready || !supaState.client) {
    throw new Error(supaState.configError || 'Supabase não configurado.');
  }
  return supaState.client;
}

function setAuthMode(mode) {
  supaState.authMode = mode === 'signup' ? 'signup' : 'signin';
  $$('.rail-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.authMode === supaState.authMode));
  $$('.inline-switch').forEach((btn) => btn.dataset.authMode = mode === 'signin' ? 'signup' : 'signin');

  $('#signInForm').classList.toggle('active', supaState.authMode === 'signin');
  $('#signUpForm').classList.toggle('active', supaState.authMode === 'signup');

  if (supaState.authMode === 'signin') {
    $('#authHeroTitle').textContent = 'Sign In Now.';
    $('#authHeroSubtitle').textContent = 'Acesse sua turma, seus prazos e o painel colaborativo em um só lugar.';
    $('#authKicker').innerHTML = 'Ainda não tem conta? <button class="inline-switch" data-auth-mode="signup">Criar conta</button>';
    $('#authFormTitle').textContent = 'Entrar';
    $('#authFormSubtitle').textContent = 'Use seu email e senha para acessar sua área.';
  } else {
    $('#authHeroTitle').textContent = 'Sign Up Now.';
    $('#authHeroSubtitle').textContent = 'Crie sua conta e comece a organizar grupos, turmas, tarefas e prazos.';
    $('#authKicker').innerHTML = 'Já tem uma conta? <button class="inline-switch" data-auth-mode="signin">Entrar</button>';
    $('#authFormTitle').textContent = 'Criar conta';
    $('#authFormSubtitle').textContent = 'Comece com email, senha e nome completo.';
  }

  $$('.inline-switch').forEach((btn) => btn.addEventListener('click', () => setAuthMode(btn.dataset.authMode)));
}

function showAuthScreen() {
  $('#authScreen').classList.add('active');
  $('#appScreen').classList.remove('active');
}

function showAppScreen() {
  $('#authScreen').classList.remove('active');
  $('#appScreen').classList.add('active');
}

function setConnectionStatus() {
  $('#supabaseStatus').textContent = supaState.ready ? 'Conectado' : 'Configuração pendente';
  $('#userStatus').textContent = supaState.user ? (supaState.user.email || 'Autenticado') : 'Desconectado';
  const workspace = getCurrentWorkspace();
  $('#workspaceStatus').textContent = workspace ? workspace.name : 'Nenhum';
}

function getCurrentWorkspace() {
  return supaState.workspaces.find((item) => item.id === supaState.currentWorkspaceId) || null;
}

function getCurrentUserRole() {
  const me = supaState.members.find((item) => item.user_id === supaState.user?.id);
  return me?.role || null;
}

function canManageMembers() {
  return ['owner', 'admin'].includes(getCurrentUserRole());
}

function canManageWorkspace() {
  return ['owner', 'admin'].includes(getCurrentUserRole());
}

function canTransferOwnership() {
  return getCurrentUserRole() === 'owner';
}

function canEditTask(task) {
  if (!task) return false;
  const role = getCurrentUserRole();
  return task.author_id === supaState.user?.id || role === 'owner' || role === 'admin';
}

function getFilteredTasks() {
  const search = supaState.filters.search.trim().toLowerCase();
  return supaState.tasks.filter((task) => {
    if (supaState.filters.status && task.status !== supaState.filters.status) return false;
    if (supaState.filters.priority && task.priority !== supaState.filters.priority) return false;
    if (supaState.filters.type && task.task_type !== supaState.filters.type) return false;
    if (!search) return true;
    const haystack = `${task.title} ${task.subject || ''} ${task.description || ''}`.toLowerCase();
    return haystack.includes(search);
  });
}

async function ensureProfile() {
  const client = requireSupabase();
  const fallbackName = supaState.user?.user_metadata?.full_name || supaState.user?.email?.split('@')[0] || 'Usuário';
  const profilePayload = {
    id: supaState.user.id,
    full_name: fallbackName,
    email: supaState.user.email,
  };

  const { data, error } = await client
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  supaState.profile = data;
}

async function loadWorkspaces() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('workspace_members')
    .select(`
      role,
      workspace_id,
      workspaces (
        id,
        name,
        school_name,
        type,
        invite_code,
        owner_id,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', supaState.user.id);

  if (error) throw error;

  supaState.workspaces = (data || [])
    .map((row) => {
      const ws = row.workspaces;
      if (!ws) return null;
      return {
        ...ws,
        my_role: row.role,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  if (!supaState.currentWorkspaceId || !supaState.workspaces.some((ws) => ws.id === supaState.currentWorkspaceId)) {
    supaState.currentWorkspaceId = supaState.workspaces[0]?.id || null;
  }
}

async function loadTasks() {
  if (!supaState.currentWorkspaceId) {
    supaState.tasks = [];
    return;
  }
  const client = requireSupabase();
  const { data, error } = await client
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
      task_checklist_items (
        id,
        text,
        is_done,
        sort_order
      )
    `)
    .eq('workspace_id', supaState.currentWorkspaceId)
    .order('due_date', { ascending: true });

  if (error) throw error;

  supaState.tasks = (data || []).map((task) => ({
    ...task,
    task_checklist_items: (task.task_checklist_items || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }));
}

async function loadMembers() {
  if (!supaState.currentWorkspaceId) {
    supaState.members = [];
    return;
  }
  const client = requireSupabase();
  const { data, error } = await client
    .from('workspace_members')
    .select(`
      id,
      workspace_id,
      user_id,
      role,
      created_at,
      profiles (
        full_name,
        email
      )
    `)
    .eq('workspace_id', supaState.currentWorkspaceId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  supaState.members = (data || []).map((item) => ({
    ...item,
    full_name: item.profiles?.full_name || 'Sem nome',
    email: item.profiles?.email || 'Sem email',
  }));
}

async function refreshAllData() {
  if (!supaState.user) return;
  await ensureProfile();
  await loadWorkspaces();
  await loadTasks();
  await loadMembers();
  renderAll();
}

function renderWorkspaceHeader() {
  const ws = getCurrentWorkspace();
  $('#workspaceTitle').textContent = ws ? ws.name : 'Nenhum workspace selecionado';
  $('#workspaceSubtitle').textContent = ws
    ? `${ws.school_name || 'Sem escola'} · ${ws.type} · papel atual: ${ws.my_role}`
    : 'Crie ou entre em um workspace para começar';
}

function renderWorkspaceSwitcher() {
  const select = $('#workspaceSwitcher');
  if (!supaState.workspaces.length) {
    select.innerHTML = '<option value="">Nenhum workspace</option>';
    select.value = '';
    return;
  }

  select.innerHTML = supaState.workspaces.map((ws) => `
    <option value="${escapeHtml(ws.id)}">${escapeHtml(ws.name)} · ${escapeHtml(ws.my_role)}</option>
  `).join('');
  select.value = supaState.currentWorkspaceId;
}

function renderDashboard() {
  const tasks = supaState.tasks.slice();
  const today = todayISO();
  const weekLimit = addDays(today, 7);
  const todayTasks = tasks.filter((task) => task.due_date === today && task.status !== 'concluido');
  const overdue = tasks.filter((task) => task.status !== 'concluido' && task.due_date < today);
  const exams = tasks.filter((task) => task.task_type === 'prova' && task.due_date >= today).slice(0, 4);
  const pending = tasks.filter((task) => task.status !== 'concluido').slice(0, 4);
  const weekly = tasks.filter((task) => task.due_date >= today && task.due_date <= weekLimit);

  $('#metricToday').textContent = todayTasks.length;
  $('#metricOverdue').textContent = overdue.length;
  $('#metricMembers').textContent = supaState.members.length;
  $('#summaryDone').textContent = weekly.filter((task) => task.status === 'concluido').length;
  $('#summaryOpen').textContent = weekly.filter((task) => task.status !== 'concluido').length;
  $('#summaryExams').textContent = weekly.filter((task) => task.task_type === 'prova').length;
  $('#examsBadge').textContent = `${exams.length} itens`;
  $('#pendingBadge').textContent = `${pending.length} itens`;

  if (!getCurrentWorkspace()) {
    $('#todaySummary').textContent = 'Crie ou entre em um workspace';
    $('#todayDetails').textContent = 'Sem workspace não há tarefas compartilhadas.';
  } else if (todayTasks.length) {
    $('#todaySummary').textContent = `${todayTasks.length} tarefa(s) para hoje`;
    $('#todayDetails').textContent = todayTasks.map((task) => task.title).join(' · ');
  } else if (pending.length) {
    $('#todaySummary').textContent = 'Sem urgências para hoje';
    $('#todayDetails').textContent = `Próxima entrega: ${pending[0].title} em ${formatDate(pending[0].due_date)}.`;
  } else {
    $('#todaySummary').textContent = 'Tudo em dia';
    $('#todayDetails').textContent = 'Cadastre novas tarefas ou convide membros para o workspace.';
  }

  renderSimpleTaskList('#dashboardExams', exams, 'Nenhuma prova próxima.');
  renderSimpleTaskList('#dashboardPending', pending, 'Nenhuma pendência no momento.', true);

  const snapshot = $('#workspaceSnapshot');
  const ws = getCurrentWorkspace();
  if (!ws) {
    snapshot.innerHTML = '<div class="empty-state">Nenhum workspace disponível.</div>';
    return;
  }

  snapshot.innerHTML = `
    <div class="list-item">
      <div class="list-item-title">${escapeHtml(ws.name)}</div>
      <div class="subtle">${escapeHtml(ws.school_name || 'Sem escola')} · ${escapeHtml(ws.type)}</div>
    </div>
    <div class="list-item">
      <div class="list-item-title">Código de convite</div>
      <div class="subtle">${canManageWorkspace() ? escapeHtml(ws.invite_code || 'Sem código') : 'Visível apenas para owner/admin'}</div>
    </div>
    <div class="list-item">
      <div class="list-item-title">Seu papel</div>
      <div class="subtle">${escapeHtml(ws.my_role || '-')}</div>
    </div>
  `;
}

function renderSimpleTaskList(containerSelector, items, emptyText, showPriority = false) {
  const container = $(containerSelector);
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }

  container.innerHTML = items.map((task) => {
    const distance = daysUntil(task.due_date);
    const dueLabel = distance < 0 ? 'Atrasada' : distance === 0 ? 'Hoje' : `${distance} dia(s)`;
    return `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(task.title)}</div>
        <div class="subtle">${escapeHtml(task.subject || 'Sem matéria')} · ${formatDate(task.due_date)}</div>
        ${showPriority ? `<div class="meta-line"><span class="pill ${task.priority === 'alta' ? 'high' : task.priority === 'media' ? 'medium' : 'low'}">${escapeHtml(task.priority)}</span><span class="pill ${distance < 0 ? 'overdue' : 'info'}">${dueLabel}</span></div>` : ''}
      </div>
    `;
  }).join('');
}

function renderTasks() {
  const list = $('#taskList');
  const tasks = getFilteredTasks();
  if (!getCurrentWorkspace()) {
    list.innerHTML = '<div class="empty-state">Crie ou entre em um workspace para cadastrar tarefas.</div>';
    return;
  }
  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma tarefa encontrada com os filtros atuais.</div>';
    return;
  }

  list.innerHTML = tasks.map((task) => {
    const due = daysUntil(task.due_date);
    const dueLabel = due < 0 ? `${Math.abs(due)} dia(s) atrasada` : due === 0 ? 'Hoje' : `Em ${due} dia(s)`;
    const checklistHtml = (task.task_checklist_items || []).length
      ? `<ul class="task-checklist">${task.task_checklist_items.map((item) => `
          <li>
            <input type="checkbox" data-check-id="${escapeHtml(item.id)}" ${item.is_done ? 'checked' : ''}>
            <span>${escapeHtml(item.text)}</span>
          </li>
        `).join('')}</ul>`
      : '<div class="subtle top-gap">Sem checklist.</div>';

    return `
      <article class="task-card" data-task-id="${escapeHtml(task.id)}">
        <div class="task-card-head">
          <div>
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="subtle">${escapeHtml(task.subject || 'Sem matéria')} · ${formatDate(task.due_date)}</div>
          </div>
          <div class="meta-line">
            <span class="pill ${task.priority === 'alta' ? 'high' : task.priority === 'media' ? 'medium' : 'low'}">${escapeHtml(task.priority)}</span>
            <span class="pill ${due < 0 ? 'overdue' : 'info'}">${dueLabel}</span>
          </div>
        </div>

        <p>${escapeHtml(task.description || 'Sem descrição.')}</p>

        <div class="meta-line">
          <span class="pill info">${escapeHtml(task.task_type)}</span>
          <span class="pill info">${escapeHtml(task.status)}</span>
        </div>

        ${checklistHtml}

        <div class="button-row top-gap">
          <button class="ghost-btn" data-edit-task="${escapeHtml(task.id)}" ${canEditTask(task) ? '' : 'disabled'}>Editar</button>
          <button class="ghost-btn" data-delete-task="${escapeHtml(task.id)}" ${canEditTask(task) ? '' : 'disabled'}>Excluir</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderAgenda() {
  const list = $('#agendaList');
  const limit = addDays(todayISO(), 30);
  const items = supaState.tasks.filter((task) => task.due_date <= limit);
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">Nenhum evento nos próximos 30 dias.</div>';
    return;
  }

  list.innerHTML = items.map((task) => `
    <article class="agenda-card">
      <div class="agenda-card-head">
        <div>
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="subtle">${escapeHtml(task.subject || 'Sem matéria')}</div>
        </div>
        <div class="pill info">${formatDate(task.due_date)}</div>
      </div>
      <p>${escapeHtml(task.description || 'Sem descrição.')}</p>
    </article>
  `).join('');
}

function renderMembers() {
  const list = $('#memberList');
  const select = $('#memberSelect');
  const roleSelect = $('#memberRole');
  const canManage = canManageMembers();

  if (!getCurrentWorkspace()) {
    list.innerHTML = '<div class="empty-state">Nenhum workspace selecionado.</div>';
    select.innerHTML = '<option value="">Nenhum</option>';
    roleSelect.disabled = true;
    $('#removeMemberBtn').disabled = true;
    return;
  }

  if (!supaState.members.length) {
    list.innerHTML = '<div class="empty-state">Nenhum membro encontrado.</div>';
  } else {
    list.innerHTML = supaState.members.map((member) => `
      <article class="member-card">
        <div class="member-card-head">
          <div>
            <div class="task-title">${escapeHtml(member.full_name)}</div>
            <div class="subtle">${escapeHtml(member.email)}</div>
          </div>
          <span class="pill info">${escapeHtml(member.role)}</span>
        </div>
      </article>
    `).join('');
  }

  select.innerHTML = supaState.members.map((member) => `
    <option value="${escapeHtml(member.id)}">${escapeHtml(member.full_name)} · ${escapeHtml(member.role)}</option>
  `).join('');
  roleSelect.disabled = !canManage;
  select.disabled = !canManage;
  $('#removeMemberBtn').disabled = !canManage;
}

function renderWorkspaceView() {
  const list = $('#workspaceList');
  if (!supaState.workspaces.length) {
    list.innerHTML = '<div class="empty-state">Nenhum workspace cadastrado.</div>';
    return;
  }

  list.innerHTML = supaState.workspaces.map((ws) => `
    <article class="workspace-card ${ws.id === supaState.currentWorkspaceId ? 'active-card' : ''}">
      <div class="workspace-card-head">
        <div>
          <div class="task-title">${escapeHtml(ws.name)}</div>
          <div class="subtle">${escapeHtml(ws.school_name || 'Sem escola')} · ${escapeHtml(ws.type)} · seu papel: ${escapeHtml(ws.my_role)}</div>
        </div>
        <div class="button-row">
          <button class="ghost-btn" data-select-workspace="${escapeHtml(ws.id)}">Abrir</button>
        </div>
      </div>
      <div class="meta-line top-gap">
        <span class="pill info">Criado em ${formatDate((ws.created_at || '').slice(0, 10))}</span>
        <span class="pill info">${canManageWorkspace() && ws.id === supaState.currentWorkspaceId ? escapeHtml(ws.invite_code || 'Sem código') : 'Código restrito'}</span>
      </div>
    </article>
  `).join('');

  $('#regenerateInviteBtn').disabled = !canManageWorkspace() || !getCurrentWorkspace();
}

function renderSettings() {
  $('#profileName').value = supaState.profile?.full_name || '';
  $('#profileEmail').value = supaState.profile?.email || supaState.user?.email || '';
  setConnectionStatus();
}

function renderAll() {
  renderWorkspaceHeader();
  renderWorkspaceSwitcher();
  renderDashboard();
  renderTasks();
  renderAgenda();
  renderMembers();
  renderWorkspaceView();
  renderSettings();
}

function switchView(viewName) {
  supaState.currentView = viewName;
  $$('.nav-link').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === viewName));
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${viewName}`));
}

function parseChecklist(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ text: line, is_done: false, sort_order: index + 1 }));
}

function fillTaskForm(taskId) {
  const task = supaState.tasks.find((item) => item.id === taskId);
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

function resetTaskForm() {
  $('#taskForm').reset();
  $('#taskId').value = '';
  $('#taskPriority').value = 'media';
  $('#taskStatus').value = 'pendente';
  $('#taskType').value = 'prova';
}

async function handleSignIn(event) {
  event.preventDefault();
  try {
    const client = requireSupabase();
    const email = $('#signInEmail').value.trim();
    const password = $('#signInPassword').value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    showAlert('Login realizado com sucesso.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao entrar.', 'danger');
  }
}

async function handleSignUp(event) {
  event.preventDefault();
  try {
    const client = requireSupabase();
    const fullName = $('#signUpName').value.trim();
    const email = $('#signUpEmail').value.trim();
    const password = $('#signUpPassword').value;

    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) throw error;
    showAlert('Conta criada. Se a confirmação de email estiver desligada, você já pode entrar.', 'success');
    setAuthMode('signin');
    $('#signInEmail').value = email;
    $('#signInPassword').value = password;
  } catch (error) {
    showAlert(error.message || 'Falha ao criar conta.', 'danger');
  }
}

async function handleSignOut() {
  try {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    supaState.session = null;
    supaState.user = null;
    supaState.profile = null;
    supaState.workspaces = [];
    supaState.currentWorkspaceId = null;
    supaState.tasks = [];
    supaState.members = [];
    showAuthScreen();
    showAlert('Sessão encerrada.', 'info');
  } catch (error) {
    showAlert(error.message || 'Falha ao sair.', 'danger');
  }
}

async function handleWorkspaceCreate(event) {
  event.preventDefault();
  try {
    const client = requireSupabase();
    if (!supaState.user) throw new Error('Faça login primeiro.');
    const payload = {
      owner_id: supaState.user.id,
      name: $('#workspaceName').value.trim(),
      school_name: $('#workspaceSchool').value.trim(),
      type: $('#workspaceType').value,
      invite_code: randomInviteCode(),
    };
    const { error } = await client.from('workspaces').insert(payload);
    if (error) throw error;
    event.target.reset();
    await refreshAllData();
    showAlert('Workspace criado com sucesso.', 'success');
    switchView('workspace');
  } catch (error) {
    showAlert(error.message || 'Falha ao criar workspace.', 'danger');
  }
}

async function handleWorkspaceJoin(event) {
  event.preventDefault();
  try {
    const client = requireSupabase();
    const inviteCode = $('#inviteCodeInput').value.trim().toUpperCase();
    if (!inviteCode) throw new Error('Informe o código de convite.');
    const { error } = await client.rpc('join_workspace_by_code', { invite: inviteCode });
    if (error) throw error;
    event.target.reset();
    await refreshAllData();
    showAlert('Você entrou no workspace.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao entrar no workspace.', 'danger');
  }
}

async function handleTaskSave(event) {
  event.preventDefault();
  try {
    const client = requireSupabase();
    if (!supaState.currentWorkspaceId) throw new Error('Selecione um workspace antes de criar tarefas.');

    const taskId = $('#taskId').value.trim();
    const taskPayload = {
      workspace_id: supaState.currentWorkspaceId,
      author_id: supaState.user.id,
      title: $('#taskTitle').value.trim(),
      subject: $('#taskSubject').value.trim(),
      task_type: $('#taskType').value,
      priority: $('#taskPriority').value,
      status: $('#taskStatus').value,
      due_date: $('#taskDueDate').value,
      description: $('#taskDescription').value.trim(),
    };

    let savedTaskId = taskId;

    if (taskId) {
      const { error } = await client.from('tasks').update(taskPayload).eq('id', taskId);
      if (error) throw error;
      const { error: deleteChecklistError } = await client.from('task_checklist_items').delete().eq('task_id', taskId);
      if (deleteChecklistError) throw deleteChecklistError;
    } else {
      const { data, error } = await client.from('tasks').insert(taskPayload).select('id').single();
      if (error) throw error;
      savedTaskId = data.id;
    }

    const checklistItems = parseChecklist($('#taskChecklist').value);
    if (checklistItems.length) {
      const rows = checklistItems.map((item) => ({ ...item, task_id: savedTaskId }));
      const { error } = await client.from('task_checklist_items').insert(rows);
      if (error) throw error;
    }

    resetTaskForm();
    await refreshAllData();
    showAlert(taskId ? 'Tarefa atualizada.' : 'Tarefa criada com sucesso.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao salvar tarefa.', 'danger');
  }
}

async function handleTaskDelete(taskId) {
  if (!window.confirm('Deseja realmente excluir esta tarefa?')) return;
  try {
    const client = requireSupabase();
    const { error } = await client.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
    await refreshAllData();
    showAlert('Tarefa excluída.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao excluir tarefa.', 'danger');
  }
}

async function handleChecklistToggle(checkId, checked) {
  try {
    const client = requireSupabase();
    const { error } = await client.from('task_checklist_items').update({ is_done: checked }).eq('id', checkId);
    if (error) throw error;
    await loadTasks();
    renderDashboard();
    renderTasks();
    renderAgenda();
  } catch (error) {
    showAlert(error.message || 'Falha ao atualizar checklist.', 'danger');
  }
}

async function handleProfileSave(event) {
  event.preventDefault();
  try {
    const client = requireSupabase();
    const full_name = $('#profileName').value.trim();
    const { error } = await client.from('profiles').update({ full_name }).eq('id', supaState.user.id);
    if (error) throw error;
    await ensureProfile();
    renderSettings();
    showAlert('Perfil atualizado.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao salvar perfil.', 'danger');
  }
}

async function handleRoleUpdate(event) {
  event.preventDefault();
  try {
    const memberRowId = $('#memberSelect').value;
    const nextRole = $('#memberRole').value;
    const member = supaState.members.find((item) => item.id === memberRowId);
    if (!member) throw new Error('Selecione um membro.');

    const client = requireSupabase();

    if (nextRole === 'owner') {
      if (!canTransferOwnership()) throw new Error('Apenas o owner atual pode transferir ownership.');
      const { error } = await client.rpc('transfer_workspace_owner', {
        p_workspace_id: supaState.currentWorkspaceId,
        p_new_owner_user_id: member.user_id,
      });
      if (error) throw error;
    } else {
      const { error } = await client
        .from('workspace_members')
        .update({ role: nextRole })
        .eq('id', memberRowId);
      if (error) throw error;
    }

    await refreshAllData();
    showAlert('Papel atualizado.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao atualizar papel.', 'danger');
  }
}

async function handleMemberRemoval() {
  try {
    const memberRowId = $('#memberSelect').value;
    const member = supaState.members.find((item) => item.id === memberRowId);
    if (!member) throw new Error('Selecione um membro.');
    if (member.user_id === supaState.user.id) throw new Error('Remoção de si mesmo não está liberada nesta versão.');
    if (member.role === 'owner') throw new Error('Use a transferência de ownership antes de remover o owner.');
    if (!window.confirm(`Remover ${member.full_name} deste workspace?`)) return;

    const client = requireSupabase();
    const { error } = await client.from('workspace_members').delete().eq('id', memberRowId);
    if (error) throw error;
    await refreshAllData();
    showAlert('Membro removido.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao remover membro.', 'danger');
  }
}

async function handleInviteRegeneration() {
  try {
    if (!supaState.currentWorkspaceId) throw new Error('Nenhum workspace selecionado.');
    const client = requireSupabase();
    const { error } = await client.rpc('regenerate_workspace_code', { p_workspace_id: supaState.currentWorkspaceId });
    if (error) throw error;
    await refreshAllData();
    showAlert('Novo código de convite gerado.', 'success');
  } catch (error) {
    showAlert(error.message || 'Falha ao gerar novo código.', 'danger');
  }
}

function applyTaskFilters() {
  supaState.filters.status = $('#filterStatus').value;
  supaState.filters.priority = $('#filterPriority').value;
  supaState.filters.type = $('#filterType').value;
  supaState.filters.search = $('#filterSearch').value;
  renderTasks();
}

function bindEvents() {
  $$('.rail-item').forEach((btn) => btn.addEventListener('click', () => setAuthMode(btn.dataset.authMode)));
  $('#signInForm').addEventListener('submit', handleSignIn);
  $('#signUpForm').addEventListener('submit', handleSignUp);
  $('#signOutBtn').addEventListener('click', handleSignOut);
  $('#refreshBtn').addEventListener('click', async () => {
    try {
      await refreshAllData();
      showAlert('Dados atualizados.', 'info');
    } catch (error) {
      showAlert(error.message || 'Falha ao atualizar dados.', 'danger');
    }
  });

  $$('.nav-link').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('#workspaceSwitcher').addEventListener('change', async (event) => {
    supaState.currentWorkspaceId = event.target.value || null;
    await loadTasks();
    await loadMembers();
    const current = getCurrentWorkspace();
    if (current) current.my_role = getCurrentUserRole() || current.my_role;
    renderAll();
  });

  $('#workspaceForm').addEventListener('submit', handleWorkspaceCreate);
  $('#joinWorkspaceForm').addEventListener('submit', handleWorkspaceJoin);
  $('#taskForm').addEventListener('submit', handleTaskSave);
  $('#taskFormReset').addEventListener('click', resetTaskForm);
  $('#profileForm').addEventListener('submit', handleProfileSave);
  $('#memberRoleForm').addEventListener('submit', handleRoleUpdate);
  $('#removeMemberBtn').addEventListener('click', handleMemberRemoval);
  $('#regenerateInviteBtn').addEventListener('click', handleInviteRegeneration);

  ['#filterStatus', '#filterPriority', '#filterType', '#filterSearch'].forEach((selector) => {
    $(selector).addEventListener('input', applyTaskFilters);
    $(selector).addEventListener('change', applyTaskFilters);
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

  $('#workspaceList').addEventListener('click', async (event) => {
    const workspaceId = event.target.dataset.selectWorkspace;
    if (!workspaceId) return;
    supaState.currentWorkspaceId = workspaceId;
    await loadTasks();
    await loadMembers();
    renderAll();
  });

  $('#memberSelect').addEventListener('change', (event) => {
    const member = supaState.members.find((item) => item.id === event.target.value);
    $('#memberRole').value = member?.role || 'member';
  });
}

async function bootstrapAuthenticatedApp(session) {
  supaState.session = session;
  supaState.user = session?.user || null;
  if (!supaState.user) {
    showAuthScreen();
    return;
  }

  showAppScreen();
  try {
    await refreshAllData();
    switchView(supaState.currentView);
  } catch (error) {
    showAlert(error.message || 'Falha ao carregar o app.', 'danger');
    switchView('settings');
  }
}

async function initialize() {
  bindEvents();
  setAuthMode('signin');

  if (!supaState.ready) {
    showAuthScreen();
    showAlert(supaState.configError || 'Configure o Supabase antes de usar o app.', 'warning');
    setConnectionStatus();
    return;
  }

  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    showAlert(error.message || 'Falha ao recuperar sessão.', 'danger');
  }

  client.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user?.id) {
      await bootstrapAuthenticatedApp(session);
    } else {
      supaState.session = null;
      supaState.user = null;
      showAuthScreen();
      setConnectionStatus();
    }
  });

  if (data?.session?.user?.id) {
    await bootstrapAuthenticatedApp(data.session);
  } else {
    showAuthScreen();
    setConnectionStatus();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initialize().catch((error) => {
    console.error(error);
    showAlert(error.message || 'Erro inesperado na inicialização.', 'danger');
  });
});

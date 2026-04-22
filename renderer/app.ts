type AppConfig = {
  gitlab_url: string;
  token: string;
  project_ref: string;
  project_ref_history: string[];
  import_file: string;
  gemini_api_key: string;
  enable_daily_sync: boolean;
  daily_sync_time: string;
  enable_weekly_report: boolean;
  weekly_report_time: string;
};

const MAX_PROJECT_REF_HISTORY = 10;
const LOCAL_CONFIG_CACHE_KEY = 'gitlab-tracker:config-cache';

type DashboardResponse = {
  summary: Record<string, number | string | null>;
  weekly_new: any[];
  focus_progress: any[];
  risks: any[];
  last_sync: string | null;
  last_report: string | null;
  issue_count: number;
  latest_report_path: string | null;
};

type IssueItem = {
  iid: number;
  title: string;
  state: string;
  module: string | null;
  labels: string[];
  assignees: string[];
  assignee_details: Array<{
    name: string;
    username: string | null;
    avatar_url: string | null;
  }>;
  milestone: string | null;
  milestone_start_date: string | null;
  milestone_due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  due_date: string | null;
  web_url: string | null;
  issue_type: string | null;
  merge_requests_count: number;
  blocking_issues_count: number;
  task_total: number;
  task_completed: number;
  user_notes_count: number;
  has_new_discussions: boolean;
  note: string | null;
  reason: string | null;
};

type DiscussionNote = {
  id: number;
  body: string;
  author_name: string;
  author_username: string;
  author_avatar_url: string;
  created_at: string | null;
  updated_at: string | null;
};

type Discussion = {
  id: string;
  notes: DiscussionNote[];
};

type MergeRequestInfo = {
  id: number;
  iid: number;
  title: string;
  state: string;
  draft: boolean;
  web_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  merged_at: string | null;
  merge_status: string | null;
  source_branch: string | null;
  target_branch: string | null;
  author_name: string;
  author_username: string;
  author_avatar_url: string;
  head_pipeline_status: string | null;
};

type LinkedIssueRef = {
  iid: number;
  title: string;
  state: string;
  web_url: string | null;
  labels: string[];
  assignees: string[];
  milestone: string | null;
  due_date: string | null;
};

type LinkedItemInfo = {
  id: number;
  link_type: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  issue: LinkedIssueRef;
};

type BurndownPoint = {
  date: string;
  open: number;
  total: number;
  closed: number;
  ideal: number;
};

type BurndownMilestone = {
  milestone: string;
  start_date: string | null;
  due_date: string | null;
  total: number;
  open: number;
  closed: number;
  series: BurndownPoint[];
};

type GanttQuickView =
  | 'custom'
  | 'overdue'
  | 'due_soon'
  | 'unassigned'
  | 'no_due_date'
  | 'active_milestones';
type GanttGroupBy = 'none' | 'milestone' | 'assignee' | 'module';
type GanttRiskFlag = 'overdue' | 'due_soon' | 'no_due_date' | 'unassigned' | 'stale';
type TimelineViewMode = 'gantt' | 'calendar';
type TimelineRangeMode = 'month' | 'week';

type WorkloadEntry = {
  assignee: string;
  avatar_url: string;
  total: number;
  opened: number;
  closed: number;
  overdue: number;
  due_soon: number;
};

type AlertEntry = IssueItem & {
  severity: 'overdue' | 'critical' | 'warning';
  days_until_due: number;
};

type LabelDistEntry = {
  label: string;
  total: number;
  open: number;
};

type LifecycleData = {
  mttr_days: number | null;
  median_days: number | null;
  p90_days: number | null;
  total_closed: number;
  histogram: { bucket: string; count: number }[];
  throughput: { month: string; count: number }[];
};

type AnalyticsResponse = {
  burndown: BurndownMilestone[];
  workload: WorkloadEntry[];
  alerts: AlertEntry[];
  label_distribution: LabelDistEntry[];
  lifecycle: LifecycleData;
};

/* ── State ── */
const state = {
  latestReportPath: null as string | null,
  allIssues: [] as IssueItem[],
  mergeRequestsByIid: new Map<number, MergeRequestInfo[]>(),
  issueLinksByIid: new Map<number, LinkedItemInfo[]>(),
  pendingMergeRequestLoads: new Set<number>(),
  pendingIssueLinkLoads: new Set<number>(),
  tableSort: { key: 'iid' as string, asc: false },
  analytics: null as AnalyticsResponse | null,
  ganttCollapsedGroups: new Set<string>(),
  timelineViewMode: 'gantt' as TimelineViewMode,
  timelineRangeMode: 'month' as TimelineRangeMode,
  ganttMonth: '',
  ganttWeek: '',
};

/* ── Helpers ── */
function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function getById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setStatus(text: string, type: 'idle' | 'success' | 'warn' | 'error' = 'idle') {
  const pill = byId<HTMLDivElement>('status-pill');
  pill.textContent = text;
  pill.className = `status-pill ${type}`;
}

async function applyAppVersionLabel(): Promise<void> {
  const versionLabel = getById<HTMLElement>('app-version-label');
  if (!versionLabel) return;

  try {
    const version = await window.trackerBridge.getAppVersion();
    versionLabel.textContent = `v${version}`;
    document.title = `Gitlab Tracker v${version}`;
  } catch (error) {
    console.warn('Failed to load app version', error);
  }
}

const ACTION_BTNS = [
  'btn-sync-now',
  'btn-refresh-dashboard',
  'btn-generate-report',
  'btn-save-config',
];
function setActionButtonsEnabled(enabled: boolean): void {
  for (const id of ACTION_BTNS) {
    const btn = byId<HTMLButtonElement>(id);
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '' : '0.5';
    btn.style.pointerEvents = enabled ? '' : 'none';
  }
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('zh-TW', { hour12: false });
}

function fmtShortDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function coerceConfig(config?: Partial<AppConfig> | null): AppConfig {
  const merged = {
    gitlab_url: '',
    token: '',
    project_ref: '',
    project_ref_history: [] as string[],
    import_file: '',
    gemini_api_key: '',
    enable_daily_sync: true,
    daily_sync_time: '09:00',
    enable_weekly_report: true,
    weekly_report_time: '17:30',
    ...config,
  };

  return {
    ...merged,
    project_ref_history: normalizeProjectRefHistory(merged.project_ref, merged.project_ref_history),
  };
}

function readCachedConfig(): AppConfig | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_CONFIG_CACHE_KEY);
    if (!raw) return null;
    return coerceConfig(JSON.parse(raw) as Partial<AppConfig>);
  } catch (error) {
    console.warn('Unable to read cached config', error);
    return null;
  }
}

function cacheConfig(config: AppConfig): void {
  try {
    window.localStorage.setItem(LOCAL_CONFIG_CACHE_KEY, JSON.stringify(coerceConfig(config)));
  } catch (error) {
    console.warn('Unable to cache config', error);
  }
}

function normalizeProjectRefHistory(currentValue: string, history: string[]): string[] {
  const values = [currentValue, ...history];
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized && !unique.includes(normalized)) {
      unique.push(normalized);
    }
  }

  return unique.slice(0, MAX_PROJECT_REF_HISTORY);
}

function getProjectRefHistoryFromUi(): string[] {
  const datalist = byId<HTMLDataListElement>('project-ref-history-list');
  return Array.from(datalist.options)
    .map((option) => option.value.trim())
    .filter(Boolean);
}

function renderProjectRefHistory(currentValue: string, history: string[]): void {
  const values = normalizeProjectRefHistory(currentValue, history);
  const datalist = byId<HTMLDataListElement>('project-ref-history-list');

  datalist.innerHTML = values
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join('');
  /*

    '<option value="">從歷史紀錄快速切換</option>',
  */
}

function getStartOfWeek(value: Date): Date {
  const date = startOfDay(value) ?? new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getIsoWeekValue(date: Date): string {
  const target = getStartOfWeek(date);
  const thursday = new Date(target);
  thursday.setDate(target.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const firstWeekStart = getStartOfWeek(firstThursday);
  const week = Math.round((thursday.getTime() - firstWeekStart.getTime()) / 86400000 / 7) + 1;
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function parseIsoWeekValue(value: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) return null;

  const jan4 = new Date(year, 0, 4);
  const firstWeekStart = getStartOfWeek(jan4);
  const monday = new Date(firstWeekStart);
  monday.setDate(firstWeekStart.getDate() + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function startOfDay(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysBetween(left: Date, right: Date): number {
  return Math.round((left.getTime() - right.getTime()) / 86400000);
}

function formatGanttDate(value: Date | string | null | undefined): string {
  const date = startOfDay(value);
  if (!date) return '-';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

type MilestoneSortEntry = {
  name: string;
  start: Date | null;
  due: Date | null;
  hasExplicitDue: boolean;
};

function compareMilestoneEntries(left: MilestoneSortEntry, right: MilestoneSortEntry): number {
  const leftPrimary = left.start?.getTime() ?? left.due?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightPrimary = right.start?.getTime() ?? right.due?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;

  const leftSecondary = left.due?.getTime() ?? left.start?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightSecondary = right.due?.getTime() ?? right.start?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (leftSecondary !== rightSecondary) return leftSecondary - rightSecondary;

  return left.name.localeCompare(right.name, 'zh-Hant');
}

function mergeEarlierDate(current: Date | null, candidate: Date | null): Date | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.getTime() < current.getTime() ? candidate : current;
}

function mergeLaterDate(current: Date | null, candidate: Date | null): Date | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.getTime() > current.getTime() ? candidate : current;
}

function formatMilestoneOptionLabel(milestone: MilestoneSortEntry): string {
  return milestone.name;
}

function getSortedMilestoneEntriesFromIssues(issues: IssueItem[]): MilestoneSortEntry[] {
  const milestones = new Map<string, MilestoneSortEntry>();

  for (const issue of issues) {
    if (!issue.milestone) continue;

    const existing = milestones.get(issue.milestone) ?? {
      name: issue.milestone,
      start: null,
      due: null,
      hasExplicitDue: false,
    };

    existing.start = mergeEarlierDate(existing.start, startOfDay(issue.milestone_start_date));

    const milestoneDue = startOfDay(issue.milestone_due_date);
    if (milestoneDue) {
      existing.due = mergeLaterDate(existing.due, milestoneDue);
      existing.hasExplicitDue = true;
    } else if (!existing.hasExplicitDue) {
      existing.due = mergeLaterDate(existing.due, startOfDay(issue.due_date));
    }

    milestones.set(issue.milestone, existing);
  }

  return Array.from(milestones.values()).sort(compareMilestoneEntries);
}

function getDefaultMilestoneFilterValue(
  milestones: MilestoneSortEntry[],
  currentValue: string,
): string {
  if (currentValue && milestones.some((milestone) => milestone.name === currentValue)) {
    return currentValue;
  }

  const today = startOfDay(new Date());
  if (!today) return '';

  const currentMilestone = milestones.find((milestone) => {
    if (!milestone.start && !milestone.due) return false;

    const afterStart = !milestone.start || milestone.start.getTime() <= today.getTime();
    const beforeDue = !milestone.due || today.getTime() <= milestone.due.getTime();
    return afterStart && beforeDue;
  });

  return currentMilestone?.name ?? '';
}

function populateMilestoneFilterOptions(
  select: HTMLSelectElement,
  milestones: MilestoneSortEntry[],
): void {
  const nextValue = getDefaultMilestoneFilterValue(milestones, select.value);
  select.innerHTML =
    '<option value="">全部</option>' +
    milestones
      .map(
        (milestone) =>
          `<option value="${escapeHtml(milestone.name)}">${escapeHtml(formatMilestoneOptionLabel(milestone))}</option>`,
      )
      .join('');
  select.value = nextValue;
  select.title = select.selectedOptions[0]?.textContent ?? '';
}

function compareIssuesForGantt(a: IssueItem, b: IssueItem): number {
  const aDue = startOfDay(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDue = startOfDay(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  const aCreated = startOfDay(a.created_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bCreated = startOfDay(b.created_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aCreated !== bCreated) return aCreated - bCreated;

  return a.iid - b.iid;
}

function getGanttRiskFlags(issue: IssueItem, today: Date): GanttRiskFlag[] {
  const flags: GanttRiskFlag[] = [];
  if (issue.state === 'closed') return flags;

  const due = startOfDay(issue.due_date);
  const updated = startOfDay(issue.updated_at);

  if (!issue.assignees?.length) flags.push('unassigned');
  if (!due) {
    flags.push('no_due_date');
  } else {
    const diff = daysBetween(due, today);
    if (diff < 0) {
      flags.push('overdue');
    } else if (diff <= 7) {
      flags.push('due_soon');
    }
  }
  if (updated && daysBetween(today, updated) >= 7) {
    flags.push('stale');
  }

  return flags;
}

function getRiskFlagLabel(flag: GanttRiskFlag): string {
  const labels: Record<GanttRiskFlag, string> = {
    overdue: '逾期',
    due_soon: '本週到期',
    no_due_date: '無到期日',
    unassigned: '未指派',
    stale: '7 天未更新',
  };
  return labels[flag];
}

type GanttStatusKind = 'open' | 'in_progress' | 'closed';

function getResolvedMergeRequestCount(issue: IssueItem): number {
  return state.mergeRequestsByIid.get(issue.iid)?.length ?? issue.merge_requests_count ?? 0;
}

function getLinkedItemCount(issue: IssueItem): number {
  return state.issueLinksByIid.get(issue.iid)?.length ?? 0;
}

function getGanttStatusKind(issue: IssueItem): GanttStatusKind {
  if (issue.state === 'closed') return 'closed';
  if (getResolvedMergeRequestCount(issue) > 0) return 'in_progress';
  return 'open';
}

function getGanttStatusLabel(status: GanttStatusKind): string {
  const labels: Record<GanttStatusKind, string> = {
    open: '開啟中',
    in_progress: '進行中',
    closed: '已關閉',
  };
  return labels[status];
}

function getIssueLinkTypeLabel(linkType: string, direction: LinkedItemInfo['direction']): string {
  const outbound: Record<string, string> = {
    relates_to: '關聯',
    blocks: '阻擋',
    is_blocked_by: '被阻擋',
  };
  const inbound: Record<string, string> = {
    relates_to: '關聯',
    blocks: '被阻擋',
    is_blocked_by: '阻擋',
  };
  const labels = direction === 'inbound' ? inbound : outbound;
  return labels[linkType] || linkType.replace(/_/g, ' ');
}

function getDeliveryHighlight(issue: IssueItem): { kind: string; label: string; value: string } {
  const dueDate = startOfDay(issue.due_date);
  const isOverdue =
    issue.state !== 'closed' && !!dueDate && dueDate < (startOfDay(new Date()) as Date);
  const status = getGanttStatusKind(issue);
  if (status === 'closed') {
    return { kind: 'done', label: '目前狀態', value: '已關閉' };
  }
  if (isOverdue) {
    return { kind: 'overdue', label: '目前狀態', value: '逾期' };
  }
  if (status === 'in_progress') {
    return {
      kind: 'review',
      label: '目前狀態',
      value: `進行中 · ${getResolvedMergeRequestCount(issue)} MR`,
    };
  }
  return { kind: 'open', label: '目前狀態', value: '開啟中' };
}

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:8765${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

/* ══════════════════════════════════════════════
   CONFIG
   ══════════════════════════════════════════════ */
function readConfigForm(): AppConfig {
  const projectRef = byId<HTMLInputElement>('project-ref').value.trim();

  return {
    gitlab_url: byId<HTMLInputElement>('gitlab-url').value.trim(),
    token: byId<HTMLInputElement>('gitlab-token').value.trim(),
    project_ref: projectRef,
    project_ref_history: normalizeProjectRefHistory(projectRef, getProjectRefHistoryFromUi()),
    import_file:
      (document.getElementById('import-file') as HTMLInputElement | null)?.value.trim() || '',
    gemini_api_key: byId<HTMLInputElement>('gemini-api-key').value.trim(),
    enable_daily_sync: byId<HTMLInputElement>('enable-daily-sync').checked,
    daily_sync_time: byId<HTMLInputElement>('daily-sync-time').value,
    enable_weekly_report: byId<HTMLInputElement>('enable-weekly-report').checked,
    weekly_report_time: byId<HTMLInputElement>('weekly-report-time').value,
  };
}

function fillConfigForm(config: AppConfig): void {
  byId<HTMLInputElement>('gitlab-url').value = config.gitlab_url || '';
  byId<HTMLInputElement>('gitlab-token').value = config.token || '';
  byId<HTMLInputElement>('project-ref').value = config.project_ref || '';
  renderProjectRefHistory(config.project_ref || '', config.project_ref_history || []);
  const importEl = document.getElementById('import-file') as HTMLInputElement | null;
  if (importEl) importEl.value = config.import_file || '';
  byId<HTMLInputElement>('gemini-api-key').value = config.gemini_api_key || '';
  byId<HTMLInputElement>('enable-daily-sync').checked = Boolean(config.enable_daily_sync);
  byId<HTMLInputElement>('daily-sync-time').value = config.daily_sync_time || '09:00';
  byId<HTMLInputElement>('enable-weekly-report').checked = Boolean(config.enable_weekly_report);
  byId<HTMLInputElement>('weekly-report-time').value = config.weekly_report_time || '17:30';
}

/* ══════════════════════════════════════════════
   TAB 1: DASHBOARD
   ══════════════════════════════════════════════ */
function renderSummary(data: DashboardResponse): void {
  byId<HTMLElement>('metric-new').textContent = String(data.summary.weekly_new_count ?? 0);
  byId<HTMLElement>('metric-updated').textContent = String(data.summary.weekly_updated_count ?? 0);
  byId<HTMLElement>('metric-opened').textContent = String(data.summary.open_issue_count ?? 0);
  byId<HTMLElement>('metric-risk').textContent = String(data.summary.risk_count ?? 0);

  const container = byId<HTMLDivElement>('weekly-summary');
  const items: [string, unknown][] = [
    ['本週新增 Issue', data.summary.weekly_new_count],
    ['本週更新 Issue', data.summary.weekly_updated_count],
    ['目前開啟中', data.summary.open_issue_count],
    ['本週關閉', data.summary.weekly_closed_count],
    ['無負責人', data.summary.unassigned_count],
    ['逾期或逼近到期', data.summary.near_due_count],
  ];

  container.innerHTML = items
    .map(
      ([label, value]) => `
    <div class="summary-item">
      <span>${escapeHtml(String(label))}</span>
      <strong>${value ?? 0}</strong>
    </div>
  `,
    )
    .join('');
}

function renderNewIssues(items: IssueItem[]): void {
  const tbody = byId<HTMLTableSectionElement>('table-new-issues');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">本週沒有新增 issue。</td></tr>';
    return;
  }
  tbody.innerHTML = items
    .map(
      (item) => `
    <tr data-iid="${item.iid}" style="cursor:pointer">
      <td>#${item.iid}</td>
      <td>${escapeHtml(item.module ?? '-')}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml((item.assignees || []).join(', ') || '-')}</td>
      <td>${escapeHtml(item.milestone ?? '-')}</td>
      <td><span class="state-badge ${item.state}">${item.state === 'opened' ? '開啟' : '關閉'}</span></td>
    </tr>
  `,
    )
    .join('');
}

function renderRecentIssues(): void {
  const hours = Number(byId<HTMLInputElement>('recent-hours').value) || 6;
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const recent = state.allIssues
    .filter((i) => i.updated_at && new Date(i.updated_at) >= cutoff)
    .sort((a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime());

  const tbody = byId<HTMLTableSectionElement>('table-recent-issues');
  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">近 ${hours} 小時內沒有更新的 Issue。</td></tr>`;
    return;
  }
  tbody.innerHTML = recent
    .map((item) => {
      const discBadge = item.has_new_discussions
        ? '<span class="disc-badge new" title="有新討論">💬 新</span>'
        : item.user_notes_count > 0
          ? `<span class="disc-badge" title="${item.user_notes_count} 則討論">💬 ${item.user_notes_count}</span>`
          : '<span class="disc-badge none">—</span>';
      return `
    <tr data-iid="${item.iid}" style="cursor:pointer">
      <td>#${item.iid}</td>
      <td>${escapeHtml(item.module ?? '-')}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml((item.assignees || []).join(', ') || '-')}</td>
      <td><span class="state-badge ${item.state}">${item.state === 'opened' ? '開啟' : '關閉'}</span></td>
      <td>${discBadge}</td>
      <td>${fmtDate(item.updated_at)}</td>
    </tr>
  `;
    })
    .join('');
}

function renderCards(containerId: string, items: IssueItem[], emptyText: string): void {
  const container = byId<HTMLDivElement>(containerId);
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
    <article class="issue-card" data-iid="${item.iid}" ${item.web_url ? `data-url="${escapeHtml(item.web_url)}"` : ''} style="cursor:pointer">
      <h4>${item.web_url ? `<a class="issue-link" href="${escapeHtml(item.web_url)}" target="_blank" onclick="event.stopPropagation()">#${item.iid}</a>` : `#${item.iid}`} ${escapeHtml(item.title)}</h4>
      <p>模組：${escapeHtml(item.module ?? '-')} ｜ 狀態：<span class="state-badge ${item.state}">${item.state === 'opened' ? '開啟' : '關閉'}</span> ｜ 負責人：${escapeHtml((item.assignees || []).join(', ') || '-')}</p>
      <p>Milestone：${escapeHtml(item.milestone ?? '-')} ｜ 更新時間：${fmtDate(item.updated_at)}</p>
      ${item.note || item.reason ? `<p>${escapeHtml(item.note ?? item.reason ?? '')}</p>` : ''}
      <div class="tags">
        ${(item.labels || [])
          .slice(0, 5)
          .map((label: string) => `<span class="tag">${escapeHtml(label)}</span>`)
          .join('')}
      </div>
    </article>
  `,
    )
    .join('');
}

/* ══════════════════════════════════════════════
   TAB 2: GANTT TIMELINE
   ══════════════════════════════════════════════ */
let _ganttRafId = 0;
function scheduleGanttRender(issues: IssueItem[]): void {
  updateTimelineFilterIndicators();
  cancelAnimationFrame(_ganttRafId);
  _ganttRafId = requestAnimationFrame(() => {
    const mode = state.timelineViewMode;
    const ganttEl = byId<HTMLDivElement>('gantt-chart');
    const calEl = byId<HTMLDivElement>('calendar-chart');
    if (mode === 'calendar') {
      ganttEl.style.display = 'none';
      calEl.style.display = '';
      renderCalendarViewSafe(issues);
    } else {
      ganttEl.style.display = '';
      calEl.style.display = 'none';
      renderGanttEnhancedSafe(issues);
    }
  });
}

function enhanceTimelineControls(): void {
  const controls = document.querySelector<HTMLDivElement>('.timeline-controls');
  if (!controls || controls.dataset.enhanced === 'true') return;

  const quickLabel = byId<HTMLSelectElement>('gantt-quick-view').closest('label');
  const groupLabel = byId<HTMLSelectElement>('gantt-group-by').closest('label');
  const monthLabel = byId<HTMLInputElement>('gantt-month').closest('label');
  const viewLabel = byId<HTMLSelectElement>('gantt-view-mode').closest('label');
  const milestoneLabel = byId<HTMLSelectElement>('gantt-milestone-filter').closest('label');
  const assigneeLabel = byId<HTMLSelectElement>('gantt-assignee-filter').closest('label');
  const stateLabel = byId<HTMLSelectElement>('gantt-state-filter').closest('label');
  const legend = controls.querySelector<HTMLElement>('.timeline-legend');

  if (
    !quickLabel ||
    !groupLabel ||
    !monthLabel ||
    !viewLabel ||
    !milestoneLabel ||
    !assigneeLabel ||
    !stateLabel ||
    !legend
  ) {
    return;
  }

  const rangeLabel = document.createElement('label');
  rangeLabel.className = 'timeline-control';
  rangeLabel.innerHTML = `
    周/月
    <select id="gantt-range-mode">
      <option value="month">月</option>
      <option value="week" selected>周</option>
    </select>
  `;

  const mainControls = document.createElement('div');
  mainControls.className = 'timeline-main-controls';
  mainControls.append(quickLabel, groupLabel, viewLabel, rangeLabel);

  const periodControls = document.createElement('div');
  periodControls.className = 'timeline-period-controls';
  const periodNav = monthLabel.querySelector('div');
  if (periodNav) {
    periodNav.classList.add('timeline-period-nav');
  }
  const monthTextNode = Array.from(monthLabel.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  if (monthTextNode) {
    monthTextNode.textContent = '區間';
  }
  periodControls.append(monthLabel);

  const filtersPanel = document.createElement('details');
  filtersPanel.className = 'timeline-filters-panel';
  const summary = document.createElement('summary');
  const summaryLabel = document.createElement('span');
  summaryLabel.textContent = '更多篩選';
  const summaryCount = document.createElement('span');
  summaryCount.className = 'timeline-filter-count';
  summaryCount.hidden = true;
  summary.append(summaryLabel, summaryCount);
  const filtersGrid = document.createElement('div');
  filtersGrid.className = 'timeline-filters-grid';
  filtersGrid.append(milestoneLabel, assigneeLabel, stateLabel);
  filtersPanel.append(summary, filtersGrid);

  controls.innerHTML = '';
  controls.append(mainControls, periodControls, filtersPanel, legend);
  controls.dataset.enhanced = 'true';
  updateTimelineFilterIndicators();
}

function updateTimelineFilterIndicators(): void {
  const quickView = getById<HTMLSelectElement>('gantt-quick-view');
  const milestoneFilter = getById<HTMLSelectElement>('gantt-milestone-filter');
  const assigneeFilter = getById<HTMLSelectElement>('gantt-assignee-filter');
  const stateFilter = getById<HTMLSelectElement>('gantt-state-filter');

  quickView?.closest('label')?.classList.toggle('is-active', quickView.value !== 'custom');
  milestoneFilter?.closest('label')?.classList.toggle('is-active', Boolean(milestoneFilter.value));
  assigneeFilter?.closest('label')?.classList.toggle('is-active', Boolean(assigneeFilter.value));
  stateFilter?.closest('label')?.classList.toggle('is-active', Boolean(stateFilter.value));

  const filtersPanel = document.querySelector<HTMLDetailsElement>('.timeline-filters-panel');
  const filtersSummary = filtersPanel?.querySelector<HTMLElement>('summary');
  const filtersCount = filtersSummary?.querySelector<HTMLElement>('.timeline-filter-count');
  const activeFilterCount = [milestoneFilter, assigneeFilter, stateFilter].filter((filter) =>
    Boolean(filter?.value),
  ).length;

  filtersPanel?.classList.toggle('is-active', activeFilterCount > 0);
  if (filtersSummary) {
    filtersSummary.title =
      activeFilterCount > 0 ? `已套用 ${activeFilterCount} 個篩選條件` : '更多篩選';
  }
  if (filtersCount) {
    filtersCount.hidden = activeFilterCount === 0;
    filtersCount.textContent = String(activeFilterCount);
  }
}

function getTimelineRangeMode(): TimelineRangeMode {
  const select = getById<HTMLSelectElement>('gantt-range-mode');
  return (select?.value as TimelineRangeMode) || state.timelineRangeMode;
}

function syncTimelineRangeControls(): void {
  const mode = getTimelineRangeMode();
  state.timelineRangeMode = mode;

  const monthInput = getById<HTMLInputElement>('gantt-month');
  const weekInput = getById<HTMLInputElement>('gantt-week');
  if (!monthInput || !weekInput) return;

  monthInput.hidden = mode !== 'month';
  monthInput.disabled = mode !== 'month';
  weekInput.hidden = mode !== 'week';
  weekInput.disabled = mode !== 'week';

  if (!monthInput.value) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  if (!weekInput.value) {
    weekInput.value = getIsoWeekValue(new Date());
  }

  state.ganttMonth = monthInput.value;
  state.ganttWeek = weekInput.value;
}

function getSelectedMonth(): { year: number; month: number; minDate: Date; maxDate: Date } {
  const input = byId<HTMLInputElement>('gantt-month');
  let val = input.value || state.ganttMonth;
  if (!val) {
    const now = new Date();
    val = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    input.value = val;
    state.ganttMonth = val;
  }
  const [y, m] = val.split('-').map(Number);
  const minDate = new Date(y, m - 1, 1);
  minDate.setHours(0, 0, 0, 0);
  const maxDate = new Date(y, m, 0); // last day of month
  maxDate.setHours(0, 0, 0, 0);
  return { year: y, month: m, minDate, maxDate };
}

function getSelectedTimelineWindow(): {
  mode: TimelineRangeMode;
  start: Date;
  end: Date;
  label: string;
} {
  const mode = getTimelineRangeMode();
  if (mode === 'week') {
    const input = byId<HTMLInputElement>('gantt-week');
    let value = input.value || state.ganttWeek;
    if (!value) {
      value = getIsoWeekValue(new Date());
      input.value = value;
    }
    const start = parseIsoWeekValue(value) ?? getStartOfWeek(new Date());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(0, 0, 0, 0);
    state.ganttWeek = value;
    return {
      mode,
      start,
      end,
      label: `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`,
    };
  }

  const { year, month, minDate, maxDate } = getSelectedMonth();
  return {
    mode,
    start: minDate,
    end: maxDate,
    label: `${year}/${String(month).padStart(2, '0')}`,
  };
}

function shiftMonth(delta: number): void {
  if (getTimelineRangeMode() === 'week') {
    const weekInput = byId<HTMLInputElement>('gantt-week');
    const baseWeek =
      parseIsoWeekValue(weekInput.value || state.ganttWeek) ?? getStartOfWeek(new Date());
    baseWeek.setDate(baseWeek.getDate() + delta * 7);
    const value = getIsoWeekValue(baseWeek);
    weekInput.value = value;
    state.ganttWeek = value;
  } else {
    const { year, month } = getSelectedMonth();
    const d = new Date(year, month - 1 + delta, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byId<HTMLInputElement>('gantt-month').value = val;
    state.ganttMonth = val;
  }
  scheduleGanttRender(state.allIssues);
}

/* ══════════════════════════════════════════════
   TAB 3: EXCEL-LIKE TABLE
   ══════════════════════════════════════════════ */
function populateGanttFiltersEnhanced(issues: IssueItem[]): void {
  const milestones = getSortedMilestoneEntriesFromIssues(issues);
  const assignees = [...new Set(issues.flatMap((i) => i.assignees || []))].filter(Boolean).sort();

  const mSel = byId<HTMLSelectElement>('gantt-milestone-filter');
  const aSel = byId<HTMLSelectElement>('gantt-assignee-filter');
  const aVal = aSel.value;

  populateMilestoneFilterOptions(mSel, milestones);
  aSel.innerHTML =
    '<option value="">全部</option>' +
    assignees.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');

  aSel.value = aVal;
  updateTimelineFilterIndicators();
}

function applyGanttQuickView(
  issues: IssueItem[],
  today: Date,
  quickView: GanttQuickView,
): IssueItem[] {
  switch (quickView) {
    case 'overdue':
      return issues.filter(
        (issue) =>
          issue.state !== 'closed' &&
          (startOfDay(issue.due_date)?.getTime() ?? Number.POSITIVE_INFINITY) < today.getTime(),
      );
    case 'due_soon':
      return issues.filter((issue) => {
        const due = startOfDay(issue.due_date);
        if (!due || issue.state === 'closed') return false;
        const diff = daysBetween(due, today);
        return diff >= 0 && diff <= 7;
      });
    case 'unassigned':
      return issues.filter((issue) => !issue.assignees?.length);
    case 'no_due_date':
      return issues.filter((issue) => !issue.due_date);
    case 'active_milestones':
      return issues.filter((issue) => issue.state !== 'closed' && Boolean(issue.milestone));
    default:
      return issues;
  }
}

function getGanttGroupInfo(
  issue: IssueItem,
  groupBy: GanttGroupBy,
): { key: string; label: string; avatarUrl?: string | null } {
  switch (groupBy) {
    case 'milestone':
      return { key: issue.milestone || '__none__', label: issue.milestone || '未排 Milestone' };
    case 'assignee':
      return { key: issue.assignees?.[0] || '__none__', label: issue.assignees?.[0] || '未指派' };
    case 'module':
      return { key: issue.module || '__none__', label: issue.module || '未分類 Module' };
    default:
      return { key: '__all__', label: '全部 Issue' };
  }
}

function buildGanttGroupsEnhanced(
  issues: IssueItem[],
  groupBy: GanttGroupBy,
): Array<{ key: string; label: string; items: IssueItem[] }> {
  if (groupBy === 'none') {
    return [
      { key: '__all__', label: '全部 Issue', items: [...issues].sort(compareIssuesForGantt) },
    ];
  }

  const groups = new Map<string, { key: string; label: string; items: IssueItem[] }>();
  for (const issue of issues) {
    const group = getGanttGroupInfo(issue, groupBy);
    if (!groups.has(group.key)) {
      groups.set(group.key, { ...group, items: [] });
    }
    groups.get(group.key)!.items.push(issue);
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, items: group.items.sort(compareIssuesForGantt) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'));
}

function getVisibleMilestoneDeadlines(
  issues: IssueItem[],
  minDate: Date,
  maxDate: Date,
): Array<{ milestone: string; dueDate: Date }> {
  function getPrimaryAssigneeAvatar(issue: IssueItem): string | null {
    return issue.assignee_details?.find((item) => item.avatar_url)?.avatar_url ?? null;
  }

  function buildGanttGroupsWithAvatar(
    sourceIssues: IssueItem[],
    groupBy: GanttGroupBy,
  ): Array<{ key: string; label: string; avatarUrl: string | null; items: IssueItem[] }> {
    if (groupBy === 'none') {
      return [
        {
          key: '__all__',
          label: '全部 Issue',
          avatarUrl: null,
          items: [...sourceIssues].sort(compareIssuesForGantt),
        },
      ];
    }

    const groups = new Map<
      string,
      { key: string; label: string; avatarUrl: string | null; items: IssueItem[] }
    >();
    for (const issue of sourceIssues) {
      const group = getGanttGroupInfo(issue, groupBy);
      if (!groups.has(group.key)) {
        groups.set(group.key, {
          key: group.key,
          label: group.label,
          avatarUrl: groupBy === 'assignee' ? getPrimaryAssigneeAvatar(issue) : null,
          items: [],
        });
      }

      const existing = groups.get(group.key)!;
      existing.items.push(issue);
      if (!existing.avatarUrl && groupBy === 'assignee') {
        existing.avatarUrl = getPrimaryAssigneeAvatar(issue);
      }
    }

    return Array.from(groups.values())
      .map((group) => ({ ...group, items: group.items.sort(compareIssuesForGantt) }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'));
  }

  if (!state.analytics) return [];
  const visibleMilestones = new Set(
    issues.map((issue) => issue.milestone).filter(Boolean) as string[],
  );

  return state.analytics.burndown
    .filter((milestone) => visibleMilestones.has(milestone.milestone))
    .map((milestone) => ({
      milestone: milestone.milestone,
      dueDate: startOfDay(milestone.due_date),
    }))
    .filter((item): item is { milestone: string; dueDate: Date } => Boolean(item.dueDate))
    .filter((item) => item.dueDate >= minDate && item.dueDate <= maxDate)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
}

function getMilestoneRangeMap(): Map<string, { start: Date | null; end: Date | null }> {
  return new Map(
    (state.analytics?.burndown ?? []).map((milestone) => [
      milestone.milestone,
      {
        start: startOfDay(milestone.start_date),
        end: startOfDay(milestone.due_date),
      },
    ]),
  );
}

function getIssueTimelineRange(
  issue: IssueItem,
  milestoneRanges: Map<string, { start: Date | null; end: Date | null }>,
  today: Date,
): { start: Date; end: Date } {
  const milestoneStart = startOfDay(issue.milestone_start_date);
  const milestoneEnd = startOfDay(issue.milestone_due_date);
  const mappedRange = issue.milestone ? milestoneRanges.get(issue.milestone) : undefined;
  const resolvedMilestoneStart = milestoneStart ?? mappedRange?.start;
  const resolvedMilestoneEnd = milestoneEnd ?? mappedRange?.end;

  if (issue.state === 'closed') {
    if (resolvedMilestoneStart || resolvedMilestoneEnd) {
      const closedStart =
        resolvedMilestoneStart ?? resolvedMilestoneEnd ?? startOfDay(issue.created_at) ?? today;
      const closedEnd =
        resolvedMilestoneEnd ??
        resolvedMilestoneStart ??
        startOfDay(issue.closed_at) ??
        closedStart;
      return {
        start: closedStart,
        end: closedEnd < closedStart ? closedStart : closedEnd,
      };
    }

    const closedStart = startOfDay(issue.created_at) ?? today;
    const closedEnd = startOfDay(issue.closed_at) ?? closedStart;
    return {
      start: closedStart,
      end: closedEnd < closedStart ? closedStart : closedEnd,
    };
  }

  const scheduleStart = resolvedMilestoneStart ?? startOfDay(issue.created_at) ?? today;
  const scheduleEnd =
    resolvedMilestoneEnd ??
    startOfDay(issue.due_date) ??
    (scheduleStart > today ? scheduleStart : today);

  return {
    start: scheduleStart,
    end: scheduleEnd < scheduleStart ? scheduleStart : scheduleEnd,
  };
}

function renderGanttEnhanced(issues: IssueItem[]): void {
  const container = byId<HTMLDivElement>('gantt-chart');
  const summary = byId<HTMLDivElement>('gantt-summary');

  if (!issues.length) {
    summary.textContent = '目前沒有可顯示的 Issue。';
    container.innerHTML = '<div class="empty-state">目前沒有可顯示的 Issue。</div>';
    return;
  }

  const today = startOfDay(new Date())!;
  const quickView = byId<HTMLSelectElement>('gantt-quick-view').value as GanttQuickView;
  const groupBy = byId<HTMLSelectElement>('gantt-group-by').value as GanttGroupBy;
  const milestoneFilter = byId<HTMLSelectElement>('gantt-milestone-filter').value;
  const assigneeFilter = byId<HTMLSelectElement>('gantt-assignee-filter').value;
  const stateFilter = byId<HTMLSelectElement>('gantt-state-filter').value;
  const milestoneRanges = getMilestoneRangeMap();

  let filtered = [...issues];
  if (milestoneFilter) filtered = filtered.filter((issue) => issue.milestone === milestoneFilter);
  if (assigneeFilter)
    filtered = filtered.filter((issue) => (issue.assignees || []).includes(assigneeFilter));
  if (stateFilter) filtered = filtered.filter((issue) => issue.state === stateFilter);

  filtered = applyGanttQuickView(filtered, today, quickView);

  const windowRange = getSelectedTimelineWindow();
  const minDate = windowRange.start;
  const maxDate = windowRange.end;

  // Filter issues that overlap with the selected month
  filtered = filtered.filter((issue) => {
    const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
    return start <= maxDate && end >= minDate;
  });

  if (!filtered.length) {
    summary.textContent = '目前篩選條件下沒有符合的 Issue。';
    container.innerHTML = '<div class="empty-state">目前篩選條件下沒有符合的 Issue。</div>';
    return;
  }

  const days: Date[] = [];
  const cursor = new Date(minDate);
  while (cursor <= maxDate) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const totalDays = days.length;
  const labelWidth = 260;
  const dayWidth = totalDays <= 30 ? 40 : totalDays <= 60 ? 30 : totalDays <= 120 ? 22 : 16;
  const gridTotalWidth = totalDays * dayWidth;
  const todayStr = today.toISOString().slice(0, 10);

  function dayIndex(date: Date): number {
    return Math.round((date.getTime() - minDate.getTime()) / 86400000);
  }

  const labelInterval = Math.max(1, Math.ceil(40 / dayWidth));
  let monthHeaderHtml = '';
  let dayHeaderHtml = '';
  let prevMonth = -1;
  let monthSpanStart = 0;
  const monthSegments: { label: string; span: number }[] = [];

  for (let i = 0; i < totalDays; i++) {
    const day = days[i];
    const monthKey = day.getFullYear() * 100 + day.getMonth();
    if (monthKey !== prevMonth) {
      if (prevMonth !== -1) {
        monthSegments.push({
          label: `${days[monthSpanStart].getFullYear()}/${days[monthSpanStart].getMonth() + 1}`,
          span: i - monthSpanStart,
        });
      }
      monthSpanStart = i;
      prevMonth = monthKey;
    }

    const showLabel =
      i % labelInterval === 0 || day.getDate() === 1 || day.toISOString().slice(0, 10) === todayStr;
    const classes = [
      day.getDay() === 0 || day.getDay() === 6 ? 'weekend' : '',
      day.toISOString().slice(0, 10) === todayStr ? 'today' : '',
    ]
      .filter(Boolean)
      .join(' ');
    dayHeaderHtml += `<div class="gantt-header-day ${classes}" style="width:${dayWidth}px">${showLabel ? day.getDate() : ''}</div>`;
  }

  monthSegments.push({
    label: `${days[monthSpanStart].getFullYear()}/${days[monthSpanStart].getMonth() + 1}`,
    span: totalDays - monthSpanStart,
  });
  for (const segment of monthSegments) {
    monthHeaderHtml += `<div class="gantt-header-month" style="width:${segment.span * dayWidth}px">${segment.label}</div>`;
  }

  let bgStrips = '';
  for (let i = 0; i < totalDays; i++) {
    const day = days[i];
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const isToday = day.toISOString().slice(0, 10) === todayStr;
    if (isWeekend) {
      bgStrips += `<div class="gantt-bg-strip weekend" style="left:${i * dayWidth}px;width:${dayWidth}px"></div>`;
    }
    if (isToday) {
      bgStrips += `<div class="gantt-bg-strip today" style="left:${i * dayWidth}px;width:${dayWidth}px"></div>`;
    }
  }

  const groups = buildGanttGroupsForSafeRender(filtered, groupBy);
  const deadlineMarkers = getVisibleMilestoneDeadlines(filtered, minDate, maxDate)
    .map((marker) => {
      const left = dayIndex(marker.dueDate) * dayWidth + dayWidth / 2;
      return `
        <div class="gantt-deadline-marker" style="left:${left}px">
          <span class="gantt-deadline-label" title="${escapeHtml(marker.milestone)}">${escapeHtml(marker.milestone)}</span>
          <span class="gantt-deadline-line"></span>
        </div>
      `;
    })
    .join('');

  let rowsHtml = '';
  let riskIssueCount = 0;
  for (const group of groups) {
    const collapsed = state.ganttCollapsedGroups.has(group.key);
    const groupRiskCount = group.items.filter(
      (issue) => getGanttRiskFlags(issue, today).length > 0,
    ).length;

    if (groupBy !== 'none') {
      const groupAvatar =
        groupBy === 'assignee'
          ? group.avatarUrl
            ? `<span class="gantt-group-avatar-shell"><img class="gantt-group-avatar" src="${escapeHtml(group.avatarUrl)}" alt="${escapeHtml(group.label)}" /></span>`
            : `<span class="gantt-group-avatar-shell"><span class="gantt-group-avatar fallback">${escapeHtml(group.label.slice(0, 1).toUpperCase())}</span></span>`
          : '';
      rowsHtml += `
        <div class="gantt-group-header" style="grid-template-columns:${labelWidth}px ${gridTotalWidth}px" data-group-key="${escapeHtml(group.key)}">
          <div class="gantt-group-title">
            <span class="gantt-group-toggle">${collapsed ? '+' : '-'}</span>
            ${groupAvatar}
            <strong>${escapeHtml(group.label)}</strong>
            <div class="gantt-group-meta">
              <span class="gantt-group-badge">${group.items.length} issues</span>
              ${groupRiskCount ? `<span class="gantt-group-badge risk">${groupRiskCount} 風險</span>` : ''}
            </div>
          </div>
          <div class="gantt-group-spacer"></div>
        </div>
      `;
    }

    if (collapsed) continue;

    for (const issue of group.items) {
      const { start: scheduleStart, end: scheduleEnd } = getIssueTimelineRange(
        issue,
        milestoneRanges,
        today,
      );
      const riskFlags = getGanttRiskFlags(issue, today);
      if (riskFlags.length > 0) riskIssueCount += 1;

      const barStart = dayIndex(scheduleStart);
      const barEnd = dayIndex(scheduleEnd);
      const startPx = barStart * dayWidth;
      const widthPx = Math.max(dayWidth, (barEnd - barStart + 1) * dayWidth - 4);

      let barClass = issue.state === 'closed' ? 'closed' : 'opened';
      const issueDue = startOfDay(issue.due_date);
      if (issue.state !== 'closed' && issueDue && issueDue < today) {
        barClass = 'overdue';
      }

      const assigneeStr = (issue.assignees || []).join(', ') || '未指派';
      const riskClasses = riskFlags.map((flag) => `risk-${flag}`).join(' ');
      const riskTags = !riskFlags.length
        ? ''
        : `<div class="gantt-risk-tags">${riskFlags
            .slice(0, 3)
            .map((flag) => `<span class="risk-tag ${flag}">${getRiskFlagLabel(flag)}</span>`)
            .join('')}</div>`;

      rowsHtml += `
        <div class="gantt-row" style="grid-template-columns:${labelWidth}px ${gridTotalWidth}px">
          <div class="gantt-row-label" data-iid="${issue.iid}" title="#${issue.iid} ${escapeHtml(issue.title)}">
            <strong>#${issue.iid}</strong> ${escapeHtml(issue.title.length > 26 ? `${issue.title.slice(0, 26)}...` : issue.title)}
            <small>${escapeHtml(assigneeStr)} · ${escapeHtml(issue.milestone ?? '未排 Milestone')} · ${escapeHtml(issue.module ?? '未分類 Module')}</small>
            ${riskTags}
          </div>
          <div class="gantt-row-bars">
            <div class="gantt-bar ${barClass} ${riskClasses}"
                 style="left:${startPx + 2}px;width:${widthPx}px;"
                 data-iid="${issue.iid}"
                 data-title="${escapeHtml(issue.title)}"
                 data-state="${issue.state}"
                 data-assignees="${escapeHtml(assigneeStr)}"
                 data-milestone="${escapeHtml(issue.milestone ?? '-')}"
                 data-module="${escapeHtml(issue.module ?? '-')}"
                 data-created="${formatGanttDate(scheduleStart)}"
                 data-due="${formatGanttDate(scheduleEnd)}"
                 data-risk="${escapeHtml(riskFlags.map((flag) => getRiskFlagLabel(flag)).join('、') || '無')}"
                 data-url="${escapeHtml(issue.web_url ?? '')}">
              <span class="gantt-bar-label">${widthPx > 64 ? `#${issue.iid}` : ''}</span>
            </div>
          </div>
        </div>
      `;
    }
  }

  const todayIdx = dayIndex(today);
  const todayPx = todayIdx * dayWidth + dayWidth / 2;
  const groupLabel = groupBy === 'none' ? '不分組' : `依 ${groupBy} 分組`;
  const quickViewLabel =
    byId<HTMLSelectElement>('gantt-quick-view').selectedOptions[0]?.textContent || '自訂';
  summary.textContent = `顯示 ${filtered.length} / ${issues.length} 筆，${groupLabel}，快速視圖：${quickViewLabel}${riskIssueCount ? `，共 ${riskIssueCount} 筆風險` : ''}`;

  container.setAttribute('data-risk-mode', 'highlight');
  container.innerHTML = `
    <div class="gantt-scroll">
      <div class="gantt-header" style="grid-template-columns:${labelWidth}px ${gridTotalWidth}px">
        <div class="gantt-header-label">Issue</div>
        <div class="gantt-header-dates-wrap">
          <div class="gantt-header-months" style="display:flex">${monthHeaderHtml}</div>
          <div class="gantt-header-dates" style="display:flex">${dayHeaderHtml}</div>
        </div>
      </div>
      <div class="gantt-body">
        <div class="gantt-body-inner">
          <div class="gantt-bg-strips" style="left:${labelWidth}px;width:${gridTotalWidth}px">${bgStrips}</div>
          <div class="gantt-deadlines" style="left:${labelWidth}px;width:${gridTotalWidth}px">${deadlineMarkers}</div>
          ${rowsHtml}
          ${todayIdx >= 0 && todayIdx < totalDays ? `<div class="gantt-today-line" style="left:${todayPx + labelWidth}px"></div>` : ''}
        </div>
      </div>
    </div>
  `;

  const tooltip = byId<HTMLDivElement>('gantt-tooltip');
  container.querySelectorAll<HTMLElement>('.gantt-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', (event) => {
      const el = event.currentTarget as HTMLElement;
      tooltip.innerHTML = `
        <h5>#${el.dataset.iid} ${el.dataset.title}</h5>
        <p>狀態：${el.dataset.state === 'opened' ? '進行中' : '已完成'}</p>
        <p>Assignee：${el.dataset.assignees}</p>
        <p>Milestone：${el.dataset.milestone}</p>
        <p>Module：${el.dataset.module}</p>
        <p>起始：${el.dataset.created} · 到期：${el.dataset.due}</p>
        <p>風險：${el.dataset.risk}</p>
        <p>單擊開啟詳細，雙擊前往 GitLab</p>
      `;
      tooltip.classList.add('visible');
    });
    bar.addEventListener('mousemove', (event) => {
      const me = event as MouseEvent;
      tooltip.style.left = `${me.clientX + 12}px`;
      tooltip.style.top = `${me.clientY + 12}px`;
    });
    bar.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
    bar.addEventListener('click', (event) => {
      const el = event.currentTarget as HTMLElement;
      const issue = state.allIssues.find((item) => item.iid === Number(el.dataset.iid));
      if (issue) openIssueDetail(issue);
    });
    bar.addEventListener('dblclick', (event) => {
      const el = event.currentTarget as HTMLElement;
      if (el.dataset.url) {
        void window.trackerBridge.openPath(el.dataset.url);
      }
    });
  });

  container.querySelectorAll<HTMLElement>('.gantt-row-label[data-iid]').forEach((label) => {
    label.addEventListener('click', (event) => {
      const el = event.currentTarget as HTMLElement;
      const issue = state.allIssues.find((item) => item.iid === Number(el.dataset.iid));
      if (issue) openIssueDetail(issue);
    });
  });

  container
    .querySelectorAll<HTMLElement>('.gantt-group-header[data-group-key]')
    .forEach((header) => {
      header.addEventListener('click', (event) => {
        const el = event.currentTarget as HTMLElement;
        const key = el.dataset.groupKey;
        if (!key) return;
        if (state.ganttCollapsedGroups.has(key)) {
          state.ganttCollapsedGroups.delete(key);
        } else {
          state.ganttCollapsedGroups.add(key);
        }
        scheduleGanttRender(state.allIssues);
      });
    });
}

/* ══════════════════════════════════════════════
   CALENDAR VIEW
   ══════════════════════════════════════════════ */
function renderCalendarView(issues: IssueItem[]): void {
  const container = byId<HTMLDivElement>('calendar-chart');
  const summary = byId<HTMLDivElement>('gantt-summary');

  if (!issues.length) {
    summary.textContent = '目前沒有可顯示的 Issue。';
    container.innerHTML = '<div class="empty-state">目前沒有可顯示的 Issue。</div>';
    return;
  }

  const today = startOfDay(new Date())!;
  const todayStr = today.toISOString().slice(0, 10);
  const quickView = byId<HTMLSelectElement>('gantt-quick-view').value as GanttQuickView;
  const milestoneFilter = byId<HTMLSelectElement>('gantt-milestone-filter').value;
  const assigneeFilter = byId<HTMLSelectElement>('gantt-assignee-filter').value;
  const stateFilter = byId<HTMLSelectElement>('gantt-state-filter').value;
  const milestoneRanges = getMilestoneRangeMap();

  let filtered = [...issues];
  if (milestoneFilter) filtered = filtered.filter((i) => i.milestone === milestoneFilter);
  if (assigneeFilter)
    filtered = filtered.filter((i) => (i.assignees || []).includes(assigneeFilter));
  if (stateFilter) filtered = filtered.filter((i) => i.state === stateFilter);
  filtered = applyGanttQuickView(filtered, today, quickView);

  const { year, month, minDate, maxDate } = getSelectedMonth();

  // Filter issues overlapping this month
  filtered = filtered.filter((issue) => {
    const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
    return start <= maxDate && end >= minDate;
  });

  // Build calendar grid: find the Monday before (or on) the 1st, end on Sunday after (or on) last day
  const totalDaysInMonth = maxDate.getDate();
  const firstDow = minDate.getDay(); // 0=Sun
  const startOffset = firstDow === 0 ? 6 : firstDow - 1; // days to go back to reach Monday
  const calStart = new Date(year, month - 1, 1 - startOffset);
  calStart.setHours(0, 0, 0, 0);
  // Build 6 weeks (42 cells) to always have consistent grid
  const totalCells = 42;
  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(calStart);
    d.setDate(calStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    cells.push(d);
  }

  // Map issues to each day they span
  const dayIssuesMap = new Map<string, IssueItem[]>();
  for (const issue of filtered) {
    const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
    for (const cell of cells) {
      if (cell >= start && cell <= end) {
        const key = cell.toISOString().slice(0, 10);
        if (!dayIssuesMap.has(key)) dayIssuesMap.set(key, []);
        dayIssuesMap.get(key)!.push(issue);
      }
    }
  }

  // Compute bar segments per issue: for each cell, determine if the issue
  // starts, continues, or ends on that day so we can render connected bars
  function getBarSegment(
    issue: IssueItem,
    cellDate: Date,
  ): 'start' | 'middle' | 'end' | 'single' | null {
    const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
    const cellStr = cellDate.toISOString().slice(0, 10);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    if (cellDate < start || cellDate > end) return null;
    const isStart = cellStr === startStr || cellDate.getDay() === 1; // bar start or Monday (new row)
    const isEnd = cellStr === endStr || cellDate.getDay() === 0; // bar end or Sunday (end of row)
    if (isStart && isEnd) return 'single';
    if (isStart) return 'start';
    if (isEnd) return 'end';
    return 'middle';
  }

  const weekdayHeaders = ['一', '二', '三', '四', '五', '六', '日'];
  let html = '<div class="cal-grid">';
  // Weekday header row
  html += '<div class="cal-header-row">';
  for (const wd of weekdayHeaders) {
    html += `<div class="cal-header-cell">${wd}</div>`;
  }
  html += '</div>';

  // Calendar cells
  html += '<div class="cal-body">';
  for (let i = 0; i < totalCells; i++) {
    const cell = cells[i];
    const cellStr = cell.toISOString().slice(0, 10);
    const inMonth = cell.getMonth() === month - 1;
    const isToday = cellStr === todayStr;
    const isWeekend = cell.getDay() === 0 || cell.getDay() === 6;
    const cellIssues = dayIssuesMap.get(cellStr) || [];

    const classes = [
      'cal-cell',
      inMonth ? '' : 'other-month',
      isToday ? 'today' : '',
      isWeekend ? 'weekend' : '',
    ]
      .filter(Boolean)
      .join(' ');

    html += `<div class="${classes}">`;
    html += `<div class="cal-date">${cell.getDate()}</div>`;
    html += '<div class="cal-issues">';

    // Render bar segments for issues on this day
    const seen = new Set<number>();
    for (const issue of cellIssues) {
      if (seen.has(issue.iid)) continue;
      seen.add(issue.iid);
      const seg = getBarSegment(issue, cell);
      if (!seg) continue;

      let barClass = issue.state === 'closed' ? 'closed' : 'opened';
      const issueDue = startOfDay(issue.due_date);
      if (issue.state !== 'closed' && issueDue && issueDue < today) barClass = 'overdue';

      const showLabel = seg === 'start' || seg === 'single';
      const label = showLabel
        ? `#${issue.iid} ${issue.title.length > 12 ? issue.title.slice(0, 12) + '...' : issue.title}`
        : '';

      html += `<div class="cal-bar ${barClass} seg-${seg}"
                    data-iid="${issue.iid}"
                    data-title="${escapeHtml(issue.title)}"
                    data-state="${issue.state}"
                    data-assignees="${escapeHtml((issue.assignees || []).join(', ') || '未指派')}"
                    data-milestone="${escapeHtml(issue.milestone ?? '-')}"
                    data-module="${escapeHtml(issue.module ?? '-')}"
                    data-created="${formatGanttDate(getIssueTimelineRange(issue, milestoneRanges, today).start)}"
                    data-due="${formatGanttDate(getIssueTimelineRange(issue, milestoneRanges, today).end)}"
                    data-url="${escapeHtml(issue.web_url ?? '')}">
        ${showLabel ? `<span class="cal-bar-label">${escapeHtml(label)}</span>` : ''}
      </div>`;
    }

    html += '</div></div>';
  }
  html += '</div></div>';

  summary.textContent = `月曆模式：${year} 年 ${month} 月，顯示 ${filtered.length} / ${issues.length} 筆`;
  container.innerHTML = html;

  // Wire tooltip + click for calendar bars
  const tooltip = byId<HTMLDivElement>('gantt-tooltip');
  container.querySelectorAll<HTMLElement>('.cal-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', (event) => {
      const el = event.currentTarget as HTMLElement;
      tooltip.innerHTML = `
        <h5>#${el.dataset.iid} ${el.dataset.title}</h5>
        <p>狀態：${el.dataset.state === 'opened' ? '進行中' : '已完成'}</p>
        <p>Assignee：${el.dataset.assignees}</p>
        <p>Milestone：${el.dataset.milestone}</p>
        <p>起始：${el.dataset.created} · 到期：${el.dataset.due}</p>
      `;
      tooltip.classList.add('visible');
    });
    bar.addEventListener('mousemove', (event) => {
      const me = event as MouseEvent;
      tooltip.style.left = `${me.clientX + 12}px`;
      tooltip.style.top = `${me.clientY + 12}px`;
    });
    bar.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    bar.addEventListener('click', (event) => {
      const el = event.currentTarget as HTMLElement;
      const issue = state.allIssues.find((item) => item.iid === Number(el.dataset.iid));
      if (issue) openIssueDetail(issue);
    });
    bar.addEventListener('dblclick', (event) => {
      const el = event.currentTarget as HTMLElement;
      if (el.dataset.url) void window.trackerBridge.openPath(el.dataset.url);
    });
  });
}

function getPrimaryAssigneeAvatarForGantt(issue: IssueItem): string | null {
  return issue.assignee_details?.find((item) => item.avatar_url)?.avatar_url ?? null;
}

function buildGanttGroupsForSafeRender(
  issues: IssueItem[],
  groupBy: GanttGroupBy,
): Array<{ key: string; label: string; avatarUrl: string | null; items: IssueItem[] }> {
  if (groupBy === 'none') {
    return [
      {
        key: '__all__',
        label: '全部 Issue',
        avatarUrl: null,
        items: [...issues].sort(compareIssuesForGantt),
      },
    ];
  }

  const groups = new Map<
    string,
    { key: string; label: string; avatarUrl: string | null; items: IssueItem[] }
  >();
  for (const issue of issues) {
    const group = getGanttGroupInfo(issue, groupBy);
    if (!groups.has(group.key)) {
      groups.set(group.key, {
        key: group.key,
        label: group.label,
        avatarUrl: groupBy === 'assignee' ? getPrimaryAssigneeAvatarForGantt(issue) : null,
        items: [],
      });
    }

    const existing = groups.get(group.key)!;
    existing.items.push(issue);
    if (!existing.avatarUrl && groupBy === 'assignee') {
      existing.avatarUrl = getPrimaryAssigneeAvatarForGantt(issue);
    }
  }

  return Array.from(groups.values())
    .map((group) => ({ ...group, items: group.items.sort(compareIssuesForGantt) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'));
}

function decorateGanttRowAvatars(container: HTMLDivElement, issues: IssueItem[]): void {
  const issueMap = new Map(issues.map((issue) => [String(issue.iid), issue]));

  container.querySelectorAll<HTMLElement>('.gantt-row-label[data-iid]').forEach((label) => {
    const issue = issueMap.get(label.dataset.iid ?? '');
    if (!issue) return;

    const assigneeText = (issue.assignees || []).join(', ') || 'Unassigned';
    const primaryAssignee = issue.assignee_details?.[0]?.name || issue.assignees?.[0] || 'U';
    const assigneeAvatar = getPrimaryAssigneeAvatarForGantt(issue);
    const assigneeAvatarHtml = assigneeAvatar
      ? `<img class="gantt-row-avatar" src="${escapeHtml(assigneeAvatar)}" alt="${escapeHtml(primaryAssignee)}" />`
      : `<span class="gantt-row-avatar fallback">${escapeHtml(primaryAssignee.slice(0, 1).toUpperCase())}</span>`;
    const riskTags = label.querySelector('.gantt-risk-tags')?.outerHTML ?? '';

    label.innerHTML = `
      <div class="gantt-row-head">
        ${assigneeAvatarHtml}
        <div class="gantt-row-copy">
          <div class="gantt-row-title"><strong>#${issue.iid}</strong> ${escapeHtml(issue.title.length > 34 ? `${issue.title.slice(0, 34)}...` : issue.title)}</div>
          <small>${escapeHtml(assigneeText)} 繚 ${escapeHtml(issue.milestone ?? 'No milestone')} 繚 ${escapeHtml(issue.module ?? 'No module')}</small>
        </div>
      </div>
      ${riskTags}
    `;
  });
}

function renderGanttEnhancedSafe(issues: IssueItem[]): void {
  const container = byId<HTMLDivElement>('gantt-chart');
  const summary = byId<HTMLDivElement>('gantt-summary');
  const tooltip = byId<HTMLDivElement>('gantt-tooltip');

  if (!issues.length) {
    summary.textContent = '沒有可顯示的 issue。';
    container.innerHTML = '<div class="empty-state">沒有可顯示的 issue。</div>';
    return;
  }

  const today = startOfDay(new Date())!;
  const quickView = byId<HTMLSelectElement>('gantt-quick-view').value as GanttQuickView;
  const groupBy = byId<HTMLSelectElement>('gantt-group-by').value as GanttGroupBy;
  const milestoneFilter = byId<HTMLSelectElement>('gantt-milestone-filter').value;
  const assigneeFilter = byId<HTMLSelectElement>('gantt-assignee-filter').value;
  const stateFilter = byId<HTMLSelectElement>('gantt-state-filter').value;
  const milestoneRanges = getMilestoneRangeMap();
  const windowRange = getSelectedTimelineWindow();

  let filtered = [...issues];
  if (milestoneFilter) filtered = filtered.filter((issue) => issue.milestone === milestoneFilter);
  if (assigneeFilter)
    filtered = filtered.filter((issue) => (issue.assignees || []).includes(assigneeFilter));
  if (stateFilter) filtered = filtered.filter((issue) => issue.state === stateFilter);
  filtered = applyGanttQuickView(filtered, today, quickView);
  filtered = filtered.filter((issue) => {
    const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
    return start <= windowRange.end && end >= windowRange.start;
  });

  if (!filtered.length) {
    summary.textContent = `這個${windowRange.mode === 'week' ? '週' : '月'}區間沒有符合條件的 issue。`;
    container.innerHTML = '<div class="empty-state">這個區間沒有符合條件的 issue。</div>';
    return;
  }

  const days: Date[] = [];
  const cursor = new Date(windowRange.start);
  while (cursor <= windowRange.end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const totalDays = days.length;
  const labelWidth = windowRange.mode === 'week' ? 300 : 260;
  const dayWidth = windowRange.mode === 'week' ? 128 : totalDays <= 31 ? 36 : 24;
  const gridTotalWidth = totalDays * dayWidth;
  const todayStr = today.toISOString().slice(0, 10);

  const dayIndex = (date: Date): number =>
    Math.round((date.getTime() - windowRange.start.getTime()) / 86400000);
  const groups = buildGanttGroupsForSafeRender(filtered, groupBy);
  const deadlineMarkers = getVisibleMilestoneDeadlines(filtered, windowRange.start, windowRange.end)
    .map((marker) => {
      const left = dayIndex(marker.dueDate) * dayWidth + dayWidth / 2;
      return `
        <div class="gantt-deadline-marker" style="left:${left}px">
          <span class="gantt-deadline-label" title="${escapeHtml(marker.milestone)}">${escapeHtml(marker.milestone)}</span>
          <span class="gantt-deadline-line"></span>
        </div>
      `;
    })
    .join('');

  let monthHeaderHtml = '';
  let dayHeaderHtml = '';
  const monthSegments: { label: string; span: number }[] = [];
  let prevMonthKey = -1;
  let monthSpanStart = 0;

  days.forEach((day, index) => {
    const monthKey = day.getFullYear() * 100 + day.getMonth();
    if (monthKey !== prevMonthKey) {
      if (prevMonthKey !== -1) {
        monthSegments.push({
          label: `${days[monthSpanStart].getFullYear()}/${days[monthSpanStart].getMonth() + 1}`,
          span: index - monthSpanStart,
        });
      }
      monthSpanStart = index;
      prevMonthKey = monthKey;
    }

    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const isToday = day.toISOString().slice(0, 10) === todayStr;
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getDay()];
    dayHeaderHtml += `
      <div class="gantt-header-day ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}" style="width:${dayWidth}px">
        <span class="gantt-header-day-label">${weekday}</span>
        <span class="gantt-header-day-date">${day.getMonth() + 1}/${day.getDate()}</span>
      </div>
    `;
  });

  monthSegments.push({
    label: `${days[monthSpanStart].getFullYear()}/${days[monthSpanStart].getMonth() + 1}`,
    span: totalDays - monthSpanStart,
  });
  monthSegments.forEach((segment) => {
    monthHeaderHtml += `<div class="gantt-header-month" style="width:${segment.span * dayWidth}px">${segment.label}</div>`;
  });

  let bgStrips = '';
  days.forEach((day, index) => {
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const isToday = day.toISOString().slice(0, 10) === todayStr;
    if (isWeekend) {
      bgStrips += `<div class="gantt-bg-strip weekend" style="left:${index * dayWidth}px;width:${dayWidth}px"></div>`;
    }
    if (isToday) {
      bgStrips += `<div class="gantt-bg-strip today" style="left:${index * dayWidth}px;width:${dayWidth}px"></div>`;
    }
  });

  let rowsHtml = '';
  let riskIssueCount = 0;
  groups.forEach((group) => {
    const collapsed = state.ganttCollapsedGroups.has(group.key);
    const groupRiskCount = group.items.filter(
      (issue) => getGanttRiskFlags(issue, today).length > 0,
    ).length;

    if (groupBy !== 'none') {
      const groupAvatar =
        groupBy === 'assignee'
          ? group.avatarUrl
            ? `<span class="gantt-group-avatar-shell"><span class="gantt-group-avatar fallback">${escapeHtml(group.label.slice(0, 1).toUpperCase())}</span><img class="gantt-group-avatar" src="${escapeHtml(group.avatarUrl)}" alt="${escapeHtml(group.label)}" /></span>`
            : `<span class="gantt-group-avatar-shell"><span class="gantt-group-avatar fallback">${escapeHtml(group.label.slice(0, 1).toUpperCase())}</span></span>`
          : '';
      rowsHtml += `
        <div class="gantt-group-header" style="grid-template-columns:${labelWidth}px ${gridTotalWidth}px" data-group-key="${escapeHtml(group.key)}">
          <div class="gantt-group-title">
            <span class="gantt-group-toggle">${collapsed ? '+' : '-'}</span>
            ${groupAvatar}
            <strong>${escapeHtml(group.label)}</strong>
            <div class="gantt-group-meta">
              <span class="gantt-group-badge">${group.items.length} issues</span>
              ${groupRiskCount ? `<span class="gantt-group-badge risk">${groupRiskCount} 風險</span>` : ''}
            </div>
          </div>
          <div class="gantt-group-spacer"></div>
        </div>
      `;
    }

    if (collapsed) return;

    group.items.forEach((issue) => {
      const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
      const riskFlags = getGanttRiskFlags(issue, today);
      const statusKind = getGanttStatusKind(issue);
      const mergeRequestCount = getResolvedMergeRequestCount(issue);
      if (riskFlags.length > 0) riskIssueCount += 1;

      const assigneeText = (issue.assignees || []).join(', ') || 'Unassigned';
      const clampedStart = start < windowRange.start ? windowRange.start : start;
      const clampedEnd = end > windowRange.end ? windowRange.end : end;
      const startPx = dayIndex(clampedStart) * dayWidth;
      const endPx = dayIndex(clampedEnd) * dayWidth;
      const widthPx = Math.max(dayWidth, endPx - startPx + dayWidth - 4);

      const barClass = issue.state === 'closed' ? 'closed' : 'opened';
      const isOverdue = issue.state !== 'closed' && riskFlags.includes('overdue');
      const effectiveBarClass = isOverdue ? 'overdue' : barClass;
      const deliveryClass =
        statusKind === 'closed'
          ? 'delivery-done'
          : statusKind === 'in_progress'
            ? 'delivery-review'
            : '';
      const riskClasses = riskFlags.map((flag) => `risk-${flag}`).join(' ');
      const primaryStatusLabel =
        issue.state === 'closed'
          ? '已關閉'
          : isOverdue
            ? '逾期'
            : mergeRequestCount > 0
              ? '進行中'
              : '開啟中';
      const primaryStatusClass =
        issue.state === 'closed'
          ? 'closed'
          : isOverdue
            ? 'overdue'
            : mergeRequestCount > 0
              ? 'in_progress'
              : 'open';
      const visibleRiskFlags = isOverdue
        ? riskFlags.filter((flag) => flag !== 'overdue')
        : riskFlags;
      const chipsHtml = [
        `<span class="gantt-status-pill ${primaryStatusClass}">${primaryStatusLabel}</span>`,
        ...visibleRiskFlags
          .slice(0, 3)
          .map((flag) => `<span class="risk-tag ${flag}">${getRiskFlagLabel(flag)}</span>`),
      ].join('');
      rowsHtml += `
        <div class="gantt-row" style="grid-template-columns:${labelWidth}px ${gridTotalWidth}px">
          <div class="gantt-row-label" data-iid="${issue.iid}" title="#${issue.iid} ${escapeHtml(issue.title)}">
            <strong>#${issue.iid}</strong> ${escapeHtml(issue.title.length > 34 ? `${issue.title.slice(0, 34)}...` : issue.title)}
            <small>${escapeHtml(assigneeText)} · ${escapeHtml(issue.milestone ?? 'No milestone')} · ${escapeHtml(issue.module ?? 'No module')}</small>
            <div class="gantt-status-pills">${chipsHtml}</div>
          </div>
          <div class="gantt-row-bars">
            <div class="gantt-bar ${effectiveBarClass} ${deliveryClass} ${riskClasses}"
                 style="left:${startPx + 2}px;width:${widthPx}px;"
                 data-iid="${issue.iid}"
                 data-title="${escapeHtml(issue.title)}"
                 data-state="${escapeHtml(primaryStatusLabel)}"
                 data-state-raw="${escapeHtml(issue.state)}"
                 data-mr-count="${mergeRequestCount}"
                 data-linked-count="${getLinkedItemCount(issue)}"
                 data-blocked="${issue.blocking_issues_count || 0}"
                 data-assignees="${escapeHtml(assigneeText)}"
                 data-milestone="${escapeHtml(issue.milestone ?? '-')}"
                 data-module="${escapeHtml(issue.module ?? '-')}"
                 data-created="${formatGanttDate(start)}"
                 data-due="${formatGanttDate(end)}"
                 data-risk="${escapeHtml(riskFlags.map((flag) => getRiskFlagLabel(flag)).join(', ') || 'None')}"
                 data-url="${escapeHtml(issue.web_url ?? '')}">
            </div>
          </div>
        </div>
      `;
    });
  });

  const todayIdx = dayIndex(today);
  const todayPx = todayIdx * dayWidth + dayWidth / 2;
  const groupLabel = groupBy === 'none' ? 'No grouping' : `Group by ${groupBy}`;
  const quickViewLabel =
    byId<HTMLSelectElement>('gantt-quick-view').selectedOptions[0]?.textContent || 'All issues';
  summary.textContent = `顯示 ${filtered.length} / ${issues.length} 筆，${windowRange.mode === 'week' ? '週檢視' : '月檢視'} ${windowRange.label}，${groupLabel}，Focus：${quickViewLabel}${riskIssueCount ? `，${riskIssueCount} 筆風險` : ''}`;
  requestIssueLinkDataForVisibleIssues(filtered);

  container.setAttribute('data-risk-mode', 'highlight');
  container.innerHTML = `
    <div class="gantt-scroll">
      <div class="gantt-header" style="grid-template-columns:${labelWidth}px ${gridTotalWidth}px">
        <div class="gantt-header-label">Issue</div>
        <div class="gantt-header-dates-wrap">
          <div class="gantt-header-months" style="display:flex">${monthHeaderHtml}</div>
          <div class="gantt-header-dates gantt-header-dates-rich" style="display:flex">${dayHeaderHtml}</div>
        </div>
      </div>
      <div class="gantt-body">
        <div class="gantt-body-inner">
          <div class="gantt-bg-strips" style="left:${labelWidth}px;width:${gridTotalWidth}px">${bgStrips}</div>
          <div class="gantt-deadlines" style="left:${labelWidth}px;width:${gridTotalWidth}px">${deadlineMarkers}</div>
          ${rowsHtml}
          ${todayIdx >= 0 && todayIdx < totalDays ? `<div class="gantt-today-line" style="left:${todayPx + labelWidth}px"></div>` : ''}
        </div>
      </div>
    </div>
  `;

  container
    .querySelectorAll<HTMLImageElement>('.gantt-group-avatar-shell .gantt-group-avatar')
    .forEach((avatar) => {
      avatar.addEventListener(
        'error',
        () => {
          avatar.remove();
        },
        { once: true },
      );
    });

  container.querySelectorAll<HTMLElement>('.gantt-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', (event) => {
      const el = event.currentTarget as HTMLElement;
      tooltip.innerHTML = `
        <h5>#${el.dataset.iid} ${el.dataset.title}</h5>
        <p>Status: ${el.dataset.state}</p>
        <p>Issue State: ${el.dataset.stateRaw}</p>
        <p>Linked MR: ${el.dataset.mrCount}</p>
        <p>Linked Items: ${el.dataset.linkedCount}</p>
        <p>Blocked: ${el.dataset.blocked}</p>
        <p>Assignee: ${el.dataset.assignees}</p>
        <p>Milestone: ${el.dataset.milestone}</p>
        <p>Module: ${el.dataset.module}</p>
        <p>Range: ${el.dataset.created} - ${el.dataset.due}</p>
        <p>Risk: ${el.dataset.risk}</p>
        <p>Click to open detail</p>
      `;
      tooltip.classList.add('visible');
    });
    bar.addEventListener('mousemove', (event) => {
      const mouseEvent = event as MouseEvent;
      tooltip.style.left = `${mouseEvent.clientX + 12}px`;
      tooltip.style.top = `${mouseEvent.clientY + 12}px`;
    });
    bar.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    bar.addEventListener('click', (event) => {
      const el = event.currentTarget as HTMLElement;
      const issue = state.allIssues.find((item) => item.iid === Number(el.dataset.iid));
      if (issue) openIssueDetail(issue);
    });
    bar.addEventListener('dblclick', (event) => {
      const el = event.currentTarget as HTMLElement;
      if (el.dataset.url) {
        void window.trackerBridge.openPath(el.dataset.url);
      }
    });
  });

  container.querySelectorAll<HTMLElement>('.gantt-row-label[data-iid]').forEach((label) => {
    label.addEventListener('click', (event) => {
      const el = event.currentTarget as HTMLElement;
      const issue = state.allIssues.find((item) => item.iid === Number(el.dataset.iid));
      if (issue) openIssueDetail(issue);
    });
  });

  container
    .querySelectorAll<HTMLElement>('.gantt-group-header[data-group-key]')
    .forEach((header) => {
      header.addEventListener('click', (event) => {
        const el = event.currentTarget as HTMLElement;
        const key = el.dataset.groupKey;
        if (!key) return;
        if (state.ganttCollapsedGroups.has(key)) {
          state.ganttCollapsedGroups.delete(key);
        } else {
          state.ganttCollapsedGroups.add(key);
        }
        scheduleGanttRender(state.allIssues);
      });
    });
}

function renderCalendarViewSafe(issues: IssueItem[]): void {
  const container = byId<HTMLDivElement>('calendar-chart');
  const summary = byId<HTMLDivElement>('gantt-summary');
  const tooltip = byId<HTMLDivElement>('gantt-tooltip');

  if (!issues.length) {
    summary.textContent = '沒有可顯示的 issue。';
    container.innerHTML = '<div class="empty-state">沒有可顯示的 issue。</div>';
    return;
  }

  const today = startOfDay(new Date())!;
  const todayStr = today.toISOString().slice(0, 10);
  const quickView = byId<HTMLSelectElement>('gantt-quick-view').value as GanttQuickView;
  const milestoneFilter = byId<HTMLSelectElement>('gantt-milestone-filter').value;
  const assigneeFilter = byId<HTMLSelectElement>('gantt-assignee-filter').value;
  const stateFilter = byId<HTMLSelectElement>('gantt-state-filter').value;
  const milestoneRanges = getMilestoneRangeMap();
  const windowRange = getSelectedTimelineWindow();

  let filtered = [...issues];
  if (milestoneFilter) filtered = filtered.filter((issue) => issue.milestone === milestoneFilter);
  if (assigneeFilter)
    filtered = filtered.filter((issue) => (issue.assignees || []).includes(assigneeFilter));
  if (stateFilter) filtered = filtered.filter((issue) => issue.state === stateFilter);
  filtered = applyGanttQuickView(filtered, today, quickView);
  filtered = filtered.filter((issue) => {
    const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
    return start <= windowRange.end && end >= windowRange.start;
  });

  if (!filtered.length) {
    summary.textContent = `這個${windowRange.mode === 'week' ? '週' : '月'}區間沒有符合條件的 issue。`;
    container.innerHTML = '<div class="empty-state">這個區間沒有符合條件的 issue。</div>';
    return;
  }

  const cells: Date[] = [];
  let firstVisible = new Date(windowRange.start);
  if (windowRange.mode === 'month') {
    firstVisible = getStartOfWeek(new Date(windowRange.start));
    for (let index = 0; index < 42; index++) {
      const day = new Date(firstVisible);
      day.setDate(firstVisible.getDate() + index);
      day.setHours(0, 0, 0, 0);
      cells.push(day);
    }
  } else {
    for (let index = 0; index < 7; index++) {
      const day = new Date(windowRange.start);
      day.setDate(windowRange.start.getDate() + index);
      day.setHours(0, 0, 0, 0);
      cells.push(day);
    }
  }

  const getBarSegment = (
    issue: IssueItem,
    cellDate: Date,
  ): 'start' | 'middle' | 'end' | 'single' | null => {
    const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
    if (cellDate < start || cellDate > end) return null;

    const cellKey = cellDate.toISOString().slice(0, 10);
    const startKey = start.toISOString().slice(0, 10);
    const endKey = end.toISOString().slice(0, 10);
    const isStart = cellKey === startKey || cellDate.getDay() === 1;
    const isEnd = cellKey === endKey || cellDate.getDay() === 0;

    if (isStart && isEnd) return 'single';
    if (isStart) return 'start';
    if (isEnd) return 'end';
    return 'middle';
  };

  container.classList.toggle('week-mode', windowRange.mode === 'week');

  const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const orderedWeekdays =
    windowRange.mode === 'week'
      ? cells.map((day) => weekdayNames[(day.getDay() + 6) % 7])
      : weekdayNames;

  let html = '<div class="cal-grid">';
  html += '<div class="cal-header-row">';
  if (windowRange.mode === 'week') {
    cells.forEach((day, index) => {
      html += `
        <div class="cal-header-cell">
          <span class="cal-header-weekday">${orderedWeekdays[index]}</span>
          <span class="cal-header-date">${day.getMonth() + 1}/${day.getDate()}</span>
        </div>
      `;
    });
  } else {
    orderedWeekdays.forEach((weekday) => {
      html += `
        <div class="cal-header-cell">
          <span class="cal-header-weekday">${weekday}</span>
        </div>
      `;
    });
  }
  html += '</div>';

  html += '<div class="cal-body">';
  cells.forEach((cell) => {
    const cellKey = cell.toISOString().slice(0, 10);
    const inCurrentMonth =
      cell.getMonth() === windowRange.start.getMonth() || windowRange.mode === 'week';
    const cellIssues = filtered
      .filter((issue) => {
        const { start, end } = getIssueTimelineRange(issue, milestoneRanges, today);
        return cell >= start && cell <= end;
      })
      .sort(compareIssuesForGantt);

    const visibleIssues = cellIssues.slice(0, windowRange.mode === 'week' ? 6 : 4);
    const remainingCount = cellIssues.length - visibleIssues.length;
    const isToday = cellKey === todayStr;
    const isWeekend = cell.getDay() === 0 || cell.getDay() === 6;

    html += `<div class="cal-cell ${inCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}">`;
    html += `
      <div class="cal-cell-head">
        <span class="cal-date">${cell.getDate()}</span>
        ${cellIssues.length ? `<span class="cal-count">${cellIssues.length}</span>` : ''}
      </div>
    `;
    html += '<div class="cal-issues">';

    visibleIssues.forEach((issue) => {
      const segment = getBarSegment(issue, cell);
      if (!segment) return;

      let barClass = issue.state === 'closed' ? 'closed' : 'opened';
      const issueDue = startOfDay(issue.due_date);
      if (issue.state !== 'closed' && issueDue && issueDue < today) {
        barClass = 'overdue';
      }

      const label =
        windowRange.mode === 'week' || segment === 'start' || segment === 'single'
          ? `#${issue.iid} ${issue.title.length > 18 ? `${issue.title.slice(0, 18)}...` : issue.title}`
          : '';

      html += `
        <div class="cal-bar ${barClass} seg-${segment}"
             data-iid="${issue.iid}"
             data-title="${escapeHtml(issue.title)}"
             data-state="${issue.state}"
             data-assignees="${escapeHtml((issue.assignees || []).join(', ') || 'Unassigned')}"
             data-milestone="${escapeHtml(issue.milestone ?? '-')}"
             data-module="${escapeHtml(issue.module ?? '-')}"
             data-created="${formatGanttDate(getIssueTimelineRange(issue, milestoneRanges, today).start)}"
             data-due="${formatGanttDate(getIssueTimelineRange(issue, milestoneRanges, today).end)}"
             data-url="${escapeHtml(issue.web_url ?? '')}">
          ${label ? `<span class="cal-bar-label">${escapeHtml(label)}</span>` : ''}
        </div>
      `;
    });

    if (remainingCount > 0) {
      html += `<div class="cal-more">+${remainingCount} more</div>`;
    }

    html += '</div></div>';
  });
  html += '</div></div>';

  summary.textContent = `顯示 ${filtered.length} / ${issues.length} 筆，${windowRange.mode === 'week' ? '週曆' : '月曆'} ${windowRange.label}`;
  container.innerHTML = html;

  container.querySelectorAll<HTMLElement>('.cal-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', (event) => {
      const el = event.currentTarget as HTMLElement;
      tooltip.innerHTML = `
        <h5>#${el.dataset.iid} ${el.dataset.title}</h5>
        <p>State: ${el.dataset.state}</p>
        <p>Assignee: ${el.dataset.assignees}</p>
        <p>Milestone: ${el.dataset.milestone}</p>
        <p>Range: ${el.dataset.created} - ${el.dataset.due}</p>
      `;
      tooltip.classList.add('visible');
    });
    bar.addEventListener('mousemove', (event) => {
      const mouseEvent = event as MouseEvent;
      tooltip.style.left = `${mouseEvent.clientX + 12}px`;
      tooltip.style.top = `${mouseEvent.clientY + 12}px`;
    });
    bar.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    bar.addEventListener('click', (event) => {
      const el = event.currentTarget as HTMLElement;
      const issue = state.allIssues.find((item) => item.iid === Number(el.dataset.iid));
      if (issue) openIssueDetail(issue);
    });
    bar.addEventListener('dblclick', (event) => {
      const el = event.currentTarget as HTMLElement;
      if (el.dataset.url) {
        void window.trackerBridge.openPath(el.dataset.url);
      }
    });
  });
}

function getFilteredSortedIssues(): IssueItem[] {
  let filtered = [...state.allIssues];

  // Search
  const search = byId<HTMLInputElement>('table-search').value.trim().toLowerCase();
  if (search) {
    filtered = filtered.filter(
      (i) =>
        String(i.iid).includes(search) ||
        (i.title || '').toLowerCase().includes(search) ||
        (i.module || '').toLowerCase().includes(search) ||
        (i.assignees || []).some((a) => a.toLowerCase().includes(search)) ||
        (i.milestone || '').toLowerCase().includes(search) ||
        (i.labels || []).some((l) => l.toLowerCase().includes(search)),
    );
  }

  // State filter
  const stateFilter = byId<HTMLSelectElement>('table-state-filter').value;
  if (stateFilter) filtered = filtered.filter((i) => i.state === stateFilter);

  // Milestone filter
  const msFilter = byId<HTMLSelectElement>('table-milestone-filter').value;
  if (msFilter) filtered = filtered.filter((i) => i.milestone === msFilter);

  // Label filter
  const labelFilter = byId<HTMLSelectElement>('table-label-filter').value;
  if (labelFilter) filtered = filtered.filter((i) => (i.labels || []).includes(labelFilter));

  // Date range filter (by created_at)
  const dateStart = byId<HTMLInputElement>('table-date-start').value;
  const dateEnd = byId<HTMLInputElement>('table-date-end').value;
  if (dateStart) {
    const ds = new Date(dateStart);
    ds.setHours(0, 0, 0, 0);
    filtered = filtered.filter((i) => {
      if (!i.created_at) return false;
      return new Date(i.created_at) >= ds;
    });
  }
  if (dateEnd) {
    const de = new Date(dateEnd);
    de.setHours(23, 59, 59, 999);
    filtered = filtered.filter((i) => {
      if (!i.created_at) return false;
      return new Date(i.created_at) <= de;
    });
  }

  // Sort
  const { key, asc } = state.tableSort;
  filtered.sort((a: any, b: any) => {
    let av = a[key];
    let bv = b[key];
    if (key === 'assignees') {
      av = (av || []).join(', ');
      bv = (bv || []).join(', ');
    }
    if (av == null) av = '';
    if (bv == null) bv = '';
    if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av;
    const cmp = String(av).localeCompare(String(bv), 'zh-Hant');
    return asc ? cmp : -cmp;
  });

  return filtered;
}

function renderSpreadsheet(): void {
  const filtered = getFilteredSortedIssues();
  const tbody = byId<HTMLTableSectionElement>('table-all-issues');
  const info = byId<HTMLElement>('table-info');
  info.textContent = `顯示 ${filtered.length} / ${state.allIssues.length} 筆`;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">沒有符合條件的 Issue。</td></tr>';
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (item, idx) => `
    <tr data-iid="${item.iid}" data-url="${escapeHtml(item.web_url ?? '')}">
      <td class="row-num">${idx + 1}</td>
      <td><a class="issue-link" href="${escapeHtml(item.web_url ?? '#')}" target="_blank" style="color:var(--accent);text-decoration:none" onclick="event.stopPropagation()">#${item.iid}</a></td>
      <td><span class="state-badge ${item.state}">${item.state === 'opened' ? '開啟' : '關閉'}</span></td>
      <td>${escapeHtml(item.module ?? '-')}</td>
      <td title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</td>
      <td>${escapeHtml((item.assignees || []).join(', ') || '-')}</td>
      <td>${escapeHtml(item.milestone ?? '-')}</td>
      <td><div class="cell-labels">${(item.labels || [])
        .slice(0, 3)
        .map((l) => `<span class="tag">${escapeHtml(l)}</span>`)
        .join('')}</div></td>
      <td>${fmtShortDate(item.created_at)}</td>
      <td>${fmtShortDate(item.updated_at)}</td>
      <td>${fmtShortDate(item.due_date)}</td>
    </tr>
  `,
    )
    .join('');

  // Update sort header styles
  document.querySelectorAll('.spreadsheet-wrap th[data-sort]').forEach((th) => {
    const el = th as HTMLElement;
    const key = el.dataset.sort!;
    el.classList.toggle('sorted', key === state.tableSort.key);
    const arrow = el.querySelector('.sort-arrow');
    if (arrow && key === state.tableSort.key) {
      arrow.textContent = state.tableSort.asc ? '\u25B2' : '\u25BC';
    }
  });
}

function populateTableFilters(issues: IssueItem[]): void {
  const milestones = getSortedMilestoneEntriesFromIssues(issues);
  const mSel = byId<HTMLSelectElement>('table-milestone-filter');
  populateMilestoneFilterOptions(mSel, milestones);

  const labels = [...new Set(issues.flatMap((i) => i.labels || []))].filter(Boolean).sort();
  const lSel = byId<HTMLSelectElement>('table-label-filter');
  const lVal = lSel.value;
  lSel.innerHTML =
    '<option value="">全部</option>' +
    labels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  lSel.value = lVal;
}

/* ══════════════════════════════════════════════
   TAB: ANALYTICS — Burndown / Workload / Alerts
   ══════════════════════════════════════════════ */
function renderBurndownChart(ms: BurndownMilestone): void {
  const container = byId<HTMLDivElement>('burndown-chart');
  const statsDiv = byId<HTMLDivElement>('burndown-stats');

  if (!ms.series.length) {
    container.innerHTML = '<div class="empty-state">此 Milestone 沒有足夠資料。</div>';
    statsDiv.innerHTML = '';
    return;
  }

  const series = ms.series;
  const W = 700;
  const H = 300;
  const pad = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const maxY = Math.max(...series.map((p) => Math.max(p.open, p.total, p.ideal ?? 0)), 1);
  const n = series.length;

  function x(i: number): number {
    return pad.left + (i / Math.max(n - 1, 1)) * chartW;
  }
  function y(v: number): number {
    return pad.top + chartH - (v / maxY) * chartH;
  }

  function polyline(data: number[], color: string, dashed = false): string {
    const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="6,4"' : ''} />`;
  }

  // Grid lines
  let gridLines = '';
  const gridSteps = 5;
  for (let i = 0; i <= gridSteps; i++) {
    const yy = pad.top + (i / gridSteps) * chartH;
    const val = Math.round(maxY * (1 - i / gridSteps));
    gridLines += `<line x1="${pad.left}" y1="${yy}" x2="${W - pad.right}" y2="${yy}" stroke="rgba(255,255,255,0.06)" />`;
    gridLines += `<text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${val}</text>`;
  }

  // X-axis labels (show ~8 labels max)
  let xLabels = '';
  const labelStep = Math.max(1, Math.floor(n / 8));
  for (let i = 0; i < n; i += labelStep) {
    const d = series[i].date.slice(5); // MM-DD
    xLabels += `<text x="${x(i)}" y="${H - 5}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${d}</text>`;
  }

  const openData = series.map((p) => p.open);
  const idealData = series.map((p) => p.ideal ?? 0);
  const closedData = series.map((p) => p.closed);

  // Fill area under open line
  const openArea =
    `M${x(0).toFixed(1)},${y(0).toFixed(1)} ` +
    openData.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') +
    ` L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="burndown-svg">
      ${gridLines}
      <path d="${openArea}" fill="rgba(124,156,255,0.1)" />
      ${polyline(idealData, 'rgba(255,255,255,0.25)', true)}
      ${polyline(closedData, 'var(--green-400)')}
      ${polyline(openData, 'var(--accent)')}
      ${xLabels}
      <g transform="translate(${pad.left + 10}, ${pad.top + 10})">
        <line x1="0" y1="0" x2="20" y2="0" stroke="var(--accent)" stroke-width="2" />
        <text x="24" y="4" fill="var(--text-secondary)" font-size="10">剩餘 Open</text>
        <line x1="0" y1="16" x2="20" y2="16" stroke="var(--green-400)" stroke-width="2" />
        <text x="24" y="20" fill="var(--text-secondary)" font-size="10">已完成 Closed</text>
        <line x1="0" y1="32" x2="20" y2="32" stroke="rgba(255,255,255,0.25)" stroke-width="2" stroke-dasharray="6,4" />
        <text x="24" y="36" fill="var(--text-secondary)" font-size="10">理想進度</text>
      </g>
    </svg>
  `;

  const pct = ms.total > 0 ? Math.round((ms.closed / ms.total) * 100) : 0;
  statsDiv.innerHTML = `
    <div class="burndown-stat"><span>總 Issue</span><strong>${ms.total}</strong></div>
    <div class="burndown-stat"><span>已完成</span><strong class="text-green">${ms.closed}</strong></div>
    <div class="burndown-stat"><span>剩餘</span><strong class="text-accent">${ms.open}</strong></div>
    <div class="burndown-stat"><span>完成率</span><strong>${pct}%</strong></div>
    <div class="burndown-stat"><span>到期日</span><strong>${ms.due_date ?? '-'}</strong></div>
  `;
}

function renderBurndownChartSafe(ms: BurndownMilestone): void {
  const container = byId<HTMLDivElement>('burndown-chart');
  const statsDiv = byId<HTMLDivElement>('burndown-stats');

  if (!ms.series.length) {
    container.innerHTML =
      '<div class="empty-state">這個 Milestone 目前沒有可用的 burndown 資料。</div>';
    statsDiv.innerHTML = '';
    return;
  }

  const series = ms.series;
  const width = 700;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxY = Math.max(
    ms.total,
    ...series.map((point) => Math.max(point.open, point.closed, point.total, point.ideal ?? 0)),
    1,
  );
  const pointCount = series.length;

  const x = (index: number): number =>
    padding.left + (index / Math.max(pointCount - 1, 1)) * chartWidth;
  const y = (value: number): number => padding.top + chartHeight - (value / maxY) * chartHeight;
  const buildPolyline = (values: number[], color: string, dashed = false): string => {
    const points = values
      .map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`)
      .join(' ');
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" ${dashed ? 'stroke-dasharray="6,4"' : ''} />`;
  };

  let gridLines = '';
  for (let step = 0; step <= 5; step++) {
    const yy = padding.top + (step / 5) * chartHeight;
    const label = Math.round(maxY * (1 - step / 5));
    gridLines += `<line x1="${padding.left}" y1="${yy}" x2="${width - padding.right}" y2="${yy}" stroke="rgba(255,255,255,0.06)" />`;
    gridLines += `<text x="${padding.left - 8}" y="${yy + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${label}</text>`;
  }

  let xLabels = '';
  const labelStep = Math.max(1, Math.floor(pointCount / 8));
  for (let index = 0; index < pointCount; index += labelStep) {
    xLabels += `<text x="${x(index)}" y="${height - 5}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${series[index].date.slice(5)}</text>`;
  }

  const openData = series.map((point) => point.open);
  const closedData = series.map((point) => point.closed);
  const idealData = series.map((point) => point.ideal ?? 0);
  const openArea =
    `M${x(0).toFixed(1)},${y(0).toFixed(1)} ` +
    openData.map((value, index) => `L${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ') +
    ` L${x(pointCount - 1).toFixed(1)},${y(0).toFixed(1)} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="burndown-svg">
      ${gridLines}
      <path d="${openArea}" fill="rgba(124,156,255,0.1)" />
      ${buildPolyline(idealData, 'rgba(255,255,255,0.25)', true)}
      ${buildPolyline(closedData, 'var(--green-400)')}
      ${buildPolyline(openData, 'var(--accent)')}
      ${xLabels}
      <g transform="translate(${padding.left + 10}, ${padding.top + 10})">
        <line x1="0" y1="0" x2="20" y2="0" stroke="var(--accent)" stroke-width="2" />
        <text x="24" y="4" fill="var(--text-secondary)" font-size="10">Open</text>
        <line x1="0" y1="16" x2="20" y2="16" stroke="var(--green-400)" stroke-width="2" />
        <text x="24" y="20" fill="var(--text-secondary)" font-size="10">Closed</text>
        <line x1="0" y1="32" x2="20" y2="32" stroke="rgba(255,255,255,0.25)" stroke-width="2" stroke-dasharray="6,4" />
        <text x="24" y="36" fill="var(--text-secondary)" font-size="10">Ideal</text>
      </g>
    </svg>
  `;

  const pct = ms.total > 0 ? Math.round((ms.closed / ms.total) * 100) : 0;
  statsDiv.innerHTML = `
    <div class="burndown-stat"><span>總 Issue</span><strong>${ms.total}</strong></div>
    <div class="burndown-stat"><span>已完成</span><strong class="text-green">${ms.closed}</strong></div>
    <div class="burndown-stat"><span>未完成</span><strong class="text-accent">${ms.open}</strong></div>
    <div class="burndown-stat"><span>完成率</span><strong>${pct}%</strong></div>
    <div class="burndown-stat"><span>到期日</span><strong>${ms.due_date ?? '-'}</strong></div>
  `;
}

function renderWorkloadHeatmap(workload: WorkloadEntry[]): void {
  const container = byId<HTMLDivElement>('workload-heatmap');
  if (!workload.length) {
    container.innerHTML = '<div class="empty-state">尚無工作量資料。</div>';
    return;
  }

  const maxOpened = Math.max(...workload.map((w) => w.opened), 1);

  container.innerHTML = `
    <div class="workload-table">
      <div class="workload-header">
        <span class="wl-name">負責人</span>
        <span class="wl-bar">開啟 Issue 數</span>
        <span class="wl-num">開啟</span>
        <span class="wl-num">已關</span>
        <span class="wl-num wl-warn">逾期</span>
        <span class="wl-num wl-alert">3天內</span>
      </div>
      ${workload
        .map((w) => {
          const pct = (w.opened / maxOpened) * 100;
          const hue =
            w.overdue > 0 ? 0 : w.due_soon > 0 ? 35 : w.opened > maxOpened * 0.7 ? 0 : 220;
          const barColor =
            w.overdue > 0
              ? 'var(--red-400)'
              : w.due_soon > 0
                ? 'var(--yellow-400)'
                : w.opened > maxOpened * 0.7
                  ? 'var(--orange-400)'
                  : 'var(--accent)';
          return `
          <div class="workload-row ${w.overdue > 0 ? 'has-overdue' : ''}">
            <span class="wl-name" title="${escapeHtml(w.assignee)}">
              ${
                w.avatar_url
                  ? `<img class="wl-avatar" src="${escapeHtml(w.avatar_url)}" alt="" />`
                  : `<span class="wl-avatar wl-avatar-placeholder">${escapeHtml(w.assignee.includes('未指派') ? '未' : w.assignee.charAt(0).toUpperCase())}</span>`
              }
              ${escapeHtml(w.assignee)}
            </span>
            <span class="wl-bar">
              <span class="wl-bar-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></span>
            </span>
            <span class="wl-num">${w.opened}</span>
            <span class="wl-num">${w.closed}</span>
            <span class="wl-num wl-warn">${w.overdue || '-'}</span>
            <span class="wl-num wl-alert">${w.due_soon || '-'}</span>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}

function renderOverdueAlerts(alerts: AlertEntry[]): void {
  const container = byId<HTMLDivElement>('overdue-alerts');
  if (!alerts.length) {
    container.innerHTML = '<div class="empty-state">目前沒有逾期或即將到期的 Issue。</div>';
    return;
  }

  container.innerHTML = alerts
    .map((a) => {
      const severityLabel: Record<string, string> = {
        overdue: '已逾期',
        critical: '3 天內到期',
        warning: '7 天內到期',
      };
      const severityIcon: Record<string, string> = { overdue: '🔴', critical: '🟡', warning: '🟠' };
      const daysText =
        a.days_until_due < 0
          ? `逾期 ${Math.abs(a.days_until_due)} 天`
          : a.days_until_due === 0
            ? '今天到期'
            : `${a.days_until_due} 天後到期`;
      return `
      <div class="alert-item severity-${a.severity}" data-iid="${a.iid}" style="cursor:pointer">
        <span class="alert-icon">${severityIcon[a.severity] || ''}</span>
        <div class="alert-info">
          <strong>#${a.iid} ${escapeHtml(a.title)}</strong>
          <span class="alert-meta">
            ${escapeHtml((a.assignees || []).join(', ') || '未指派')} · ${escapeHtml(a.milestone ?? '-')} · ${daysText}
          </span>
        </div>
        <span class="alert-badge ${a.severity}">${severityLabel[a.severity] || ''}</span>
      </div>
    `;
    })
    .join('');
}

async function loadAnalytics(): Promise<void> {
  try {
    const data = await api<AnalyticsResponse>('/api/analytics');
    state.analytics = data;
    const sortedBurndown = [...data.burndown].sort((left, right) =>
      compareMilestoneEntries(
        {
          name: left.milestone,
          start: startOfDay(left.start_date),
          due: startOfDay(left.due_date),
          hasExplicitDue: Boolean(left.due_date),
        },
        {
          name: right.milestone,
          start: startOfDay(right.start_date),
          due: startOfDay(right.due_date),
          hasExplicitDue: Boolean(right.due_date),
        },
      ),
    );
    const burndownMilestones: MilestoneSortEntry[] = sortedBurndown.map((milestone) => ({
      name: milestone.milestone,
      start: startOfDay(milestone.start_date),
      due: startOfDay(milestone.due_date),
      hasExplicitDue: Boolean(milestone.due_date),
    }));

    // Populate milestone selector
    const sel = byId<HTMLSelectElement>('burndown-milestone-select');
    const nextValue = getDefaultMilestoneFilterValue(burndownMilestones, sel.value);
    sel.innerHTML =
      '<option value="">選擇 Milestone</option>' +
      burndownMilestones
        .map(
          (milestone) =>
            `<option value="${escapeHtml(milestone.name)}">${escapeHtml(formatMilestoneOptionLabel(milestone))}</option>`,
        )
        .join('');
    sel.value = nextValue;
    sel.title = sel.selectedOptions[0]?.textContent ?? '';

    // Auto-select first milestone if none selected
    if (!sel.value && sortedBurndown.length) {
      sel.value = sortedBurndown[0].milestone;
      sel.title = sel.selectedOptions[0]?.textContent ?? '';
    }

    // Render burndown for selected milestone
    const selectedMs = data.burndown.find((b) => b.milestone === sel.value);
    if (selectedMs) {
      renderBurndownChartSafe(selectedMs);
    }

    // Render workload
    renderWorkloadHeatmap(data.workload);

    // Render alerts on dashboard
    renderOverdueAlerts(data.alerts);

    // Render label distribution
    renderLabelDistribution(data.label_distribution);

    // Render lifecycle
    renderLifecycle(data.lifecycle);

    // Render milestone progress
    renderMilestoneProgressSafe(data.burndown);

    if (
      document.getElementById('tab-timeline')?.classList.contains('active') &&
      state.allIssues.length > 0
    ) {
      scheduleGanttRender(state.allIssues);
    }
  } catch (err) {
    console.error('loadAnalytics failed', err);
  }
}

/* ── Label Distribution Donut Chart ── */
function renderLabelDistribution(labels: LabelDistEntry[]): void {
  const container = byId<HTMLDivElement>('label-distribution');
  if (!labels.length) {
    container.innerHTML = '<div class="empty-state">尚無 Label 資料。</div>';
    return;
  }

  const top = labels.slice(0, 12);
  const total = top.reduce((s, l) => s + l.total, 0) || 1;

  // Donut chart SVG
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const R = 80;
  const r = 50;
  const colors = [
    '#7c9cff',
    '#8d72ff',
    '#4ade80',
    '#f87171',
    '#facc15',
    '#fb923c',
    '#38bdf8',
    '#a78bfa',
    '#34d399',
    '#f472b6',
    '#94a3b8',
    '#e879f9',
  ];

  let segments = '';
  let angle = -90;
  top.forEach((item, i) => {
    const sweep = (item.total / total) * 360;
    const startAngle = angle;
    const endAngle = angle + sweep;
    const largeArc = sweep > 180 ? 1 : 0;
    const toRad = (a: number) => (a * Math.PI) / 180;

    const x1 = cx + R * Math.cos(toRad(startAngle));
    const y1 = cy + R * Math.sin(toRad(startAngle));
    const x2 = cx + R * Math.cos(toRad(endAngle));
    const y2 = cy + R * Math.sin(toRad(endAngle));
    const x3 = cx + r * Math.cos(toRad(endAngle));
    const y3 = cy + r * Math.sin(toRad(endAngle));
    const x4 = cx + r * Math.cos(toRad(startAngle));
    const y4 = cy + r * Math.sin(toRad(startAngle));

    segments += `<path d="M${x1},${y1} A${R},${R} 0 ${largeArc},1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${largeArc},0 ${x4},${y4} Z" fill="${colors[i % colors.length]}" opacity="0.85" />`;
    angle = endAngle;
  });

  // Legend
  const legend = top
    .map((item, i) => {
      const pct = ((item.total / total) * 100).toFixed(1);
      return `<div class="label-legend-item">
      <span class="label-legend-dot" style="background:${colors[i % colors.length]}"></span>
      <span class="label-legend-name">${escapeHtml(item.label)}</span>
      <span class="label-legend-count">${item.total} (${pct}%)</span>
    </div>`;
    })
    .join('');

  container.innerHTML = `
    <div class="label-chart-layout">
      <svg viewBox="0 0 ${size} ${size}" class="donut-svg">
        ${segments}
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="var(--text-primary)" font-size="18" font-weight="700">${total}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="var(--text-muted)" font-size="10">Issues</text>
      </svg>
      <div class="label-legend">${legend}</div>
    </div>
  `;
}

/* ── Issue Lifecycle (MTTR + Histogram + Throughput) ── */
function renderLifecycle(lc: LifecycleData): void {
  const container = byId<HTMLDivElement>('lifecycle-stats');
  if (!lc.total_closed) {
    container.innerHTML = '<div class="empty-state">尚無已結案 Issue 資料（無法計算 MTTR）。</div>';
    return;
  }

  // KPI cards
  const kpis = `
    <div class="lifecycle-kpi-row">
      <div class="burndown-stat"><span>平均解決 (MTTR)</span><strong>${lc.mttr_days ?? '-'} 天</strong></div>
      <div class="burndown-stat"><span>中位數</span><strong>${lc.median_days ?? '-'} 天</strong></div>
      <div class="burndown-stat"><span>P90</span><strong>${lc.p90_days ?? '-'} 天</strong></div>
      <div class="burndown-stat"><span>已結案總數</span><strong>${lc.total_closed}</strong></div>
    </div>
  `;

  // Histogram SVG
  const hist = lc.histogram;
  const maxH = Math.max(...hist.map((b) => b.count), 1);
  const barW = 60;
  const barGap = 8;
  const chartH = 140;
  const svgW = hist.length * (barW + barGap);

  let histBars = '';
  hist.forEach((b, i) => {
    const h = (b.count / maxH) * (chartH - 20);
    const bx = i * (barW + barGap);
    const by = chartH - h;
    histBars += `
      <rect x="${bx}" y="${by}" width="${barW}" height="${h}" rx="4" fill="var(--accent)" opacity="0.8" />
      <text x="${bx + barW / 2}" y="${by - 4}" text-anchor="middle" fill="var(--text-secondary)" font-size="11">${b.count}</text>
      <text x="${bx + barW / 2}" y="${chartH + 14}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${b.bucket}</text>
    `;
  });

  // Throughput line chart
  const tp = lc.throughput;
  let throughputHtml = '';
  if (tp.length > 1) {
    const tpW = 500;
    const tpH = 140;
    const tpPad = { top: 15, right: 10, bottom: 25, left: 35 };
    const tpChartW = tpW - tpPad.left - tpPad.right;
    const tpChartH = tpH - tpPad.top - tpPad.bottom;
    const maxTp = Math.max(...tp.map((t) => t.count), 1);

    const tpX = (i: number) => tpPad.left + (i / Math.max(tp.length - 1, 1)) * tpChartW;
    const tpY = (v: number) => tpPad.top + tpChartH - (v / maxTp) * tpChartH;

    const pts = tp.map((t, i) => `${tpX(i).toFixed(1)},${tpY(t.count).toFixed(1)}`).join(' ');
    const area =
      `M${tpX(0).toFixed(1)},${tpY(0).toFixed(1)} ` +
      tp.map((t, i) => `L${tpX(i).toFixed(1)},${tpY(t.count).toFixed(1)}`).join(' ') +
      ` L${tpX(tp.length - 1).toFixed(1)},${tpY(0).toFixed(1)} Z`;

    // Grid
    let tpGrid = '';
    for (let i = 0; i <= 4; i++) {
      const yy = tpPad.top + (i / 4) * tpChartH;
      const val = Math.round(maxTp * (1 - i / 4));
      tpGrid += `<line x1="${tpPad.left}" y1="${yy}" x2="${tpW - tpPad.right}" y2="${yy}" stroke="rgba(255,255,255,0.06)" />`;
      tpGrid += `<text x="${tpPad.left - 6}" y="${yy + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${val}</text>`;
    }

    // X labels
    let tpLabels = '';
    const tpStep = Math.max(1, Math.floor(tp.length / 6));
    tp.forEach((t, i) => {
      if (i % tpStep === 0 || i === tp.length - 1) {
        tpLabels += `<text x="${tpX(i)}" y="${tpH - 3}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${t.month.slice(2)}</text>`;
      }
    });

    throughputHtml = `
      <h4 class="chart-subtitle">每月結案趨勢</h4>
      <svg viewBox="0 0 ${tpW} ${tpH}" class="throughput-svg">
        ${tpGrid}
        <path d="${area}" fill="rgba(74,222,128,0.1)" />
        <polyline points="${pts}" fill="none" stroke="var(--green-400)" stroke-width="2" />
        ${tp.map((t, i) => `<circle cx="${tpX(i).toFixed(1)}" cy="${tpY(t.count).toFixed(1)}" r="3" fill="var(--green-400)" />`).join('')}
        ${tpLabels}
      </svg>
    `;
  }

  container.innerHTML = `
    ${kpis}
    <h4 class="chart-subtitle">解決時間分佈</h4>
    <div class="histogram-scroll">
      <svg viewBox="0 0 ${svgW} ${chartH + 20}" class="histogram-svg">${histBars}</svg>
    </div>
    ${throughputHtml}
  `;
}

/* ── Milestone Progress Overview ── */
function renderMilestoneProgress(burndown: BurndownMilestone[]): void {
  const container = byId<HTMLDivElement>('milestone-progress');
  if (!burndown.length) {
    container.innerHTML = '<div class="empty-state">尚無 Milestone 資料。</div>';
    return;
  }

  // Sort: in-progress first (has open), then by due date
  const sorted = [...burndown].sort((a, b) => {
    if (a.open > 0 && b.open === 0) return -1;
    if (a.open === 0 && b.open > 0) return 1;
    return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  });

  container.innerHTML = `
    <div class="ms-progress-list">
      ${sorted
        .map((ms) => {
          const pct = ms.total > 0 ? Math.round((ms.closed / ms.total) * 100) : 0;
          const isComplete = ms.open === 0 && ms.total > 0;
          const isOverdue = ms.due_date && new Date(ms.due_date) < new Date() && !isComplete;
          const barColor = isComplete
            ? 'var(--green-400)'
            : isOverdue
              ? 'var(--red-400)'
              : 'var(--accent)';
          const statusClass = isComplete ? 'complete' : isOverdue ? 'overdue' : 'active';
          const dueText = ms.due_date ?? '-';
          return `
          <div class="ms-progress-item ${statusClass}">
            <div class="ms-progress-header">
              <span class="ms-progress-name" title="${escapeHtml(ms.milestone)}">${escapeHtml(ms.milestone)}</span>
              <span class="ms-progress-pct">${pct}%</span>
            </div>
            <div class="ms-progress-bar-track">
              <div class="ms-progress-bar-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <div class="ms-progress-meta">
              <span>${ms.closed}/${ms.total} 完成</span>
              <span>到期：${escapeHtml(dueText)}</span>
            </div>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}

function renderMilestoneProgressSafe(burndown: BurndownMilestone[]): void {
  const container = byId<HTMLDivElement>('milestone-progress');
  if (!burndown.length) {
    container.innerHTML = '<div class="empty-state">目前沒有 Milestone 進度資料。</div>';
    return;
  }

  const sorted = [...burndown].sort((left, right) => {
    if (left.open > 0 && right.open === 0) return -1;
    if (left.open === 0 && right.open > 0) return 1;
    return (left.due_date ?? '9999').localeCompare(right.due_date ?? '9999');
  });

  container.innerHTML = `
    <div class="ms-progress-list">
      ${sorted
        .map((milestone) => {
          const pct =
            milestone.total > 0 ? Math.round((milestone.closed / milestone.total) * 100) : 0;
          const isComplete = milestone.open === 0 && milestone.total > 0;
          const isOverdue = Boolean(
            milestone.due_date && new Date(milestone.due_date) < new Date() && !isComplete,
          );
          const barColor = isComplete
            ? 'var(--green-400)'
            : isOverdue
              ? 'var(--red-400)'
              : 'var(--accent)';
          const statusClass = isComplete ? 'complete' : isOverdue ? 'overdue' : 'active';
          const dueText = milestone.due_date ?? '-';

          return `
          <div class="ms-progress-item ${statusClass}">
            <div class="ms-progress-header">
              <span class="ms-progress-name" title="${escapeHtml(milestone.milestone)}">${escapeHtml(milestone.milestone)}</span>
              <span class="ms-progress-pct">${pct}%</span>
            </div>
            <div class="ms-progress-bar-track">
              <div class="ms-progress-bar-fill" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <div class="ms-progress-meta">
              <span>${milestone.closed}/${milestone.total} 已完成</span>
              <span>到期日：${escapeHtml(dueText)}</span>
            </div>
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}

/* ── PDF Export ── */
async function exportReportPdf(): Promise<void> {
  setStatus('產生 PDF 報告中...');
  try {
    const { html } = await api<{ html: string; generated_at: string }>('/api/report/html');
    const result = await window.trackerBridge.exportPdf(html);
    if (result) {
      setStatus('PDF 已匯出', 'success');
    } else {
      setStatus('取消匯出', 'idle');
    }
  } catch (err) {
    handleError(err);
  }
}

/* ══════════════════════════════════════════════
   TAB SWITCHING
   ══════════════════════════════════════════════ */
function initTabs(): void {
  const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab!;
      tabBtns.forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      document.querySelectorAll<HTMLDivElement>('.tab-content').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${tab}`);
      });

      // Lazy load data for tabs
      if (tab === 'analytics' && state.analytics) {
        const sel = byId<HTMLSelectElement>('burndown-milestone-select');
        const ms = state.analytics.burndown.find((b) => b.milestone === sel.value);
        if (ms) renderBurndownChartSafe(ms);
        renderWorkloadHeatmap(state.analytics.workload);
        renderLabelDistribution(state.analytics.label_distribution);
        renderLifecycle(state.analytics.lifecycle);
        renderMilestoneProgressSafe(state.analytics.burndown);
      }
      if (tab === 'timeline' && state.allIssues.length > 0) {
        scheduleGanttRender(state.allIssues);
      }
      if (tab === 'table' && state.allIssues.length > 0) {
        renderSpreadsheet();
      }
    });
  });
}

/* ══════════════════════════════════════════════
   API ACTIONS
   ══════════════════════════════════════════════ */
async function loadConfig(): Promise<void> {
  setStatus('讀取設定中...');
  const config = coerceConfig(await api<AppConfig>('/api/config'));
  fillConfigForm(config);
  cacheConfig(config);
  setStatus('設定已載入', 'success');
}

async function saveConfig(): Promise<void> {
  setStatus('儲存設定中...');
  const payload = readConfigForm();
  const config = coerceConfig(await api<AppConfig>('/api/config', 'POST', payload));
  fillConfigForm(config);
  cacheConfig(config);
  setStatus('設定已儲存', 'success');
}

async function loadAllIssues(): Promise<void> {
  const issues = await api<IssueItem[]>('/api/issues');
  state.allIssues = issues;
  state.mergeRequestsByIid.clear();
  state.issueLinksByIid.clear();
  state.pendingMergeRequestLoads.clear();
  state.pendingIssueLinkLoads.clear();
  populateGanttFiltersEnhanced(issues);
  populateTableFilters(issues);
  renderRecentIssues();
}

function renderDashboardData(data: DashboardResponse): void {
  renderSummary(data);
  renderNewIssues(data.weekly_new);
  renderCards('focus-progress', data.focus_progress, '本週暫無特別標記的重點推進。');
  renderCards('risk-blockers', data.risks, '目前沒有明顯風險或阻塞。');
  byId<HTMLElement>('last-sync').textContent = fmtDate(data.last_sync);
  byId<HTMLElement>('last-report').textContent = fmtDate(data.last_report);
  byId<HTMLElement>('issue-count').textContent = String(data.issue_count ?? 0);
  state.latestReportPath = data.latest_report_path;
}

async function loadDashboard(): Promise<void> {
  setStatus('刷新儀表板中...');
  const data = await api<DashboardResponse>('/api/dashboard');
  renderDashboardData(data);
  await loadAllIssues();
  await loadAnalytics();
  setStatus('儀表板已更新', 'success');
}

async function syncNow(): Promise<void> {
  setStatus('同步中…（從 GitLab 抓取，請稍候）');
  setActionButtonsEnabled(false);
  try {
    await saveConfig();
    await api('/api/fetch', 'POST', {});
    await loadDashboard();
    setStatus('同步完成', 'success');
  } finally {
    setActionButtonsEnabled(true);
  }
}

async function generateReport(): Promise<void> {
  setStatus('產生週報中...');
  await saveConfig();
  const result = await api<{ report_path: string }>('/api/report/weekly', 'POST', {});
  state.latestReportPath = result.report_path;
  await loadDashboard();
  setStatus('週報已產生', 'success');
}

async function openLatestReport(): Promise<void> {
  if (!state.latestReportPath) {
    setStatus('尚未找到週報檔案', 'warn');
    return;
  }
  await window.trackerBridge.openPath(state.latestReportPath);
}

function renderIssueDeliverySummary(issue: IssueItem): void {
  const container = byId<HTMLDivElement>('detail-delivery');
  const linkedCount = getLinkedItemCount(issue);
  const mergeRequestCount = getResolvedMergeRequestCount(issue);
  const highlight = getDeliveryHighlight(issue);
  const dueDate = startOfDay(issue.due_date);
  const isOverdue =
    issue.state !== 'closed' && !!dueDate && dueDate < (startOfDay(new Date()) as Date);
  const cards = [
    { kind: highlight.kind, label: highlight.label, value: highlight.value },
    { kind: 'review', label: '相關 MRs', value: String(mergeRequestCount) },
    { kind: 'ready', label: '相關 Issues', value: String(linkedCount) },
  ];
  const primaryStatusLabel =
    issue.state === 'closed'
      ? '已關閉'
      : isOverdue
        ? '逾期'
        : mergeRequestCount > 0
          ? '進行中'
          : '開啟中';
  const primaryStatusClass =
    issue.state === 'closed'
      ? 'closed'
      : isOverdue
        ? 'overdue'
        : mergeRequestCount > 0
          ? 'review'
          : 'open';
  const chips = [
    `<span class="detail-chip ${primaryStatusClass}">${primaryStatusLabel}</span>`,
    mergeRequestCount > 0 ? `<span class="detail-chip review">MR ${mergeRequestCount}</span>` : '',
    linkedCount > 0 ? `<span class="detail-chip related">Linked ${linkedCount}</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  container.innerHTML = `
    <div class="detail-delivery-grid">
      ${cards
        .map(
          (card) => `
        <div class="detail-delivery-card ${card.kind}">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
        </div>
      `,
        )
        .join('')}
    </div>
    ${chips ? `<div class="detail-delivery-progress"><div class="detail-chip-row">${chips}</div></div>` : ''}
  `;
}

function renderMergeRequests(target: HTMLDivElement, mergeRequests: MergeRequestInfo[]): void {
  if (!mergeRequests.length) {
    target.innerHTML = '<div class="empty-state">這張 Issue 目前沒有 linked MR。</div>';
    return;
  }
  target.innerHTML = mergeRequests
    .map(
      (mr) => `
    <div class="mr-card">
      <div class="mr-card-header">
        <div class="mr-card-title">
          <span class="state-badge ${escapeHtml(mr.state || 'opened')}">${escapeHtml(mr.state || 'opened')}</span>
          <a href="${escapeHtml(mr.web_url || '#')}" target="_blank" rel="noreferrer">!${mr.iid} ${escapeHtml(mr.title)}</a>
          ${mr.draft ? '<span class="detail-chip blocked">Draft</span>' : ''}
        </div>
      </div>
      <div class="mr-card-meta">
        <span>Author: ${escapeHtml(mr.author_name || '-')}</span>
        <span>Updated: ${escapeHtml(fmtDate(mr.updated_at))}</span>
        <span>Pipeline: ${escapeHtml(mr.head_pipeline_status || '-')}</span>
        <span>${escapeHtml(mr.source_branch || '-')} → ${escapeHtml(mr.target_branch || '-')}</span>
      </div>
    </div>
  `,
    )
    .join('');
}

function renderLinkedItems(target: HTMLDivElement, links: LinkedItemInfo[]): void {
  if (!links.length) {
    target.innerHTML = '<div class="empty-state">這張 Issue 目前沒有 linked items。</div>';
    return;
  }
  target.innerHTML = links
    .map(
      (link) => `
    <div class="linked-item-card">
      <div class="linked-item-header">
        <div class="linked-item-title">
          <span class="detail-chip ${link.link_type === 'blocks' || link.link_type === 'is_blocked_by' ? 'blocked' : 'related'}">${escapeHtml(getIssueLinkTypeLabel(link.link_type, link.direction))}</span>
          <a href="${escapeHtml(link.issue.web_url || '#')}" target="_blank" rel="noreferrer">${link.issue.iid ? `#${link.issue.iid}` : 'Linked Issue'} ${escapeHtml(link.issue.title || '')}</a>
        </div>
        <span class="state-badge ${escapeHtml(link.issue.state || 'opened')}">${escapeHtml(link.issue.state || 'opened')}</span>
      </div>
      <div class="linked-item-meta">
        <span>Assignee: ${escapeHtml((link.issue.assignees || []).join(', ') || '-')}</span>
        <span>Milestone: ${escapeHtml(link.issue.milestone || '-')}</span>
        <span>Due: ${escapeHtml(fmtDate(link.issue.due_date))}</span>
      </div>
    </div>
  `,
    )
    .join('');
}

async function loadIssueRelations(issue: IssueItem): Promise<void> {
  const mergeTarget = byId<HTMLDivElement>('detail-merge-requests');
  const linksTarget = byId<HTMLDivElement>('detail-linked-items');
  mergeTarget.innerHTML = '<div class="empty-state">載入 linked MR 中...</div>';
  linksTarget.innerHTML = '<div class="empty-state">載入 linked items 中...</div>';

  const mergeRequestsPromise = state.mergeRequestsByIid.has(issue.iid)
    ? Promise.resolve(state.mergeRequestsByIid.get(issue.iid) || [])
    : api<MergeRequestInfo[]>(`/api/issues/${issue.iid}/merge-requests`);
  const linksPromise = state.issueLinksByIid.has(issue.iid)
    ? Promise.resolve(state.issueLinksByIid.get(issue.iid) || [])
    : api<LinkedItemInfo[]>(`/api/issues/${issue.iid}/links`);

  const [mergeResult, linkResult] = await Promise.allSettled([mergeRequestsPromise, linksPromise]);

  if (mergeResult.status === 'fulfilled') {
    state.mergeRequestsByIid.set(issue.iid, mergeResult.value);
    renderMergeRequests(mergeTarget, mergeResult.value);
  } else {
    mergeTarget.innerHTML = '<div class="empty-state">Linked MR 資訊載入失敗。</div>';
  }

  if (linkResult.status === 'fulfilled') {
    state.issueLinksByIid.set(issue.iid, linkResult.value);
    renderLinkedItems(linksTarget, linkResult.value);
    scheduleGanttRender(state.allIssues);
  } else {
    linksTarget.innerHTML = '<div class="empty-state">Linked items 資訊載入失敗。</div>';
  }

  renderIssueDeliverySummary(issue);
}

function requestIssueLinkDataForVisibleIssues(issues: IssueItem[]): void {
  const issuesForLinks = issues
    .filter(
      (issue) =>
        !state.issueLinksByIid.has(issue.iid) && !state.pendingIssueLinkLoads.has(issue.iid),
    )
    .slice(0, 24);
  const issuesForMergeRequests = issues
    .filter(
      (issue) =>
        !state.mergeRequestsByIid.has(issue.iid) && !state.pendingMergeRequestLoads.has(issue.iid),
    )
    .slice(0, 24);

  if (!issuesForLinks.length && !issuesForMergeRequests.length) return;

  issuesForLinks.forEach((issue) => state.pendingIssueLinkLoads.add(issue.iid));
  issuesForMergeRequests.forEach((issue) => state.pendingMergeRequestLoads.add(issue.iid));

  const requests: Promise<unknown>[] = [];

  if (issuesForLinks.length) {
    requests.push(
      Promise.allSettled(
        issuesForLinks.map(async (issue) => {
          try {
            const links = await api<LinkedItemInfo[]>(`/api/issues/${issue.iid}/links`);
            state.issueLinksByIid.set(issue.iid, links);
          } catch {
            state.issueLinksByIid.set(issue.iid, []);
          } finally {
            state.pendingIssueLinkLoads.delete(issue.iid);
          }
        }),
      ),
    );
  }

  if (issuesForMergeRequests.length) {
    requests.push(
      Promise.allSettled(
        issuesForMergeRequests.map(async (issue) => {
          try {
            const mergeRequests = await api<MergeRequestInfo[]>(
              `/api/issues/${issue.iid}/merge-requests`,
            );
            state.mergeRequestsByIid.set(issue.iid, mergeRequests);
          } catch {
            state.mergeRequestsByIid.set(issue.iid, []);
          } finally {
            state.pendingMergeRequestLoads.delete(issue.iid);
          }
        }),
      ),
    );
  }

  void Promise.allSettled(requests).then(() => scheduleGanttRender(state.allIssues));
}

/* ══════════════════════════════════════════════
   ISSUE DETAIL PANEL
   ══════════════════════════════════════════════ */
function openIssueDetail(issue: IssueItem): void {
  const overlay = byId<HTMLDivElement>('issue-detail-overlay');
  byId<HTMLElement>('detail-iid').textContent = `#${issue.iid}`;

  const stateBadge = byId<HTMLElement>('detail-state');
  stateBadge.textContent = issue.state === 'opened' ? '開啟中' : '已關閉';
  stateBadge.className = `state-badge ${issue.state}`;

  byId<HTMLElement>('detail-title').textContent = issue.title;
  byId<HTMLElement>('detail-assignees').textContent = (issue.assignees || []).join(', ') || '-';
  byId<HTMLElement>('detail-milestone').textContent = issue.milestone ?? '-';
  byId<HTMLElement>('detail-module').textContent = issue.module ?? '-';
  byId<HTMLElement>('detail-created').textContent = fmtDate(issue.created_at);
  byId<HTMLElement>('detail-updated').textContent = fmtDate(issue.updated_at);
  byId<HTMLElement>('detail-due').textContent = issue.due_date ? fmtDate(issue.due_date) : '-';

  const labelsDiv = byId<HTMLDivElement>('detail-labels');
  labelsDiv.innerHTML = (issue.labels || [])
    .map((l) => `<span class="tag">${escapeHtml(l)}</span>`)
    .join('');
  renderIssueDeliverySummary(issue);

  const link = byId<HTMLAnchorElement>('detail-link');
  if (issue.web_url) {
    link.href = issue.web_url;
    link.style.display = '';
  } else {
    link.style.display = 'none';
  }

  const discussionsDiv = byId<HTMLDivElement>('detail-discussions');
  discussionsDiv.innerHTML = '<div class="empty-state">載入討論中...</div>';

  overlay.classList.add('open');
  document.body.classList.add('detail-open');
  document.body.style.overflow = 'hidden';

  // Fetch discussions
  loadDiscussions(issue.iid, discussionsDiv);
  void loadIssueRelations(issue);

  // Wire AI summary button
  const summaryBtn = byId<HTMLButtonElement>('btn-ai-summary');
  const summaryBox = byId<HTMLDivElement>('ai-summary-box');
  summaryBox.style.display = 'none';
  summaryBox.innerHTML = '';
  const newBtn = summaryBtn.cloneNode(true) as HTMLButtonElement;
  summaryBtn.replaceWith(newBtn);
  newBtn.addEventListener('click', () => loadAISummary(issue.iid, newBtn, summaryBox));
}

function closeIssueDetail(): void {
  const overlay = byId<HTMLDivElement>('issue-detail-overlay');
  overlay.classList.remove('open');
  document.body.classList.remove('detail-open');
  document.body.style.overflow = '';
}

async function loadAISummary(
  iid: number,
  btn: HTMLButtonElement,
  box: HTMLDivElement,
): Promise<void> {
  btn.disabled = true;
  btn.textContent = '⏳ 摘要產生中...';
  box.style.display = 'block';
  box.innerHTML = '<div class="ai-summary-loading">正在呼叫 Gemini AI 產生摘要，請稍候...</div>';
  try {
    const result = await api<{ summary: string }>(`/api/issues/${iid}/discussions/summary`, 'POST');
    box.innerHTML = `<div class="ai-summary-content">${formatSummaryMarkdown(result.summary)}</div>`;
  } catch (err: any) {
    const msg = err?.message || '未知錯誤';
    box.innerHTML = `<div class="ai-summary-error">摘要產生失敗：${escapeHtml(msg)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ AI 摘要';
  }
}

function formatSummaryMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li><strong>$1.</strong> $2</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

async function loadDiscussions(iid: number, container: HTMLDivElement): Promise<void> {
  try {
    const discussions = await api<Discussion[]>(`/api/issues/${iid}/discussions`);
    const nonEmpty = discussions.filter((d) => d.notes.length > 0);
    if (!nonEmpty.length) {
      container.innerHTML = '<div class="empty-state">此 Issue 尚無討論留言。</div>';
      return;
    }
    container.innerHTML = nonEmpty
      .map((disc) => {
        const isThread = disc.notes.length > 1;
        return `
        <div class="discussion-thread ${isThread ? 'has-replies' : ''}">
          ${disc.notes
            .map(
              (note, idx) => `
            <div class="discussion-note ${idx > 0 ? 'reply' : 'root'}">
              <div class="note-avatar" title="${escapeHtml(note.author_name)}">
                ${
                  note.author_avatar_url
                    ? `<img src="${escapeHtml(note.author_avatar_url)}" alt="" />`
                    : `<span>${escapeHtml(note.author_name.charAt(0).toUpperCase())}</span>`
                }
              </div>
              <div class="note-content">
                <div class="note-header">
                  <strong class="note-author">${escapeHtml(note.author_name)}</strong>
                  <span class="note-username">@${escapeHtml(note.author_username)}</span>
                  <time class="note-time">${fmtDate(note.created_at)}</time>
                </div>
                <div class="note-body">${escapeHtml(note.body)}</div>
              </div>
            </div>
          `,
            )
            .join('')}
        </div>
      `;
      })
      .join('');
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('401') || msg.includes('invalid_token') || msg.includes('revoked')) {
      container.innerHTML =
        '<div class="empty-state">Token 已失效或被撤銷，請重新產生 Personal Access Token。</div>';
    } else {
      container.innerHTML =
        '<div class="empty-state">無法載入討論（請確認 GitLab 連線設定）。</div>';
    }
  }
}

/* ══════════════════════════════════════════════
   COLUMN RESIZE
   ══════════════════════════════════════════════ */
function initColumnResize(): void {
  const table = document.querySelector('.spreadsheet-wrap table') as HTMLTableElement | null;
  if (!table) return;

  const ths = table.querySelectorAll<HTMLTableCellElement>('thead th');
  ths.forEach((th) => {
    // Skip row-number header
    if (th.classList.contains('row-num-header')) return;

    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    th.appendChild(handle);

    let startX = 0;
    let startW = 0;

    const onMouseMove = (e: MouseEvent) => {
      const newW = Math.max(40, startW + (e.clientX - startX));
      th.style.width = newW + 'px';
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startW = th.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

/* ══════════════════════════════════════════════
   AI CHAT PANEL
   ══════════════════════════════════════════════ */
const chatHistory: { role: string; content: string }[] = [];

function initChat(): void {
  const fab = document.getElementById('chat-fab');
  const panel = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const clearBtn = document.getElementById('chat-clear');
  const input = document.getElementById('chat-input') as HTMLInputElement | null;
  const sendBtn = document.getElementById('chat-send');

  if (!fab || !panel || !closeBtn || !input || !sendBtn || !clearBtn) return;

  fab.addEventListener('click', () => {
    panel.classList.add('open');
    fab.classList.add('hidden');
    input.focus();
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    fab.classList.remove('hidden');
  });

  clearBtn.addEventListener('click', () => {
    chatHistory.length = 0;
    const msgs = document.getElementById('chat-messages');
    if (msgs) {
      msgs.innerHTML = `
        <div class="chat-msg assistant">
          <div class="chat-msg-content">對話已清除。有什麼想問的嗎？
            <div class="chat-suggestions">
              <button class="chat-suggestion-btn">這週最危險的是什麼？</button>
              <button class="chat-suggestion-btn">誰的 issue 最久沒動？</button>
              <button class="chat-suggestion-btn">目前逾期的 issue 有哪些？</button>
              <button class="chat-suggestion-btn">各模組負責人的工作量？</button>
            </div>
          </div>
        </div>`;
      wireSuggestionBtns(msgs);
    }
  });

  sendBtn.addEventListener('click', () => sendChatMessage(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(input);
    }
  });

  // Wire suggestion buttons
  const msgs = document.getElementById('chat-messages');
  if (msgs) wireSuggestionBtns(msgs);
}

function wireSuggestionBtns(container: HTMLElement): void {
  container.querySelectorAll('.chat-suggestion-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('chat-input') as HTMLInputElement;
      if (input) {
        input.value = btn.textContent || '';
        sendChatMessage(input);
      }
    });
  });
}

async function sendChatMessage(input: HTMLInputElement): Promise<void> {
  const question = input.value.trim();
  if (!question) return;

  const msgs = document.getElementById('chat-messages');
  const sendBtn = document.getElementById('chat-send') as HTMLButtonElement | null;
  if (!msgs || !sendBtn) return;

  // Add user message
  input.value = '';
  sendBtn.disabled = true;
  chatHistory.push({ role: 'user', content: question });
  appendChatMsg(msgs, 'user', escapeHtml(question));

  // Show typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg assistant';
  typingEl.innerHTML = `
    <div class="chat-typing">
      <span class="chat-typing-dot"></span>
      <span class="chat-typing-dot"></span>
      <span class="chat-typing-dot"></span>
    </div>`;
  msgs.appendChild(typingEl);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const result = await api<{ answer: string; model: string }>('/api/chat', 'POST', {
      question,
      history: chatHistory.slice(0, -1), // exclude current question (already in endpoint)
    });
    chatHistory.push({ role: 'assistant', content: result.answer });
    typingEl.remove();
    appendChatMsg(msgs, 'assistant', formatChatAnswer(result.answer), result.model);
  } catch (err: any) {
    typingEl.remove();
    const errMsg = err?.message || '未知錯誤';
    appendChatMsg(
      msgs,
      'assistant',
      `<span style="color:var(--red-400)">發生錯誤：${escapeHtml(errMsg)}</span>`,
    );
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function appendChatMsg(container: HTMLElement, role: string, html: string, model?: string): void {
  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;
  const metaHtml = model ? `<div class="chat-msg-meta">${escapeHtml(model)}</div>` : '';
  el.innerHTML = `<div class="chat-msg-content">${html}</div>${metaHtml}`;

  // Wire issue ref clicks
  el.querySelectorAll('.issue-ref').forEach((ref) => {
    ref.addEventListener('click', () => {
      const iid = Number((ref as HTMLElement).dataset.iid);
      const issue = state.allIssues.find((i) => i.iid === iid);
      if (issue) openIssueDetail(issue);
    });
  });

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function formatChatAnswer(text: string): string {
  // Convert markdown to HTML
  let html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li><strong>$1.</strong> $2</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  // Convert #123 issue references to clickable links
  html = html.replace(/#(\d+)/g, (_match, iid) => {
    const issue = state.allIssues.find((i) => i.iid === Number(iid));
    if (issue) {
      return `<button type="button" class="issue-ref" data-iid="${iid}" title="查看 ${escapeHtml(issue.title)}">#${iid}</button>`;
    }
    return `#${iid}`;
  });

  return html;
}

/* ══════════════════════════════════════════════
   EVENT WIRING
   ══════════════════════════════════════════════ */
function wireEvents(): void {
  enhanceTimelineControls();
  syncTimelineRangeControls();
  initChat();

  const bind = <T extends HTMLElement>(
    id: string,
    eventName: string,
    listener: EventListenerOrEventListenerObject,
  ): T | null => {
    const element = getById<T>(id);
    if (!element) {
      console.warn(`Missing element during event binding: ${id}`);
      return null;
    }
    element.addEventListener(eventName, listener);
    return element;
  };

  // Keep tab switching available even if a later optional control is missing.
  initTabs();

  // Sidebar toggle
  bind<HTMLButtonElement>('sidebar-toggle', 'click', () => {
    const shell = document.querySelector('.app-shell')!;
    shell.classList.toggle('sidebar-collapsed');
  });

  // Sidebar config buttons
  document.getElementById('btn-pick-file')?.addEventListener('click', async () => {
    const filePath = await window.trackerBridge.openFileDialog();
    const imp = document.getElementById('import-file') as HTMLInputElement | null;
    if (filePath && imp) imp.value = filePath;
  });

  // Token hint link – open GitLab personal access tokens page
  document.getElementById('token-hint-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const base = byId<HTMLInputElement>('gitlab-url').value.replace(/\/+$/, '');
    if (base) {
      window.trackerBridge.openPath(`${base}/-/user_settings/personal_access_tokens`);
    }
  });

  // Gemini hint link – open Google AI Studio
  document.getElementById('gemini-hint-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.trackerBridge.openPath('https://aistudio.google.com/apikey');
  });

  bind<HTMLButtonElement>('btn-load-config', 'click', () => loadConfig().catch(handleError));
  bind<HTMLButtonElement>('btn-save-config', 'click', () => saveConfig().catch(handleError));
  bind<HTMLButtonElement>('btn-sync-now', 'click', () => syncNow().catch(handleError));
  bind<HTMLButtonElement>('btn-refresh-dashboard', 'click', () => syncNow().catch(handleError));
  bind<HTMLButtonElement>('btn-generate-report', 'click', () =>
    generateReport().catch(handleError),
  );
  bind<HTMLButtonElement>('btn-open-report', 'click', () => openLatestReport().catch(handleError));
  bind<HTMLButtonElement>('btn-export-pdf', 'click', () => exportReportPdf().catch(handleError));

  // Recent hours input
  bind<HTMLInputElement>('recent-hours', 'change', () => renderRecentIssues());

  // Burndown milestone selector
  bind<HTMLSelectElement>('burndown-milestone-select', 'change', () => {
    if (!state.analytics) return;
    const ms = state.analytics.burndown.find(
      (b) => b.milestone === byId<HTMLSelectElement>('burndown-milestone-select').value,
    );
    if (ms) renderBurndownChartSafe(ms);
  });

  // Gantt filters
  bind<HTMLSelectElement>('gantt-quick-view', 'change', () => scheduleGanttRender(state.allIssues));
  bind<HTMLSelectElement>('gantt-group-by', 'change', () => scheduleGanttRender(state.allIssues));
  bind<HTMLSelectElement>('gantt-milestone-filter', 'change', () =>
    scheduleGanttRender(state.allIssues),
  );
  bind<HTMLSelectElement>('gantt-assignee-filter', 'change', () =>
    scheduleGanttRender(state.allIssues),
  );
  bind<HTMLSelectElement>('gantt-state-filter', 'change', () =>
    scheduleGanttRender(state.allIssues),
  );
  bind<HTMLSelectElement>('gantt-range-mode', 'change', () => {
    syncTimelineRangeControls();
    scheduleGanttRender(state.allIssues);
  });
  bind<HTMLInputElement>('gantt-month', 'change', () => {
    state.ganttMonth = byId<HTMLInputElement>('gantt-month').value;
    scheduleGanttRender(state.allIssues);
  });
  bind<HTMLInputElement>('gantt-week', 'change', () => {
    state.ganttWeek = byId<HTMLInputElement>('gantt-week').value;
    scheduleGanttRender(state.allIssues);
  });
  bind<HTMLButtonElement>('gantt-month-prev', 'click', () => shiftMonth(-1));
  bind<HTMLButtonElement>('gantt-month-next', 'click', () => shiftMonth(1));
  bind<HTMLSelectElement>('gantt-view-mode', 'change', () => {
    state.timelineViewMode = byId<HTMLSelectElement>('gantt-view-mode').value as TimelineViewMode;
    scheduleGanttRender(state.allIssues);
  });

  // Table filters & search
  let searchTimer: number | undefined;
  bind<HTMLInputElement>('table-search', 'input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => renderSpreadsheet(), 200);
  });
  bind<HTMLSelectElement>('table-state-filter', 'change', () => renderSpreadsheet());
  bind<HTMLSelectElement>('table-milestone-filter', 'change', () => renderSpreadsheet());
  bind<HTMLSelectElement>('table-label-filter', 'change', () => renderSpreadsheet());
  bind<HTMLInputElement>('table-date-start', 'change', () => renderSpreadsheet());
  bind<HTMLInputElement>('table-date-end', 'change', () => renderSpreadsheet());

  // Sort headers
  document.querySelectorAll('.spreadsheet-wrap th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = (th as HTMLElement).dataset.sort!;
      if (state.tableSort.key === key) {
        state.tableSort.asc = !state.tableSort.asc;
      } else {
        state.tableSort.key = key;
        state.tableSort.asc = true;
      }
      renderSpreadsheet();
    });
  });

  // Column resize handles
  initColumnResize();

  // Close detail panel
  bind<HTMLButtonElement>('detail-close', 'click', closeIssueDetail);
  bind<HTMLDivElement>('issue-detail-overlay', 'click', (e) => {
    if (e.target === e.currentTarget) closeIssueDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeIssueDetail();
  });

  // Clickable issue cards → open detail panel
  document.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest(
      '.issue-card[data-iid], .alert-item[data-iid]',
    ) as HTMLElement | null;
    if (card && card.dataset.iid && !(e.target as HTMLElement).closest('a')) {
      const iid = Number(card.dataset.iid);
      const issue = state.allIssues.find((i) => i.iid === iid);
      if (issue) openIssueDetail(issue);
    }
  });

  // Clickable table rows → open detail panel (any table with data-iid rows)
  document.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('tr[data-iid]') as HTMLElement | null;
    if (row && row.dataset.iid && !(e.target as HTMLElement).closest('a')) {
      const iid = Number(row.dataset.iid);
      const issue = state.allIssues.find((i) => i.iid === iid);
      if (issue) openIssueDetail(issue);
    }
  });
}

function handleError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  setStatus(message, 'error');
}

/* ══════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════ */
async function boot(): Promise<void> {
  await applyAppVersionLabel();
  const cachedConfig = readCachedConfig();
  if (cachedConfig) {
    fillConfigForm(cachedConfig);
  }
  wireEvents();
  try {
    await loadConfig();
  } catch (error) {
    if (!cachedConfig) throw error;
    console.warn('Falling back to cached config after loadConfig failure', error);
    setStatus('設定讀取失敗，已先載入上次快取', 'warn');
  }
  await loadDashboard();
}

boot().catch(handleError);

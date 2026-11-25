(() => {
  const ACTIVE_DELAY = 2000;
  const IDLE_DELAYS = [5000, 10000, 20000, 40000, 60000];

  function nextDelay(operations, idle, syncing, now = Date.now()) {
    if (syncing || operations.some(row => !row.paused && row.status === 'running' &&
        now - Date.parse(row.updatedAt) < 120000)) return { delay: ACTIVE_DELAY, idle: 0 };
    const nextIdle = Math.min(idle + 1, IDLE_DELAYS.length - 1);
    const retry = Math.min(...operations.filter(row => !row.paused && row.nextRetryAt)
      .map(row => Date.parse(row.nextRetryAt)).filter(time => time > now));
    return { delay: Math.max(ACTIVE_DELAY, Math.min(IDLE_DELAYS[idle], retry - now)), idle: nextIdle };
  }

  function mount({ card, el, button, actions }) {
    const { t, statusLabel, featureLabel } = DucoroI18n;
    const root = card('diagnostics', t('任务中心'));
    const box = el('div');
    const filter = el('select');
    DucoroI18n.setAttribute(filter, 'aria-label', t('筛选任务'));
    for (const [value, label] of [['pending', '待处理'], ['attention', '需要处理'], ['all', '全部']]) {
      const option = el('option', t(label));
      option.value = value;
      filter.append(option);
    }
    const failureLabels = { temporary: '临时故障', permission: '权限不足', conflict: '配置冲突', unsupported: '不支持此操作', corrupt: '数据损坏', unknown: '结果待核实' };
    const stale = el('p');
    stale.className = 'notice error';
    stale.hidden = true;
    root.append(stale);
    let timer, flight, signature, lastSuccess, cached, queued = false;
    let idle = 0, reportKey, burstUntil = 0;

    function render(result) {
      const nextSignature = JSON.stringify([filter.value, result]);
      if (signature === nextSignature) return;
      signature = nextSignature;
      const oldRows = new Map([...box.querySelectorAll('[data-task-id]')].map(node => [node.dataset.taskId, node]));
      const focused = document.activeElement;
      const activeId = focused?.closest('[data-task-id]')?.dataset.taskId;
      box.replaceChildren(el('p', t`全部：${result.summary.total} · 已完成：${result.summary.completed} · 失败：${result.summary.failed}`));
      const rows = result.operations.filter(row => filter.value === 'all' ||
        (filter.value === 'attention' ? row.needsAttention : row.status !== 'completed' || row.paused));
      rows.sort((a, b) => Number(b.needsAttention || b.paused) - Number(a.needsAttention || a.paused));
      if (!rows.length) {
        const empty = { all: '暂无任务记录。', attention: '暂无需要处理的任务。', pending: '暂无待处理任务。' };
        box.append(el('p', t(empty[filter.value])));
      }
      for (const row of rows) {
        const item = el('section');
        item.className = 'task-row';
        item.dataset.taskId = row.id;
        const feature = { gateway: 'models', accounts: 'accountConnectors', total: 'instructions' }[row.feature] ?? row.feature;
        item.append(
          el('p', t`${featureLabel(feature)} · ${row.target} / ${row.resource} · ${row.paused ? t('已暂停') : statusLabel(row.status)}`),
          el('p', t`尝试次数：${row.attempts} · 更新时间：${DucoroI18n.dateTime(row.updatedAt)}`),
        );
        if (row.failureClass) item.append(el('p', t(failureLabels[row.failureClass])));
        if (row.advice) item.append(el('p', t(row.advice)));
        if (row.nextRetryAt && !row.paused) item.append(el('p', t`最早自动重试：${DucoroI18n.dateTime(row.nextRetryAt)}`));
        if (row.status !== 'completed') {
          const controls = [[t('重试此项'), 'retry'], [row.paused ? t('恢复此项') : t('暂停此项'), row.paused ? 'resume' : 'pause']];
          item.append(actions(...controls.map(([label, action]) => button(label, async () => {
            await ducoroApi('operations', { id: row.id, action });
            if (action !== 'pause') burstUntil = Date.now() + 15000;
            await refresh(true);
          }))));
        }
        const old = oldRows.get(row.id);
        if (old && old.textContent !== item.textContent) {
          if (activeId === row.id) signature = null;
          else old.replaceChildren(...item.childNodes);
        }
        box.append(old ?? item);
      }
      if (focused?.isConnected && activeId) focused.focus({ preventScroll: true });
    }

    const visible = () => !document.hidden && !document.getElementById('diagnostics').hidden;
    function schedule() {
      clearTimeout(timer);
      if (!visible()) return;
      const timing = nextDelay(cached?.operations ?? [], idle, Date.now() < burstUntil);
      idle = timing.idle;
      timer = setTimeout(() => void refresh(), timing.delay);
    }
    async function read() {
      try {
        cached = await ducoroApi('operations');
        stale.hidden = true;
        lastSuccess = Date.now();
        render(cached);
      } catch (error) {
        stale.hidden = false;
        DucoroI18n.setText(stale, t`更新失败，最后读取于 ${lastSuccess ? DucoroI18n.dateTime(lastSuccess) : t('尚无成功记录')}。${t(error.localizedMessage ?? error.message)}；请刷新任务重试。`);
      }
    }
    async function refresh(immediate = false) {
      if (!visible()) return;
      clearTimeout(timer);
      if (immediate) idle = 0;
      if (flight) {
        queued ||= immediate;
        return flight;
      }
      flight = (async () => {
        do {
          queued = false;
          await read();
        } while (queued && visible());
      })();
      try { await flight; } finally { flight = null; schedule(); }
    }
    const visibilityChanged = () => visible() ? void refresh(true) : clearTimeout(timer);
    filter.onchange = () => { if (cached) render(cached); };
    root.append(actions(button(t('刷新任务'), () => refresh(true)), filter), box);
    document.addEventListener('visibilitychange', visibilityChanged);
    document.addEventListener('ducoro-tab', visibilityChanged);
    document.addEventListener('ducoro-operation-queued', () => {
      burstUntil = Date.now() + 15000;
      if (visible()) void refresh(true);
    });
    document.addEventListener('ducoro-report', event => {
      const report = event.detail;
      const key = JSON.stringify([report?.lastSyncedAt, report?.syncing, report?.status]);
      if (key === reportKey) return;
      reportKey = key;
      if (report?.syncing) burstUntil = Date.now() + 30000;
      if (visible()) void refresh(true);
    });
    if (visible()) void refresh(true);
  }
  globalThis.DucoroTaskCenter = { mount, nextDelay };
})();

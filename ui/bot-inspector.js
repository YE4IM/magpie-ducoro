(async () => {
  await DucoroUIReady;
  const { t, setText, setAttribute, dateTime, featureLabel, joinMessages } = DucoroI18n;
  const root = document.getElementById('resources');
  const { make: el } = globalThis.DucoroComponents;
  const button = (label, action) => {
    const node = el('button', t(label));
    node.type = 'button';
    node.className = 'secondary';
    node.onclick = action;
    return node;
  };
  const select = label => {
    const node = el('select');
    setAttribute(node, 'aria-label', t(label));
    return node;
  };
  function options(input, items, fallback = '') {
    const value = input.value;
    input.replaceChildren(...items.map(([id, label]) => {
      const node = el('option', label);
      node.value = id;
      return node;
    }));
    input.value = items.some(([id]) => id === value) ? value : fallback;
  }
  const controls = (...items) => {
    const row = el('div');
    row.className = 'button-group inspector-controls';
    row.append(...items);
    return row;
  };
  const status = () => {
    const node = el('p');
    node.setAttribute('role', 'status');
    return node;
  };
  const card = label => {
    const node = el('details');
    node.className = 'card bot-inspector';
    node.append(el('summary', t(label)));
    root.append(node);
    return node;
  };
  const origin = value => value?.type === 'plan'
    ? value.trial ? t`试用方案「${value.plan}」` : t`继承方案「${value.plan}」`
    : value?.type === 'override' ? t('Bot 单项覆盖') : t('全局设置');
  const readback = evidence => t(({ verified: '已核验一致', failed: '读回不一致', skipped: '已跳过' })[evidence?.verified] ?? '待核实');
  const runtime = evidence => evidence?.runtimeLoaded === 'confirmed' ? t('已确认') : t('待核实');
  const errorText = error => t(error.localizedMessage ?? error.message);
  const jump = (id, kind) => button('前往设置', () => DucoroResources.focusBot(id, undefined, kind));
  let reading;

  function readInspection() {
    reading ??= ducoroApi('bot-inspection').finally(() => { reading = null; });
    return reading;
  }
  async function verify() {
    const result = await DucoroVerificationTracker.track({ api: ducoroApi, onUpdate() {} });
    if (result.error) throw DucoroI18n.error(result.errorMessage ?? result.error);
    return result;
  }

  const reverse = card('按资源反查 Bot');
  const kindPicker = select('资源类型');
  options(kindPicker, [['skills', t('技能')], ['mcp', t('资源库连接器')]], 'skills');
  const resourcePicker = select('资源库资源');
  const sourcePicker = select('分配来源');
  options(sourcePicker, [['all', t('全部来源')], ['global', t('全局设置')], ['plan', t('继承方案')], ['override', t('Bot 单项覆盖')]], 'all');
  const botSearch = el('input');
  botSearch.type = 'search';
  setAttribute(botSearch, 'aria-label', t('按名称或 ID 筛选 Bot'));
  setAttribute(botSearch, 'placeholder', t('筛选 Bot'));
  const reverseInfo = status(), matches = el('ul');
  let inspection, reverseBusy = false;
  function renderMatches() {
    const name = resourcePicker.value;
    const query = botSearch.value.trim().toLowerCase();
    const rows = [];
    for (const bot of inspection?.bots ?? []) {
      const entry = bot.resources?.[kindPicker.value].find(item => item.name === name);
      if (!entry || sourcePicker.value !== 'all' && entry.source.type !== sourcePicker.value ||
          !`${bot.name} ${bot.id}`.toLowerCase().includes(query)) continue;
      const line = el('li');
      line.append(el('strong', t`${bot.name} · ${bot.id}`),
        el('p', t`${origin(entry.source)} · 读回：${entry.status === 'unknown' ? t('资源定义待核实') : readback(entry.evidence)} · 会话加载：${runtime(entry.evidence)}`),
        jump(bot.id, kindPicker.value));
      rows.push(line);
    }
    matches.replaceChildren(...rows);
    if (!inspection || reverseBusy) return;
    const time = inspection.evidenceAt ? t`最近核验 ${dateTime(inspection.evidenceAt)}` : t('暂无本轮核验记录');
    setText(reverseInfo, !inspection.assignmentsKnown ? t('暂时无法确认分配范围，请刷新资源和同步设置。') :
      !name ? t('该类型暂无可选资源。') : t`匹配 ${rows.length} 个 Bot · ${time}`);
  }
  function updateResourcePicker() {
    const names = [...new Set(inspection?.resources?.[kindPicker.value] ?? [])].sort((a, b) => a.localeCompare(b, document.documentElement.lang));
    options(resourcePicker, names.map(name => [name, name]), names[0]);
    renderMatches();
  }
  async function loadReverse(withVerification = false) {
    if (reverseBusy) return;
    reverseBusy = true;
    setText(reverseInfo, t(withVerification ? '正在读回核验配置…' : '正在读取资源分配…'));
    try {
      if (withVerification) await verify();
      inspection = await readInspection();
      reverseBusy = false;
      updateResourcePicker();
    } catch (error) {
      inspection = null;
      updateResourcePicker();
      setText(reverseInfo, errorText(error));
    } finally { reverseBusy = false; }
  }
  kindPicker.onchange = updateResourcePicker;
  document.addEventListener('ducoro-language', () => {
    if (inspection && !reverseBusy) updateResourcePicker();
  });
  resourcePicker.onchange = sourcePicker.onchange = botSearch.oninput = renderMatches;
  reverse.addEventListener('toggle', () => { if (reverse.open && !inspection) void loadReverse(); });
  reverse.append(controls(kindPicker, resourcePicker, sourcePicker, botSearch),
    controls(button('刷新资源分配', () => loadReverse()), button('重新读取并核验', () => loadReverse(true))), reverseInfo, matches);

  const compare = card('对比两个 Bot');
  const leftPick = select('第一个 Bot'), rightPick = select('第二个 Bot');
  const compareInfo = status(), output = el('div');
  let comparing = false;
  function updateBotChoices() {
    const list = DucoroResources.bots.map(bot => [bot.id, t`${bot.name} · ${bot.id}`]);
    options(leftPick, list, list[0]?.[0]);
    options(rightPick, list, list[1]?.[0]);
  }
  function compareRows(left, right, equipment, known) {
    const rows = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const stages = evidence => [evidence?.verified ?? 'unknown', evidence?.runtimeLoaded ?? 'unknown'];
    const modelInfo = bot => [bot.runtime, bot.connectionSlug, bot.model, bot.expectedModel, bot.modelSource, ...stages(bot.modelEvidence)];
    const modelText = bot => t`${bot.runtime || '—'} · ${bot.connectionSlug || '—'} / ${bot.model || '—'} · 期望 ${bot.expectedModel || '—'} · ${origin(bot.modelSource)} · 读回 ${readback(bot.modelEvidence)} · 会话加载 ${runtime(bot.modelEvidence)}`;
    if (!same(modelInfo(left), modelInfo(right)))
      rows.push(['model', t('模型路由'), modelText(left), modelText(right)]);

    for (const kind of known ? ['skills', 'mcp'] : []) {
      const sides = [left, right].map(bot => new Map(bot.resources[kind].map(entry => [entry.name, entry])));
      for (const name of new Set(sides.flatMap(side => [...side.keys()]))) {
        const entries = sides.map(side => side.get(name));
        const facts = entry => entry && [entry.source, entry.status, ...stages(entry.evidence)];
        if (same(...entries.map(facts))) continue;
        const detail = entry => entry ? t`${origin(entry.source)} · 读回：${readback(entry.evidence)} · 会话加载：${runtime(entry.evidence)}` : t('无插件分配');
        rows.push([kind, t`${featureLabel(kind)} · ${name}`, ...entries.map(detail)]);
      }
    }
    if (equipment.every(Boolean)) {
      const sides = equipment.map(entries => new Map(entries.map(item => [item.slug, item])));
      for (const slug of new Set(sides.flatMap(side => [...side.keys()]))) {
        const rules = sides.map(side => {
          const policy = side.get(slug);
          return policy && [policy.allow.slice().sort(), policy.deny.slice().sort()];
        });
        if (same(...rules)) continue;
        const detail = policy => policy ? t`允许 ${policy[0].length ? joinMessages(policy[0]) : '—'} · 拒绝 ${policy[1].length ? joinMessages(policy[1]) : '—'}` : t('未配备');
        rows.push(['accountConnectors', t`账户工具 · ${slug}`, ...rules.map(detail)]);
      }
    }
    const instructionDiff = left.instructionRevision !== right.instructionRevision;
    if (instructionDiff || !same(stages(left.instructionEvidence), stages(right.instructionEvidence))) {
      const detail = bot => t`${instructionDiff ? t('追加指令配置不同') : t('追加指令配置一致')} · 读回：${readback(bot.instructionEvidence)} · 会话加载：${runtime(bot.instructionEvidence)}`;
      rows.push(['instructions', t('指令'), detail(left), detail(right)]);
    }
    return rows;
  }
  async function runComparison(withVerification = false) {
    if (comparing) return;
    const ids = [leftPick.value, rightPick.value];
    if (!ids.every(Boolean) || ids[0] === ids[1]) {
      setText(compareInfo, t('请选择两个不同的 Bot。'));
      return;
    }
    comparing = true;
    output.replaceChildren();
    setText(compareInfo, t(withVerification ? '正在读回核验配置…' : '正在读取两台 Bot 的配置…'));
    try {
      if (withVerification) await verify();
      const [data, ...equipment] = await Promise.all([readInspection(), ...ids.map(id =>
        ducoroApi('equipment?id=' + encodeURIComponent(id)).then(rows => Array.isArray(rows) && rows.every(row =>
          typeof row.slug === 'string' && [row.allow, row.deny].every(tools => Array.isArray(tools) && tools.every(tool => typeof tool === 'string'))) ? rows : null).catch(() => null),
      )]);
      if (ids[0] !== leftPick.value || ids[1] !== rightPick.value) return;
      const bots = ids.map(id => data.bots.find(bot => bot.id === id));
      if (!bots.every(Boolean)) throw DucoroI18n.error(t('所选 Bot 已不在列表中，请刷新后重选。'));
      const unknown = !data.assignmentsKnown || !equipment.every(Boolean);
      const rows = compareRows(...bots, equipment, data.assignmentsKnown);
      setText(compareInfo, t`读取时间 ${dateTime(data.updatedAt)} · ${data.evidenceAt ? t`最近核验 ${dateTime(data.evidenceAt)}` : t('暂无本轮核验记录')}`);
      if (!data.assignmentsKnown) output.append(el('p', t('资源分配暂不可核实。')));
      if (!equipment.every(Boolean)) output.append(el('p', t('至少一台 Bot 的账户工具权限读取失败。')));
      if (bots.some(bot => bot.unavailable.length)) output.append(el('p', t('至少一台 Bot 选择的资源当前不可用。')));
      if (!rows.length) output.append(el('p', t(unknown ? '已读取的项目暂无差异。' : '本次读取未发现差异。')));
      for (const [kind, title, ...values] of rows) {
        const section = el('section');
        section.className = 'preview-bot';
        const pair = el('div');
        pair.className = 'comparison-grid inspector-pair';
        for (const [index, bot] of bots.entries()) {
          const cell = el('div');
          cell.append(el('strong', bot.name), el('p', values[index]), jump(bot.id, kind));
          pair.append(cell);
        }
        section.append(el('h3', title), pair);
        output.append(section);
      }
    } catch (error) { setText(compareInfo, errorText(error)); }
    finally { comparing = false; }
  }
  for (const picker of [leftPick, rightPick]) picker.onchange = () => {
    output.replaceChildren();
    setText(compareInfo, t('选择完成后点击「比较」。'));
  };
  compare.append(controls(leftPick, rightPick, button('比较', () => runComparison()), button('核验并比较', () => runComparison(true))), compareInfo, output);
  compare.addEventListener('toggle', () => { if (compare.open) updateBotChoices(); });
  document.addEventListener('ducoro-inventory', updateBotChoices);

  const trialCard = card('方案试用');
  const trialInfo = status(), trialResults = el('div');
  let trialKey, trialBusy = false;
  function updateTrial() {
    const saved = DucoroWorkspace.saved();
    const trial = saved?.planTrial;
    const key = JSON.stringify(trial ?? null);
    trialCard.hidden = !trial;
    if (key !== trialKey) {
      trialKey = key;
      trialResults.replaceChildren();
      if (trial) {
        trialCard.open = true;
        trialResults.append(el('p', t('已保存 · 写入与读回：等待核验 · 会话加载：待核实')));
      }
    }
    if (!trial) return;
    const bot = DucoroResources.bots.find(item => item.id === trial.botId);
    setText(trialInfo, t`试用方案「${trial.candidate.name ?? trial.planId}」 · ${bot?.name ?? trial.botId}`);
  }
  const finish = promote => {
    try {
      if (DucoroWorkspace.dirty()) throw DucoroI18n.error(t('请先保存或撤销其他草稿，再处理试用方案。'));
      const draft = DucoroWorkspace.collect();
      const trial = draft.planTrial;
      if (!trial) return;
      if (promote) draft.botPlansCatalog[trial.planId] = trial.candidate;
      draft.planTrial = null;
      DucoroWorkspace.stage(draft);
      setText(trialInfo, t(promote ? '推广已加入草稿，请预览并保存。' : '结束试用已加入草稿，请预览并保存。'));
    } catch (error) { setText(trialInfo, errorText(error)); }
  };
  async function verifyTrial() {
    if (trialBusy) return;
    const saved = DucoroWorkspace.saved();
    const trial = saved?.planTrial;
    if (!trial) return;
    const key = trialKey;
    trialBusy = true;
    trialResults.replaceChildren(el('p', t('正在读取并核验试用配置…')));
    try {
      const result = await verify();
      if (key !== trialKey) return;
      const formal = saved.botPlansCatalog[trial.planId];
      const kinds = ['model', 'mcp', 'skills', 'instructions'].filter(kind =>
        JSON.stringify(formal[kind]) !== JSON.stringify(trial.candidate[kind]));
      const rows = result.rows.filter(row =>
        kinds.includes(row.feature === 'models' ? 'model' : row.feature) &&
        (row.resource?.scope ?? row.target) === trial.botId);
      trialResults.replaceChildren(el('p', t`配置已保存 · 核验时间 ${dateTime(result.updatedAt)}`));
      for (const row of rows) trialResults.append(el('p',
        t`${featureLabel(row.feature)} ${row.resource?.name ?? ''}${row.resource?.retained === false ? t('（撤销）') : ''} · 写入：${row.stages?.written === 'confirmed' ? t('已确认') : t('待核实')} · 读回：${readback(row.stages)} · 会话加载：${runtime(row.stages)}`));
      if (!rows.length) trialResults.append(el('p', t('本次未取得试用 Bot 的写入或读回证据。')));
      trialResults.append(el('p', t('请在 Ducoro 打开此 Bot 的新会话，确认本次试用的改动已加载。')));
    } catch (error) {
      if (key === trialKey) trialResults.replaceChildren(el('p', errorText(error)));
    } finally { trialBusy = false; }
  }
  trialCard.append(trialInfo, trialResults, controls(
    button('核验试用 Bot', verifyTrial),
    button('推广到其余 Bot', () => finish(true)),
    button('结束试用并恢复原方案', () => finish(false)),
  ));
  document.addEventListener('ducoro-configuration-saved', () => {
    inspection = null;
    matches.replaceChildren();
    output.replaceChildren();
    setText(reverseInfo, t('配置已保存，请刷新资源分配。'));
    setText(compareInfo, t('配置已保存，请重新比较。'));
  });
  document.addEventListener('ducoro-workspace', updateTrial);
  document.addEventListener('ducoro-inventory', updateTrial);
  updateTrial();
})();

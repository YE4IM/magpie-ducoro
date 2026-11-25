import assert from 'node:assert/strict';
import test from 'node:test';
import '../ui/i18n.js';
import '../ui/defaults.js';
import '../ui/model.js';

const { languageFor, localizeVerificationRow, message, render, settingLabel, translate } = globalThis.DucoroI18n;

test('draft comparison fills new defaults and detects actual option changes', async () => {
  await globalThis.DucoroUIReady;
  const { matchesDraftBase, optionsForDisplay } = globalThis.DucoroUI;
  const baseline = optionsForDisplay({ botInstructions: { 'agt-a': 'First', 'agt-b': 'Second' } });
  const { planTrial, ...olderBase } = baseline;
  olderBase.botInstructions = { 'agt-b': 'Second', 'agt-a': 'First' };
  assert.equal(matchesDraftBase(olderBase, baseline), true);
  assert.equal(matchesDraftBase({ ...olderBase, connectionSlug: 'other' }, baseline), false);
  assert.equal(matchesDraftBase({ ...olderBase, botInstructions: {} }, baseline), false);
});

test('English workflow labels and accessibility names follow the host language', () => {
  for (const [source, expected] of [
    ['按资源反查 Bot', 'Find Bots by resource'],
    ['按名称或 ID 筛选 Bot', 'Filter Bots by name or ID'],
    ['对比两个 Bot', 'Compare two Bots'],
    ['选择试用 Bot', 'Select a trial Bot'],
    ['先让一个 Bot 试用', 'Try with one Bot'],
    ['推广到其余 Bot', 'Roll out to remaining Bots'],
    ['结束试用并恢复原方案', 'End trial and restore original plan'],
  ]) {
    assert.equal(translate(source, 'en-GB'), expected);
    assert.equal(translate(source, 'zh-Hant'), source);
  }
  assert.equal(render(settingLabel('planTrial'), 'en'), 'Plan trial');
  assert.equal(languageFor('fr-FR'), 'en');
});

test('verification text can be rendered in either language after being read from the service', () => {
  const missingEvidence = '缺少确认已撤销所需的 Ducoro 资源列表或原资源标识。';
  const row = {
    target: '校对助手',
    resource: { name: '术语检查' },
    message: '已读取配置并核验一致', missingEvidence,
    nextStep: '请在下一轮会话确认此资源已加载。',
    permissionEvidence: '正文与仅所有者可访问的文件权限均一致。',
  };
  const english = JSON.parse(JSON.stringify(localizeVerificationRow(row, 'en')));
  for (const field of ['message', 'missingEvidence', 'nextStep', 'permissionEvidence']) {
    assert.doesNotMatch(english[field], /[\u3400-\u9fff]/u);
    assert.equal(render(english[field + 'Message'], 'zh'), row[field]);
  }
  assert.equal(english.target, '校对助手');
  assert.deepEqual(english.resource, row.resource);
  assert.equal(render(message('试用方案「{0}」 · {1}', ['写作方案', '校对助手']), 'en'), 'Trial plan "写作方案" · 校对助手');
});

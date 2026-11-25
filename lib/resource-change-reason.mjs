import { source } from './plan-rules.mjs';
import '../ui/i18n.js';

const { message } = globalThis.DucoroI18n;

function selectionLabel(options, effective, kind, scope) {
  const selection = effective.resourceAssignments?.[scope]?.[kind];
  const origin = source(options, scope, kind);
  if (selection === undefined || origin.type === 'global') return message('继承资源库勾选');
  if (!selection.length) return message('不分配');
  if (origin.type === 'plan') return message('继承方案 {0}', [origin.plan]);
  return message('Bot 自定义分配');
}

export function removalReason({ kind, scope, name, library, options, sourceOptions, currentOptions, currentSourceOptions, scopes, exported }) {
  const connector = kind === 'mcp';
  if (!options[connector ? 'syncMcp' : 'syncSkills']) return message('已关闭{0}同步。', [message(connector ? '连接器' : '技能')]);
  if (connector && options.syncLibraryMcp === false) return message('已关闭资源库连接器同步。');

  const key = connector ? 'mcpScope' : 'skillsScope';
  if (!scopes.includes(scope)) {
    if (options[key] !== currentOptions[key]) {
      const scopeLabel = value => value === 'global' ? message('全局') : value === 'agents' ? message('按 Bot') : value;
      return message('分配范围由「{0}」改为「{1}」，原范围将撤销此资源。', [scopeLabel(currentOptions[key]), scopeLabel(options[key])]);
    }
    return message('此 Bot 当前不在同步目标范围，原分配将撤销。');
  }

  const selection = options[key] === 'agents' ? options.resourceAssignments?.[scope]?.[kind] : undefined;
  if (selection && !selection.includes(name)) {
    const before = selectionLabel(currentSourceOptions, currentOptions, kind, scope);
    const after = selectionLabel(sourceOptions, options, kind, scope);
    if (before.$ducoroMessage !== after.$ducoroMessage || JSON.stringify(before.values) !== JSON.stringify(after.values))
      return message('分配由「{0}」改为「{1}」，因此撤销此资源。', [before, after]);
    return message('「{0}」的当前资源列表未包含此项。', [after]);
  }
  const item = library[kind]?.find(item => item.name === name);
  if (!item) return message('此资源已从 Magpie 资源库移除。');
  if (item.offHere || item.disabled || item.enabled === false) return message('此资源在 Magpie 资源库已停用。');
  if (!item.agents?.includes('ducoro')) return message('资源库已取消将此资源分配给 Ducoro。');
  const definition = exported?.mcpServers?.[name];
  if (connector && (definition?.disabled === true || definition?.enabled === false))
    return message('Magpie 导出的连接器已停用。');
  return message('此资源已不在当前有效分配中。');
}
